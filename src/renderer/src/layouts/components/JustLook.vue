<template>
  <div class="just-look view-container">
    <t-button theme="default" shape="square" variant="text" @click="toggleDrawerAndHandlePlayer">
      <dvd-icon />
    </t-button>
    <t-drawer
      v-model:visible="isVisible.drawer"
      show-in-attached-element
      :footer="null"
      :attach="`.${prefix}-content`"
      :size-draggable="{ max: 920, min: 320 }"
      size="320px"
      @confirm="change"
      @close="close"
    >
      <div class="content">
        <div id="mse"></div>
        <div class="slide">
          <div class="icon refresh" @click="change">
            <refresh-icon />
          </div>
        </div>
      </div>
    </t-drawer>
  </div>
</template>

<script lang="ts" setup>
import '@/style/player/veplayer.css';

import { MessagePlugin } from 'tdesign-vue-next';
import { DvdIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import { ref, reactive, nextTick } from 'vue';
import Player from 'xgplayer';

import { fetchSettingDetail } from '@/api/setting';
import { prefix } from '@/config/global';
import { t } from '@/locales';

// 与基础设置"恢复默认"一致的随性看接口，设置为空时兜底，避免点开只报"暂无数据"
const DEFAULT_VIEW_CASUAL = 'http://api.yujn.cn/api/zzxjj.php';

const isVisible = reactive({
  drawer: false,
});
const api = ref();
const player = ref();
const config = ref({
  id: 'mse',
  url: '',
  autoplay: true,
  rotate: {
    clockwise: false,
    innerRotate: true,
    index: 1,
  },
  keyboard: {
    keyCodeMap: {
      up: {
        action: function () {
          console.log('[justlook][keyboard]up fresh video');
          change();
        },
      },
      down: {
        action: function () {
          console.log('[justlook][keyboard]down fresh video');
          change();
        },
      },
    },
  },
  dynamicBg: {
    disable: false,
  },
  ignores: ['cssFullscreen', 'playbackRate'],
  height: '100%',
  width: '100%',
});

const fetchDataAndSetPlayerConfig = async () => {
  try {
    const res = await fetchSettingDetail('defaultViewCasual');
    api.value = res?.value || DEFAULT_VIEW_CASUAL;
    config.value.url = api.value;
    return true;
  } catch {
    MessagePlugin.warning(t('pages.justlook.message.noData'));
    return false;
  }
};

const initializePlayer = () => {
  player.value = new Player(config.value);
};

const toggleDrawerAndHandlePlayer = async () => {
  if (!isVisible.drawer) {
    if (!(await fetchDataAndSetPlayerConfig())) return;
    isVisible.drawer = true;
    // 等抽屉内容挂载后再初始化，否则 xgplayer 可能找不到 #mse 节点
    await nextTick();
    initializePlayer();
  } else {
    close();
    isVisible.drawer = false;
  }
};

const close = () => {
  if (player.value) {
    player.value.destroy();
    player.value = null;
  }
};

const change = () => {
  if (player.value) {
    player.value.src = api.value;
  }
};
</script>

<style lang="less" scoped>
.content {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  #mse {
    height: 100%;
    border-radius: var(--td-radius-large);
  }

  .slide {
    display: flex;
    flex-direction: column;
    position: absolute;
    right: calc(12px + var(--td-comp-paddingLR-l));
    top: calc(22px + var(--td-comp-paddingTB-l));
    width: 32px;
    z-index: 10;

    .icon {
      background-color: #33343f;
      height: 40px;
      line-height: 40px;
      opacity: 0.7;
      text-align: center;
      width: 32px;

      &:hover {
        background-color: #4e5255;
        cursor: pointer;
      }

      svg {
        color: #fff;
      }
    }

    .refresh {
      border-radius: var(--td-radius-round);
    }
  }
}
</style>
