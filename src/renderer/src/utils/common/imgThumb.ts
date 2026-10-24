// 列表海报缩略图 URL 包装。
//
// 列表页一次渲染几十张第三方源海报，原图往往 500~800px 宽（几百 KB ~ 上 MB），
// 而卡片实际只显示约 280px。滚动时整屏加载原图既费流量又容易卡。
// 这里把原图 URL 包装成主进程的图片缩略代理（/api/v1/img/thumb），由它抓原图
// 压缩成小图并落磁盘缓存；详情页 / 播放页仍直接用原图，保证清晰度。

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
  if (!isRemoteHttp(url) || isThumbUrl(url)) return url;
  return `${THUMB_BASE}?url=${encodeURIComponent(url)}&w=${width}`;
}
