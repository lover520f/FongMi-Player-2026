<template>
  <t-dialog v-model:visible="formVisible" :closeOnOverlayClick="false" :width="650"
    :header="$t('pages.setting.editSource.source.dialog.player.title')" placement="center" :footer="false">
    <template #body>
      <player ref="playerRef" class="player"/>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef, watch } from 'vue';

import Player from '@/components/player/index.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  url: {
    type: String,
    default: ''
  }
});
const formVisible = ref(false);
const formData = reactive({
  // 现在是按需加载的组件，挂载时 props.url 已经有值 —— 直接用初值，
  // 否则 immediate 的 visible watch 会拿着空 url 去初始化播放器
  url: props.url,
  isActive: true,
});

const playerRef = ref(null) as any;
const player = shallowRef({
  type: 'player',
  player: ''
});

const emit = defineEmits(['update:visible']);
watch(
  () => formVisible.value,
  (val) => {
    emit('update:visible', val);

    if (val) {
      // 必须用 props.url 而不是 formData.url：父级「先改 url 再翻 visible」是同一个 tick，
      // 两个 watch 在同一轮 flush 里跑，formVisible 这个 watch 的 id 更小、会先执行，
      // 那时 formData.url 还是上一次的地址 —— 第二次试播放会播错片子。
      setupPlayer(props.url || formData.url);
    } else {
      if (player.value.player) {
        destroyPlayer();
      };
    };
  }
);
watch(
  () => props.visible,
  (val) => {
    formVisible.value = val;
  },
);

// 本组件现在是按需加载：挂载时 props.visible 可能已经是 true，上面的 watch 不会触发。
// 不能给它加 immediate —— 那会在 setup 阶段就调 setupPlayer，此时 playerRef 还没挂上，
// playerRef.value! 直接抛错。放在 onMounted 里补一次，ref 已就绪。
onMounted(() => {
  if (props.visible) formVisible.value = true;
});
watch(
  () => props.url,
  (val) => {
    formData.url = val;
  },
);

const setupPlayer = async (url: string) => {
  player.value = await playerRef.value!.createPlayer('player', url);
};

const destroyPlayer = async () => {
  playerRef.value!.destroyPlayer(player.value!.type, player.value!.player);
};
</script>

<style lang="less" scoped>
.player {
  border-radius: var(--td-radius-large);
  overflow: hidden;
  width: 100%;
  height: 320px;
}
</style>
