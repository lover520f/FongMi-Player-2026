<template>
  <router-view></router-view>
  <!-- 免责声明只在没同意过协议时才有内容可显示，已同意的用户不该为它下载 markdown-it -->
  <component :is="disclaimerView" v-if="disclaimerView" v-model:visible="isVisible.dialogDisclaimer" />
</template>

<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core';
import { computed, defineAsyncComponent, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import type { Component } from 'vue';

import { localeConfigKey } from '@/locales/index';
import { useLocale } from '@/locales/useLocale';
import { usePlayStore, useSettingStore } from '@/store';
import { setup } from '@/api/setting';
import PLAY_CONFIG from '@/config/play';

const storePlayer = usePlayStore();
const storeSetting = useSettingStore();
const { changeLocale } = useLocale();

const isVisible = reactive({
  dialogDisclaimer: false,
});

// 免责声明整页只有首次启动（未同意协议）才需要，含 markdown-it 全家桶约 360KB。
// 用 defineAsyncComponent 而不是静态 import，已同意协议的用户永远不会下载它。
const disclaimerView = shallowRef<Component | null>(null);

const theme = computed(() => {
  return storeSetting.getStateMode;
});

const webdev = computed(() => {
  return storeSetting.webdev;
});

const intervalId = ref();

watch(
  () => webdev.value,
  (val) => {
    if (intervalId.value) clearInterval(intervalId.value);
    if (val.sync) {
      intervalId.value = setInterval(
        async () => {
          // webdav 客户端约 140KB，只在真的开启同步且到点时才有用，没必要进首屏
          const { autoSync } = await import('@/utils/webdev');
          autoSync(val.data.url, val.data.username, val.data.password);
        },
        1000 * 5 * 60,
      );
    }
  },
  { deep: true },
);
watch(
  () => storeSetting.displayMode,
  (val) => {
    const isDarkMode = val === 'dark';
    document.documentElement.setAttribute('theme-mode', isDarkMode ? 'dark' : '');
  },
);
watch(
  () => useLocalStorage(localeConfigKey, 'zh_CN').value,
  (val) => {
    changeLocale(val);
  },
);

onMounted(() => {
  initConfig();
});

const initConfig = async () => {
  const { agreementMask, theme, playerMode, webdev, barrage, timeout } = await setup();

  storeSetting.updateConfig({ mode: theme });
  storeSetting.updateConfig({ webdev: webdev });
  storeSetting.updateConfig({ timeout: timeout || 5000 });

  if (!agreementMask) {
    isVisible.dialogDisclaimer = true;
    disclaimerView.value = defineAsyncComponent(() => import('@/pages/Disclaimer.vue'));
  }

  const init = {
    ...PLAY_CONFIG.setting,
  };
  init.playerMode = playerMode;
  init.barrage = barrage;
  storePlayer.updateConfig({ setting: init });
};

window.electron.ipcRenderer.on('system-theme-updated', (_, activeTheme) => {
  if (theme.value === 'auto') {
    const themeMode = activeTheme === 'dark' ? 'dark' : '';
    document.documentElement.setAttribute('theme-mode', themeMode);
    console.log(`system-theme-updated: ${activeTheme}`);
  }
});
</script>
