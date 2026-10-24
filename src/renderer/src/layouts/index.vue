<template>
  <div class="layout">
    <t-layout>
      <t-aside key="side" :class="`${prefix}-aside`">
        <layout-side-nav :nav-data="sideMenu" />
      </t-aside>
      <t-layout>
        <t-header height=60 :class="`${prefix}-header`">
          <layout-header />
        </t-header>
        <t-content :class="`${prefix}-content`">
          <layout-content />
        </t-content>
      </t-layout>
    </t-layout>

    <!-- 静默检查发现新版本时的全局提示：不打断当前操作，点「查看」跳设置页并自动打开更新对话框 -->
    <div v-if="silentUpdate" class="layout-update-tip">
      <span class="layout-update-text">{{ $t('pages.setting.update.silentFound', [silentUpdate]) }}</span>
      <t-button size="small" theme="primary" variant="text" @click="goUpdateSetting">
        {{ $t('pages.setting.update.view') }}
      </t-button>
      <t-button size="small" theme="default" variant="text" @click="silentUpdate = ''">
        {{ $t('pages.setting.update.ignore') }}
      </t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/style/layout.less';

import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { prefix } from '@/config/global';
import { usePermissionStore } from '@/store';

import LayoutContent from './components/Content.vue';
import LayoutHeader from './components/Header.vue';
import LayoutSideNav from './components/SideNav.vue';

const permissionStore = usePermissionStore();
const { routers: menuRouters } = storeToRefs(permissionStore);

const sideMenu = computed(() => {
  const newMenuRouters = menuRouters.value;
  return newMenuRouters;
});

const router = useRouter();

// 启动时主进程会静默查一次更新，命中新版本才推这个通道；
// 用户手动点「检查更新」走的是 setting 页的对话框，不会触发这里
const silentUpdate = ref('');

const handleSilentUpdate = (_event: unknown, info: { version?: string }) => {
  if (silentUpdate.value) return; // 同一次运行只提示一次
  silentUpdate.value = info?.version || '';
};

onMounted(() => {
  window.electron.ipcRenderer.on('update-available-silent', handleSilentUpdate);
});

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('update-available-silent');
});

const goUpdateSetting = () => {
  silentUpdate.value = '';
  // 设置页读 update=1 会自动打开更新对话框
  router.push({ path: '/setting/index', query: { update: '1' } });
};
</script>

<style lang="less" scoped>
// .t-layout {
//   overflow-x: hidden;
// }

.layout-update-tip {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
  align-items: center;
  padding: 8px 10px 8px 14px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);

  .layout-update-text {
    margin-right: 6px;
    font-size: 13px;
    color: var(--td-text-color-primary);
  }
}
</style>
