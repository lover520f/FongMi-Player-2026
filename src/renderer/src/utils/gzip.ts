import pako from 'pako';

/**
 * gzip 编解码。
 * 这两个函数只有源编辑页（Sift.vue 的调试内容压缩）会用到，原先挂在 utils/tool.ts 上，
 * 而 tool.ts 是全站引用的公共模块，导致 pako 221KB 被绑进首屏。独立成模块后跟随
 * Sift 的异步 chunk 一起按需加载。
 */
export const encodeGzip = (str: string) => {
  return pako.gzip(str, {});
};

export const decodeGzip = (str: string) => {
  return pako.inflate(str);
};
