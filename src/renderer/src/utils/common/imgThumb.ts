// 列表海报缩略图 URL 包装。
//
// 【已关闭，默认直连原图】v1.3.0 曾把列表海报统一改走主进程 /api/v1/img/thumb 代理，
// 但实测暴露出两个致命问题，导致封面大面积长时间「加载中」：
//   1. 一屏 20~40 张图全部收敛到 127.0.0.1:9978 这**同一个 host**，撞上 HTTP/1.1
//      的六连接上限，必须排队（v1.2.0 直连时图片分散在几十个图床域名，各自 6 并发）。
//   2. 未命中缓存时代理返回 302 让浏览器直连原图，图床慢就长时间 pending（骨架一直转），
//      图床防盗链则直接 403 —— 主进程抓图是带正确 Referer 的，浏览器直连不带。
// 因此回退为直连原图（v1.2.0 行为），优先保证「加载快、不出错」。
// 代理实现（主进程 routes/img.ts）保留未删，未来若要重启需先解决上述两点。
const USE_PROXY = false;

const THUMB_BASE = 'http://127.0.0.1:9978/api/v1/img/thumb';

// 已经是我们自己代理出来的 URL，不再二次包装（避免嵌套编码）
const isThumbUrl = (url: string) => url.includes('/api/v1/img/thumb');

// 不是可代理的 http(s) 图片（data: / blob: / 相对路径），原样返回
const isRemoteHttp = (url: string) => /^https?:\/\//i.test(url);

/**
 * 把原图 URL 包装成指定宽度的缩略图 URL。
 * @param url 原图地址
 * @param width 目标宽度（px），默认 280，与列表卡片实际显示宽度匹配
 */
export function thumb(url: string | undefined | null, width = 280): string {
  if (!url) return '';
  if (!USE_PROXY) return url;
  if (!isRemoteHttp(url) || isThumbUrl(url)) return url;
  return `${THUMB_BASE}?url=${encodeURIComponent(url)}&w=${width}`;
}
