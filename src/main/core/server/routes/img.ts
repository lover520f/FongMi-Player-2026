import { FastifyReply, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';
import { join } from 'path';
import { app, nativeImage } from 'electron';
import fs from 'fs-extra';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const API_VERSION = 'api/v1';

// 海报缩略图磁盘缓存目录（相对 userData），按 url+宽度 哈希命名，避免重复抓取+压缩
const CACHE_DIR = join(app.getPath('userData'), 'cache', 'img');
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天
const FETCH_TIMEOUT = 10000; // 抓原图超时
const MAX_THUMB_WIDTH = 640; // 最大缩略宽度，防止被传超大值打爆内存
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024; // 原图超过 8MB 直接放弃，防止内存被打爆
const BUILD_CONCURRENCY = 6; // 后台预热并发：不抢浏览器的带宽，慢慢把缓存填满
const JPEG_QUALITY = 82;

// jimp 是纯 JS 图片库（零原生依赖），在 electron 打包里无需重建。
// 现在它只作为 nativeImage 解不了的格式（如 webp）的兜底。
// 动态 import + 后台预热：否则首个兜底请求会卡在 ~150ms 的 jimp 冷启动上。
const loadJimp = async () => (await import('jimp')).default;
let jimpReady: Promise<unknown> | null = null;
const warmJimp = () => {
  if (!jimpReady) {
    // 故意在后台慢慢加载，不 await，失败也不抛出
    jimpReady = loadJimp().catch(() => null);
  }
  return jimpReady;
};

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

// 缓存命中：文件存在且未过期
const cacheHit = (filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && Date.now() - stat.mtimeMs < CACHE_MAX_AGE;
  } catch {
    return false;
  }
};

// 主动清理过期缓存（低频触发，避免无限膨胀）
let lastSweep = 0;
const sweepIfNeeded = async () => {
  if (Date.now() - lastSweep < 60 * 60 * 1000) return; // 每小时最多扫一次
  lastSweep = Date.now();
  try {
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    for (const f of files) {
      const p = join(CACHE_DIR, f);
      try {
        const s = await fs.stat(p);
        if (now - s.mtimeMs > CACHE_MAX_AGE) await fs.unlink(p);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
};

// 用原生 http/https 抓二进制。不设 agent，因此不会走 HTTP_PROXY/HTTPS_PROXY
// 环境变量——很多用户的机器上可能残留代理，走代理会导致图片抓取失败。
// 同时做超时 + 体积上限 + 状态码校验，避免被异常源拖垮。
const MAX_REDIRECTS = 5; // 302 重定向上限，异常图床的循环重定向不能无限递归

const fetchBuffer = (url: string): Promise<Buffer> => fetchBufferInner(url, 0);

const fetchBufferInner = (url: string, redirects: number): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    // 请求级与响应级共用一次 settle 判定：req.destroy() 会触发 ECONNRESET 的 error
    // 事件，若不拦截会在已 reject（超时/体积超限）后再回调一次；Promise 虽只认
    // 第一次，但保持语义干净，且避免误触 res.on('error') 里未定义的路径。
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
    };

    const req = lib.get(
      u,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: `${u.protocol}//${u.host}/`,
        },
      },
      (res) => {
        // 跟随重定向（很多图床 302 到 CDN），但设上限防止循环重定向无限递归
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            finish(new Error('too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          fetchBufferInner(next, redirects + 1).then(resolve, finish);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          finish(new Error(`upstream ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > MAX_UPSTREAM_BYTES) {
            // 体积超限：先断连接再 settle，destroy 触发的 error 会被 settled 拦截
            req.destroy();
            res.destroy();
            finish(new Error('image too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve(Buffer.concat(chunks));
        });
        res.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
      },
    );
    req.setTimeout(FETCH_TIMEOUT, () => {
      req.destroy();
      finish(new Error('fetch timeout'));
    });
    req.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
  });
};

// —— 生成缩略图：抓原图 → 缩放 → 统一编码成 JPEG。
//
// 优先用 electron 自带的 nativeImage（C++ 实现）；解不出来的格式再回退 jimp。
// 实测列表海报常见是 443x714 / 579KB 这种「分辨率不大但没压缩」的原图，
// 缩到 280px 宽后只有 20~30KB，卡片显示的清晰度基本无损。
// 两种解码器都解不了时抛 UnsupportedFormat，由调用方区分「格式不行」和「网络临时失败」。
class UnsupportedFormat extends Error {}

const buildThumb = async (url: string, w: number): Promise<Buffer> => {
  const body = await fetchBuffer(url);

  try {
    const img = nativeImage.createFromBuffer(body);
    if (!img.isEmpty()) {
      const { width } = img.getSize();
      const out = width > w ? img.resize({ width: w, quality: 'good' }).toJPEG(JPEG_QUALITY) : img.toJPEG(JPEG_QUALITY);
      if (out.length) return out;
    }
  } catch {
    /* 落到 jimp 兜底 */
  }

  try {
    const Jimp = await loadJimp();
    const image = await Jimp.read(body);
    if (image.getWidth() > w) image.resize(w, Jimp.AUTO);
    image.quality(JPEG_QUALITY);
    return await image.getBufferAsync(Jimp.MIME_JPEG);
  } catch {
    throw new UnsupportedFormat('cannot decode image');
  }
};

// 并发池：限制同时进行的「下载 + 缩放」，保护主进程和网络，不设太大否则几十张
// 4K 原图同时进内存。
let active = 0;
const waiting: Array<() => void> = [];
const acquire = () =>
  new Promise<void>((resolve) => {
    if (active < BUILD_CONCURRENCY) {
      active++;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else active--;
};

// 同一张图可能被列表里多处引用（同一部剧出现在多个源），共享同一次生成
const inflight = new Map<string, Promise<unknown>>();

// nativeImage 解不了 webp（实测 isEmpty），jimp 0.22 也不支持，这类图预热必然失败。
// 记下来别再重试：否则每次刷新列表，同一批 webp 都要被主进程白下载一遍。
// webp 本身已经压得很小（实测 17KB），直连原图并不吃亏。
const unsupported = new Set<string>();
const UNSUPPORTED_MAX = 2000;

// 后台预热：抓原图 → 缩放 → 写缓存。
// 返回 true 表示「格式不支持，别再试了」；网络类失败返回 false，下次还会重试。
const warmThumb = async (url: string, w: number, cachePath: string): Promise<boolean> => {
  try {
    const out = await buildThumb(url, w);
    await fs.ensureDir(CACHE_DIR);
    await fs.writeFile(cachePath, out);
    sweepIfNeeded();
    return false;
  } catch (err) {
    return err instanceof UnsupportedFormat;
  }
};

const enqueueWarm = (url: string, w: number, cachePath: string) => {
  if (unsupported.has(cachePath)) return; // 这个格式处理不了，别再白下载
  if (inflight.has(cachePath)) return; // 已在预热中
  const task = (async () => {
    await acquire();
    try {
      return await warmThumb(url, w, cachePath);
    } finally {
      release();
    }
  })();
  inflight.set(cachePath, task);
  void task.then((dead) => {
    inflight.delete(cachePath);
    if (!dead) return;
    if (unsupported.size > UNSUPPORTED_MAX) unsupported.clear();
    unsupported.add(cachePath);
  });
};

const api: FastifyPluginAsync = async (fastify): Promise<void> => {
  warmJimp(); // 插件注册即预热 jimp，兜底路径不卡冷启动

  fastify.get(
    `/${API_VERSION}/img/thumb`,
    async (req: FastifyRequest<{ Querystring: { url?: string; w?: string } }>, reply: FastifyReply) => {
      const url = (req.query.url || '').trim();
      const width = parseInt(req.query.w || '', 10);

      // 参数校验
      if (!isHttpUrl(url)) {
        return reply.code(400).send({ code: 400, msg: 'invalid url' });
      }
      const w = Number.isFinite(width) && width > 0 ? Math.min(width, MAX_THUMB_WIDTH) : 280;

      const cacheKey = createHash('md5').update(`${w}::${url}`).digest('hex') + '.jpg';
      const cachePath = join(CACHE_DIR, cacheKey);

      // 命中磁盘缓存 → 直接回小图
      if (cacheHit(cachePath)) {
        try {
          const buf = await fs.readFile(cachePath);
          reply.header('Content-Type', 'image/jpeg');
          reply.header('Cache-Control', 'public, max-age=86400');
          reply.header('Content-Length', buf.length);
          return reply.send(buf);
        } catch {
          /* 读缓存失败，落到下面重新生成 */
        }
      }

      // 未命中缓存 → 立即 302 回原图，同时后台预热。
      //
      // 为什么不在请求里同步生成：那样首次访问要等主进程把原图下载完再缩放，
      // 而浏览器本来可以同时向十几个图床各自并发拉取——实测同步生成反而更慢
      // （一批 8 张 4.6s，直连只要 1.3s）。首次的下载量省不掉，就别让它变差。
      // 预热填好缓存后，同一个 URL 下次直接命中 25KB 的缩略图。
      enqueueWarm(url, w, cachePath);
      return reply.redirect(url);
    },
  );
};

export default api;
