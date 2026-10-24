import { Loading as TLoading } from 'tdesign-vue-next';

import lazyImg from '@/assets/lazy.png';

// t-image 的 loading / error 占位。
// 之前 Film、Iptv、History、Binge 四个页面都让两者返回同一张 lazy.png，
// 用户分不清「还在加载」和「这张图挂了」。
// loading 用灰色骨架块 + 转圈，零额外请求；不用 assets/loading.gif 是因为它有 719KB，
// 列表里几百个格子同时加载同一个 gif 并不比骨架块便宜。
const placeholderStyle =
  'width: 100%; height: 100%; min-height: 60px; display: flex; align-items: center;' +
  ' justify-content: center; background: var(--td-bg-color-container-hover, #f3f3f3);';

export const renderImageLoading = () => (
  <div style={placeholderStyle}>
    <TLoading size="18px" />
  </div>
);

export const renderImageError = () => (
  <div style={placeholderStyle}>
    <img src={lazyImg} style="width: 100%; height: 100%; object-fit: cover;" />
  </div>
);
