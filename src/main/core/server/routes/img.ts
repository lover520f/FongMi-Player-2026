import { FastifyReply, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';
import { join } from 'path';
import { app } from 'electron';
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
const WARM_CONCURRENCY = 3; // 异步预热并发上限，避免几十张图同时压缩打爆主进程

// jimp 是纯 JS 图片库（零原生依赖），在 electron 打包里无需重建。
// 这里用动态 import，并做一次后台预热：否则首个缩略请求会卡在 ~150ms 的
// jimp 冷启动上。预热失败不影响主流程（路由会兜底回原图）。
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

// —— 异步预热：未命中缓存时，先在后台把原图抓下来压缩好写进缓存。
// 请求本身立刻 302 回原图（不阻塞），预热完成后下次再访问就走缓存小图。

// 内存态去重：正在预热中的 key，避免同一张图被列表里多个引用重复触发。
const inflight = new Set<string>();
// 简单并发池：限制同时进行的压缩任务数，保护主进程不被几十张图打爆。
let active = 0;
const queue: Array<() => void> = [];

const acquireSlot = () =>
  new Promise<void>((resolve) => {
    if (active < WARM_CONCURRENCY) {
      active++;
      resolve();
    } else {
      queue.push(resolve);
    }
  });
const releaseSlot = () => {
  const next = queue.shift();
  if (next) next();
  else active--;
};

// 抓原图 → 压缩 → 写缓存。全程 try/catch，任何失败都静默（路由已兜底回原图）。
const warmThumb = async (url: string, w: number, cachePath: string) => {
  try {
    const body = await fetchBuffer(url);
    const Jimp = await loadJimp();
    const image = await Jimp.read(body);
    const targetW = image.getWidth() > w ? w : image.getWidth();
    image.resize(targetW, Jimp.AUTO);
    image.quality(80);
    const out = await image.getBufferAsync(Jimp.MIME_JPEG);
    await fs.ensureDir(CACHE_DIR);
    await fs.writeFile(cachePath, out);
    sweepIfNeeded();
  } catch {
    /* 预热失败静默忽略，下次请求会再试 */
  }
};

const enqueueWarm = (url: string, w: number, cachePath: string) => {
  if (inflight.has(cachePath)) return; // 已在预热中
  inflight.add(cachePath);
  acquireSlot().then(() =>
    warmThumb(url, w, cachePath).finally(() => {
      inflight.delete(cachePath);
      releaseSlot();
    }),
  );
};

const api: FastifyPluginAsync = async (fastify): Promise<void> => {
  warmJimp(); // 插件注册即预热 jimp，避免首个请求卡冷启动

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

      // 命中缓存 → 直接回小图
      if (cacheHit(cachePath)) {
        try {
          const buf = await fs.readFile(cachePath);
          reply.header('Content-Type', 'image/jpeg');
          reply.header('Cache-Control', 'public, max-age=86400');
          reply.header('Content-Length', buf.length);
          return reply.send(buf);
        } catch {
          /* 读缓存失败，落到下面的原图兜底 */
        }
      }

      // 未命中缓存 → 立即 302 回原图（浏览器直接并发拉原图，冷加载不卡），
      // 同时后台异步预热，下次再访问就走缓存小图。
      enqueueWarm(url, w, cachePath);
      return reply.redirect(url);
    },
  );
};

export default api;
