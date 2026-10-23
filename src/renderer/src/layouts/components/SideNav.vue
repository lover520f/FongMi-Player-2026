<template>
  <div :class="[`${prefix}-sidebar-layout`]">
    <t-menu collapsed :value="active" :class="`${prefix}-block-column`">
      <img class="logo" src="@/assets/icon.png" alt="logo" />
      <div class="myAgentLine"></div>
      <template v-for="item in list" :key="item.path">
        <t-menu-item v-if="getHref(item)" :name="item.path" :value="getPath(item)" @click="openHref(getHref(item)[0])">
          <template #icon>
            <component :is="menuIcon(item)"></component>
          </template>
          {{ renderMenuTitle(item.title) }}
        </t-menu-item>
        <t-menu-item v-else :name="item.path" :value="getPath(item)" :to="item.path">
          <template #icon>
            <component :is="menuIcon(item)"></component>
          </template>
          {{ renderMenuTitle(item.title) }}
        </t-menu-item>
      </template>
    </t-menu>
  </div>
</template>

<script setup lang="tsx">
import type { Component, PropType } from 'vue';
import {
  CloudIcon,
  DataDisplayIcon,
  FillColor1Icon,
  MovieClapperIcon,
  PlayCircleStrokeIcon,
  Setting1Icon,
  Tv1Icon,
  ViewInArIcon,
} from 'tdesign-icons-vue-next';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { prefix } from '@/config/global';
import { useLocale } from '@/locales/useLocale';
import type { MenuRoute } from '@/types/interface';

type ListItemType = MenuRoute & { icon?: string };

// 路由 meta.icon 是 tdesign 图标名字符串，原先交给 <t-icon name> 渲染。
// t-icon 走的是 svg sprite：运行时要先从 tdesign CDN 拉 index.js 注册 symbol，
// 打包版被 CSP 拦掉、离线时也拿不到，结果 <use href="#t-icon-xxx"> 指向不存在的 symbol，侧栏图标全空。
// 这里按名字映射到具体图标组件，内联 svg path，不依赖网络。
const stringIconMap: Record<string, Component> = {
  cloud: CloudIcon,
  'data-display': DataDisplayIcon,
  'fill-color-1': FillColor1Icon,
  'movie-clapper': MovieClapperIcon,
  'play-circle-stroke': PlayCircleStrokeIcon,
  'setting-1': Setting1Icon,
  'tv-1': Tv1Icon,
  'view-in-ar': ViewInArIcon,
};

const props = defineProps({
  navData: {
    type: Array as PropType<MenuRoute[]>,
    default: () => [],
  },
  theme: {
    type: String as PropType<'dark' | 'light'>,
    default: 'light',
  },
});

const route = useRoute();
const { locale } = useLocale();
const macFull = ref(false);

window.electron.ipcRenderer.on('screen', (_, args) => {
  macFull.value = args;
})

const getActive = (maxLevel = 3): string => {
  if (!route.path) {
    return '';
  }
  return route.path
    .split('/')
    .filter((_item: string, index: number) => index <= maxLevel && index > 0)
    .map((item: string) => `/${item}`)
    .join('');
};

const active = computed(() => getActive());

const list = computed(() => {
  const { navData } = props;
  return getMenuList(navData);
});

const menuIcon = (item: ListItemType) => {
  if (typeof item.icon === 'string') {
    const Icon = stringIconMap[item.icon];
    return Icon ? <Icon stroke-width="2.5" /> : null;
  }
  const RenderIcon = item.icon;
  return RenderIcon;
};

const renderMenuTitle = (title: string | Record<string, string>) => {
  if (typeof title === 'string') return title;
  return title[locale.value];
};

const getMenuList = (list: MenuRoute[], basePath?: string): ListItemType[] => {
  if (!list || list.length === 0) {
    return [];
  }
  // 如果meta中有orderNo则按照从小到大排序
  list.sort((a, b) => {
    return (a.meta?.orderNo || 0) - (b.meta?.orderNo || 0);
  });

  return list
    .map((item) => {
      const path = basePath && !item.path.includes(basePath) ? `${basePath}/${item.path}` : item.path;
      return {
        path,
        title: item.meta?.title,
        icon: item.meta?.icon,
        children: getMenuList(item.children, path),
        meta: item.meta,
        redirect: item.redirect,
      };
    })
    .filter((item) => item.meta && item.meta.hidden !== true);
};

const getHref = (item: MenuRoute) => {
  const { frameSrc, frameBlank } = item.meta;
  if (frameSrc && frameBlank) {
    return frameSrc.match(/(http|https):\/\/([\w.]+\/?)\S*/);
  }
  return null;
};

const getPath = (item: ListItemType) => {
  if (active.value.startsWith(item.path)) {
    return active.value;
  }
  return item.meta?.single ? item.redirect : item.path;
};

const openHref = (url: string) => {
  window.open(url);
};
</script>

<style lang="less" scoped>
.mac_unmax_style {
  padding-top: var(--td-comp-size-xxl);
}

.logo {
  width: var(--td-size-10);
  height: var(--td-size-10);
  margin: var(--td-comp-paddingTB-l) 0 var(--td-comp-paddingTB-m) 0;
}

.myAgentLine {
  width: 24px;
  height: 1px;
  background-color: var(--td-bg-content-active-2);
  border-radius: 12px;
  margin-bottom: var(--td-comp-paddingTB-xs);
  cursor: pointer;
}
</style>
