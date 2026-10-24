<template>
  <div :class="['state-view', `state-view-${type}`]">
    <div class="state-view-inner">
      <component :is="iconComp" class="state-view-icon" size="4em" stroke-width="1.2" />
      <p class="state-view-title">{{ title }}</p>
      <p v-if="description" class="state-view-desc">{{ description }}</p>
      <div v-if="actionText || $slots.action" class="state-view-action">
        <slot name="action">
          <t-button theme="primary" variant="outline" @click="$emit('action')">{{ actionText }}</t-button>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="tsx">
import { ErrorCircleIcon, OutboxIcon } from 'tdesign-icons-vue-next';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    // empty: 还没配置/没有内容; error: 请求失败
    type?: 'empty' | 'error';
    title: string;
    description?: string;
    actionText?: string;
    // 传字符串时按名称映射到内置图标，避免调用方自己引 tdesign 图标组件
    icon?: 'box' | 'error';
  }>(),
  {
    type: 'empty',
    description: '',
    actionText: '',
    icon: undefined,
  },
);

defineEmits<{ action: [] }>();

// 图标必须用真实组件渲染：<t-icon name> 依赖 CDN sprite，离线/严格 CSP 下会是空白
const iconComp = computed(() => {
  if (props.icon === 'error') return ErrorCircleIcon;
  if (props.icon === 'box') return OutboxIcon;
  return props.type === 'error' ? ErrorCircleIcon : OutboxIcon;
});
</script>

<style lang="less" scoped>
.state-view {
  width: 100%;
  min-height: 320px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  box-sizing: border-box;

  .state-view-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 460px;
    text-align: center;
  }

  .state-view-icon {
    color: var(--td-text-color-placeholder);
    margin-bottom: var(--td-comp-margin-l);
  }

  .state-view-title {
    font: var(--td-font-title-medium);
    color: var(--td-text-color-primary);
    margin: 0;
    font-size: 16px;
  }

  .state-view-desc {
    margin: var(--td-comp-margin-s) 0 0;
    font: var(--td-font-body-medium);
    color: var(--td-text-color-secondary);
    line-height: 22px;
  }

  .state-view-action {
    margin-top: var(--td-comp-margin-xl);
  }

  &.state-view-error .state-view-icon {
    color: var(--td-error-color);
  }
}
</style>
