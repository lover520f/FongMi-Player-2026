<template>
  <!-- 首屏/切分类时的占位卡片：断点与影视、直播两页的卡片一致，
       比例由 aspect 传入，数据到达后不会发生列数或高度跳变。
       只渲染 t-col，外层由调用方提供 t-row（它需要接管 gutter）。 -->
  <t-col v-for="i in count" :key="i" :md="3" :lg="3" :xl="2" :xxl="1" class="skeleton-card" aria-hidden="true">
    <div class="skeleton-card-main" :style="{ paddingTop: aspect }">
      <span class="skeleton-shimmer" />
    </div>
    <div class="skeleton-card-footer">
      <span class="skeleton-bar skeleton-bar-title" />
      <span class="skeleton-bar skeleton-bar-desc" />
    </div>
  </t-col>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    // 占位卡片数量
    count?: number;
    // 封面比例，与真实卡片的 padding-top 一致（影视 139.9%、直播 62%）
    aspect?: string;
  }>(),
  {
    count: 12,
    aspect: '139.9%',
  },
);
</script>

<style lang="less" scoped>
.skeleton-card {
  box-sizing: border-box;
  width: inherit;
  position: relative;
}

.skeleton-card-main {
  position: relative;
  width: 100%;
  height: 0;
  overflow: hidden;
  border-radius: 7px;
  background: var(--td-bg-color-component);

  .skeleton-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 20%,
      var(--td-bg-color-component-hover) 40%,
      var(--td-bg-color-component-hover) 60%,
      transparent 80%
    );
    background-size: 220% 100%;
    animation: skeleton-sweep 1.4s ease-in-out infinite;
  }
}

.skeleton-card-footer {
  padding-top: var(--td-comp-paddingTB-s);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-bar {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: var(--td-bg-color-component);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, transparent 20%, var(--td-bg-color-component-hover) 50%, transparent 80%);
    background-size: 220% 100%;
    animation: skeleton-sweep 1.4s ease-in-out infinite;
  }
}

.skeleton-bar-title {
  width: 72%;
  height: 14px;
}

.skeleton-bar-desc {
  width: 46%;
}

@keyframes skeleton-sweep {
  0% {
    background-position: 140% 0;
  }
  100% {
    background-position: -40% 0;
  }
}

// 尊重系统的「减少动态效果」：静态占位仍然比白屏好
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer,
  .skeleton-bar::after {
    animation: none;
  }
}
</style>
