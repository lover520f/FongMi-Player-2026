// 列表海报缩略图 URL 包装。
//
// 为什么走本机代理：列表卡片只显示 200~300px 宽，但源站海报常常是没压缩过的原图
// （实测 443x714 的图就有 579KB 一张）。直连意味着每台机器首次访问都要把几十张
// 原图整个拉下来，还要跨十几个图床做 DNS/TCP/TLS 握手——滚动时就是一屏一屏地转圈。
// 代理把它缩到 280px 宽再返回，单张 20~30KB，并落盘缓存 7 天，二次访问直接命中。
//
// 为什么要用多个端口：浏览器对同一个 origin（scheme + host + port）只有 6 个
// HTTP/1.1 并发连接，几十张图全收敛到 9978 会排队——这正是 v1.3.0 回退代理的原因。
// 主进程在 9978 之外还开了 9988/9989/9990 三个转发端口（见 server/index.ts），
// 这里按图片地址哈希把请求打散到 4 个 origin，合计 24 个并发连接。
const THUMB_BASES = [
  'http://127.0.0.1:9978/api/v1/img/thumb',
  'http://127.0.0.1:9988/api/v1/img/thumb',
  'http://127.0.0.1:9989/api/v1/img/thumb',
  'http://127.0.0.1:9990/api/v1/img/thumb',
];

// 已经是我们自己代理出来的 URL，不再二次包装（避免嵌套编码）
const isThumbUrl = (url: string) => url.includes('/api/v1/img/thumb');

// 不是可代理的 http(s) 图片（data: / blob: / 相对路径），原样返回
const isRemoteHttp = (url: string) => /^https?:\/\//i.test(url);

// 稳定的端口选择：同一个 url 每次都要落在同一个 origin，
// 否则同一张图会在多个端口下各缓存一份，白白多下载一次。
const pickBase = (url: string) => {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  return THUMB_BASES[h % THUMB_BASES.length];
};

/**
 * 把原图 URL 包装成指定宽度的缩略图 URL。
 * @param url 原图地址
 * @param width 目标宽度（px），默认 280，与列表卡片实际显示宽度匹配
 */
export function thumb(url: string | undefined | null, width = 280): string {
  if (!url) return '';
  if (!isRemoteHttp(url) || isThumbUrl(url)) return url;
  return `${pickBase(url)}?url=${encodeURIComponent(url)}&w=${width}`;
}
