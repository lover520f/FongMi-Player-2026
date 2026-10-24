export function useLoading() {
  // 首屏骨架屏：在 Vue 挂载前，用纯 CSS 描出「侧边栏 + 顶栏 + 内容卡片网格」的框架，
  // 让用户从点击图标起就看到接近真实的界面，而不是一个孤零零的转圈。
  // 颜色用中性灰半透明硬编码，不依赖 --td-* 变量（preload 阶段 tdesign 样式可能尚未加载）。
  const styleContent = `
    /* 浅色（默认 / auto 且系统浅色） */
    .app-loading-wrap {
      --al-bg: #f3f4f7;
      --al-surface: rgba(15, 17, 21, 0.06);
      --al-surface-strong: rgba(15, 17, 21, 0.1);
      --al-border: rgba(15, 17, 21, 0.06);
      --al-shimmer: rgba(15, 17, 21, 0.08);
      position: fixed;
      inset: 0;
      display: flex;
      background: var(--al-bg);
      z-index: 999;
      overflow: hidden;
    }
    /* 深色（显式 dark） */
    html[theme-mode='dark'] .app-loading-wrap {
      --al-bg: #0f1115;
      --al-surface: rgba(255, 255, 255, 0.06);
      --al-surface-strong: rgba(255, 255, 255, 0.1);
      --al-border: rgba(255, 255, 255, 0.06);
      --al-shimmer: rgba(255, 255, 255, 0.08);
    }
    /* 深色（auto 且系统深色，此时 theme-mode 尚未设置） */
    @media (prefers-color-scheme: dark) {
      .app-loading-wrap {
        --al-bg: #0f1115;
        --al-surface: rgba(255, 255, 255, 0.06);
        --al-surface-strong: rgba(255, 255, 255, 0.1);
        --al-border: rgba(255, 255, 255, 0.06);
        --al-shimmer: rgba(255, 255, 255, 0.08);
      }
    }
    .app-loading-side {
      flex: 0 0 60px;
      padding: 14px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      border-right: 1px solid var(--al-border);
    }
    .app-loading-side .app-loading-logo {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--al-surface-strong);
      margin-bottom: 6px;
    }
    .app-loading-side .app-loading-ico {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: var(--al-surface);
    }
    .app-loading-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .app-loading-header {
      flex: 0 0 60px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 20px;
      border-bottom: 1px solid var(--al-border);
    }
    .app-loading-header .app-loading-search {
      flex: 1;
      max-width: 360px;
      height: 30px;
      border-radius: 8px;
      background: var(--al-surface);
    }
    .app-loading-header .app-loading-chip {
      width: 64px;
      height: 22px;
      border-radius: 11px;
      background: var(--al-surface);
    }
    .app-loading-content {
      flex: 1;
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 16px;
      align-content: start;
      overflow: hidden;
    }
    .app-loading-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .app-loading-card .app-loading-poster {
      width: 100%;
      aspect-ratio: 10 / 14;
      border-radius: 8px;
      background: var(--al-surface);
    }
    .app-loading-card .app-loading-line {
      height: 12px;
      border-radius: 6px;
      background: var(--al-surface);
    }
    .app-loading-card .app-loading-line.short {
      width: 60%;
    }
    .app-loading-shimmer {
      position: relative;
      overflow: hidden;
    }
    .app-loading-shimmer::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, var(--al-shimmer), transparent);
      animation: app-loading-sweep 1.4s ease-in-out infinite;
    }
    @keyframes app-loading-sweep {
      100% { transform: translateX(100%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .app-loading-shimmer::after { animation: none; }
    }
  `;

  const oStyle = document.createElement('style');
  const oDiv = document.createElement('div');

  oStyle.id = 'app-loading-style';
  oStyle.innerHTML = styleContent;
  oDiv.className = 'app-loading-wrap';

  const icons = Array.from({ length: 7 }, () => '<div class="app-loading-ico app-loading-shimmer"></div>').join('');
  const cards = Array.from(
    { length: 18 },
    () => `
      <div class="app-loading-card">
        <div class="app-loading-poster app-loading-shimmer"></div>
        <div class="app-loading-line app-loading-shimmer"></div>
        <div class="app-loading-line short app-loading-shimmer"></div>
      </div>`,
  ).join('');

  oDiv.innerHTML = `
    <div class="app-loading-side">
      <div class="app-loading-logo app-loading-shimmer"></div>
      ${icons}
    </div>
    <div class="app-loading-main">
      <div class="app-loading-header">
        <div class="app-loading-search app-loading-shimmer"></div>
        <div class="app-loading-chip app-loading-shimmer"></div>
      </div>
      <div class="app-loading-content">${cards}</div>
    </div>`;

  return {
    appendLoading() {
      safe.append(document.head, oStyle);
      safe.append(document.body, oDiv);
    },
    removeLoading() {
      safe.remove(document.head, oStyle);
      safe.remove(document.body, oDiv);
    },
  };
}

const safe = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      return parent.appendChild(child);
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find((e) => e === child)) {
      return parent.removeChild(child);
    }
  },
};
