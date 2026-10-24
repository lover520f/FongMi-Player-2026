<template>
  <div class="chase view-container">
    <common-nav :title="$t('pages.chase.name')" :list="chaseNav" :active="active.nav" @change-key="changeChaseEvent" />
    <div class="content">
      <div class="container">
        <!-- 去掉 transition name="fade" mode="out-in"：本组件 scoped 样式里没有定义 .fade-*，
             这个 transition 实际没有任何淡入淡出动画；而 mode="out-in" 会让 keep-alive 切换
             tab 时「旧组件先卸载、新组件再挂载」，中间必然出现约 2 帧（~40ms）的空白。 -->
        <keep-alive>
          <component :is="componentMap[active.nav]" class="content-wrapper"></component>
        </keep-alive>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, reactive } from 'vue';

import { t } from '@/locales';

const componentMap = {
  'binge': defineAsyncComponent(() => import('./chase/binge/Binge.vue')),
  'history': defineAsyncComponent(() => import('./chase/history/History.vue')),
};

const active = reactive({
  nav: 'history',
});

const chaseNav = computed(() => {
  return [
    {
      id: 'history',
      name: t('pages.chase.history.title')
    }, {
      id: 'binge',
      name: t('pages.chase.binge.title')
    }
  ]
});

const changeChaseEvent = (item: string) => {
  active.nav = item;
};
</script>

<style lang="less" scoped>
.view-container {
  height: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  position: relative;
  overflow: hidden;

  .content {
    min-width: 750px;
    position: relative;
    padding: var(--td-comp-paddingTB-xs) var(--td-comp-paddingTB-s);
    background-color: var(--td-bg-color-container);
    border-radius: var(--td-radius-default);
    flex: 1;
    display: flex;
    flex-direction: column;

    .container {
      flex: 1;
      height: 100%;
      width: 100%;

      .content-wrapper {
        width: 100%;
        height: 100%;
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
      }
    }
  }

  &-dialog {
    :deep(.t-dialog__body) {
      text-align: center;
    }
  }
}
</style>
