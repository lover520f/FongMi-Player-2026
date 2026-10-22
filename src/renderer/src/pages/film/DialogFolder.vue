<template>
  <t-dialog
    v-model:visible="formVisible"
    :header="header"
    :width="640"
    placement="center"
    :footer="false"
    :close-on-overlay-click="false"
  >
    <div class="folder-view">
      <div class="crumbs">
        <template v-for="(c, i) in stack" :key="i">
          <span v-if="i > 0" class="crumb-sep">/</span>
          <span class="crumb" :class="{ active: i === stack.length - 1 }" @click="gotoCrumb(i)">{{ c.name }}</span>
        </template>
      </div>

      <div v-if="loading && !items.length" class="status">加载中…</div>
      <div v-else-if="error && !items.length" class="status status-error">
        <span>{{ error }}</span>
        <t-button variant="outline" size="small" @click="reload">重试</t-button>
      </div>
      <div v-else-if="!items.length" class="status">该文件夹为空</div>

      <div v-else class="file-list">
        <div
          v-for="it in items"
          :key="it.vod_id"
          class="file-item"
          :class="{ 'is-folder': isFolder(it), 'is-busy': busyId === it.vod_id }"
          @click="openItem(it)"
        >
          <span class="file-icon">{{ isFolder(it) ? '📁' : '🎬' }}</span>
          <span class="file-name">{{ it.vod_name }}</span>
          <span class="file-type">{{ isFolder(it) ? '文件夹' : '视频' }}</span>
        </div>
      </div>

      <div v-if="loading && items.length" class="status status-small">加载中…</div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';

import { fetchList, fetchDetail } from '@/utils/cms';

const props = defineProps({
  visible: { type: Boolean, default: false },
  site: { type: Object, default: () => ({}) },
  data: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update:visible', 'play']);

const formVisible = ref(false);
const stack = ref<{ name: string; vod_id: string }[]>([]);
const items = ref<CmsItem[]>([]);
const loading = ref(false);
const error = ref('');
const busyId = ref('');
let loadToken = 0; // 加载代次：换目录/关窗后丢弃过期分页响应

// spider 每页固定 4 条（category 返回 limit=4），逐页拉全，避免目录被截断
const PAGE_SIZE = 4;

interface CmsItem {
  vod_id: string;
  vod_name: string;
  vod_tag?: string;
  vod_play_from?: string;
  vod_play_url?: string;
}

const header = computed(() => stack.value[stack.value.length - 1]?.name || '文件夹');
const isFolder = (it: CmsItem) => String(it?.vod_tag || '') === 'folder';

watch(
  () => props.visible,
  (val) => {
    formVisible.value = val;
  },
);

watch(formVisible, (val) => {
  emit('update:visible', val);
  if (val) reset();
  else clear();
});

const clear = () => {
  loadToken++;
  stack.value = [];
  items.value = [];
  error.value = '';
  busyId.value = '';
  loading.value = false;
};

const reset = () => {
  clear();
  const d = props.data;
  if (d && d.vod_id) stack.value = [{ name: d.vod_name || '文件夹', vod_id: String(d.vod_id) }];
  loadAll();
};

const loadAll = async () => {
  const cur = stack.value[stack.value.length - 1];
  if (!cur || !props.site || !props.site.type) return;
  const token = ++loadToken;
  loading.value = true;
  error.value = '';
  try {
    const all: CmsItem[] = [];
    for (let pg = 1; pg <= 50; pg++) {
      if (token !== loadToken) return; // 目录已切换，丢弃剩余分页
      const res = (await fetchList(props.site, pg, cur.vod_id, {})) as CmsItem[];
      const list = Array.isArray(res) ? res : [];
      all.push(...list);
      if (list.length < PAGE_SIZE) break;
    }
    if (token !== loadToken) return;
    items.value = all;
  } catch (e) {
    if (token !== loadToken) return;
    error.value = e instanceof Error ? e.message : String(e);
    items.value = [];
  } finally {
    if (token === loadToken) loading.value = false;
  }
};

const reload = () => loadAll();

const gotoCrumb = (index: number) => {
  if (index === stack.value.length - 1) return;
  stack.value = stack.value.slice(0, index + 1);
  items.value = [];
  loadAll();
};

const openItem = async (it: CmsItem) => {
  if (loading.value || busyId.value) return;

  if (isFolder(it)) {
    stack.value.push({ name: it.vod_name, vod_id: String(it.vod_id) });
    items.value = [];
    loadAll();
    return;
  }

  busyId.value = it.vod_id;
  try {
    const detail = (await fetchDetail(props.site, it.vod_id)) as CmsItem[];
    const info = Array.isArray(detail) ? detail[0] : null;
    if (!info || (!info.vod_name && !info.vod_play_from)) {
      throw new Error('empty detail');
    }
    // spider 的 detail 把 vod_name 写成网盘名，标题用真实文件名
    emit('play', { ...info, vod_name: it.vod_name || info.vod_name });
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : String(e));
  } finally {
    busyId.value = '';
  }
};
</script>

<style lang="less" scoped>
.folder-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 240px;
}

.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--td-text-color-secondary);

  .crumb {
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;

    &:hover {
      background: var(--td-bg-color-container-hover);
      color: var(--td-text-color-primary);
    }

    &.active {
      color: var(--td-text-color-primary);
      font-weight: 600;
      cursor: default;
    }
  }

  .crumb-sep {
    color: var(--td-text-color-placeholder);
  }
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 46vh;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;

  &:hover {
    background: var(--td-bg-color-container-hover);
    border-color: var(--td-component-border);
  }

  &.is-busy {
    opacity: 0.6;
    pointer-events: none;
  }

  .file-icon {
    flex-shrink: 0;
  }

  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .file-type {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }

  &.is-folder .file-name {
    color: var(--td-text-color-primary);
  }
}

.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 0;
  color: var(--td-text-color-secondary);
  font-size: 13px;

  &.status-error {
    color: var(--td-error-color);
  }

  &.status-small {
    padding: 8px 0;
    font-size: 12px;
  }
}
</style>
