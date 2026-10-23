<template>
  <t-dialog
    v-model:visible="formVisible"
    header="网盘登录"
    :width="460"
    placement="center"
    :footer="false"
    :close-on-overlay-click="false"
  >
    <div class="drive-login">
      <template v-if="step === 'list'">
        <div class="step-tip">选择网盘，用对应的手机 App 扫码授权</div>
        <div v-if="caption" class="step-caption">{{ caption }}</div>

        <div v-if="listLoading && !drives.length" class="status">正在读取登录状态…</div>
        <div v-else-if="listError && !drives.length" class="status status-error">
          <span>读取失败：{{ listError }}</span>
          <t-button variant="outline" size="small" @click="loadState">重试</t-button>
        </div>

        <div v-else class="drive-list">
          <div v-for="d in drives" :key="d.index" class="drive-item" @click="openQr(d)">
            <div class="drive-main">
              <span class="drive-name">{{ d.name }}</span>
              <t-tag :theme="d.loggedIn ? 'success' : 'default'" variant="light" size="small">
                {{ d.loggedIn ? '已登录' : '未登录' }}
              </t-tag>
              <span class="drive-hint">{{ d.loggedIn ? '点击整行可重新扫码' : '点击整行扫码登录' }}</span>
            </div>
            <t-button
              size="small"
              variant="outline"
              :theme="d.enabled ? 'default' : 'primary'"
              :disabled="!d.loggedIn"
              :title="d.loggedIn ? '' : '请先扫码登录'"
              class="drive-toggle"
              @click.stop="toggleDrive(d)"
            >
              {{ toggleText(d) }}
            </t-button>
          </div>
        </div>

        <div v-if="listLoading && drives.length" class="status status-small">刷新中…</div>
        <div v-if="listError && drives.length" class="status status-error status-small">
          {{ listError }}
        </div>
      </template>

      <template v-else-if="step === 'qr'">
        <div class="step-tip">打开「{{ current?.name }}」手机 App 扫码授权</div>

        <div v-if="qrLoading" class="status">正在生成授权二维码…</div>
        <div v-else-if="qrError" class="status status-error">
          <span>{{ qrError }}</span>
          <t-button variant="outline" size="small" @click="retryQr">重试</t-button>
        </div>

        <template v-else-if="qr.dataUrl">
          <div class="qr-frame" :style="qrFrameStyle">
            <img :src="qr.dataUrl" class="qr-img" alt="网盘授权二维码" />
          </div>
          <t-tag :theme="statusTheme" variant="light">{{ statusText }}</t-tag>
          <div class="qr-hint">在手机上确认后，这里会自动完成登录</div>
          <t-button v-if="statusTheme === 'warning'" variant="outline" size="small" @click="retryQr">
            重新获取二维码
          </t-button>
        </template>

        <div class="qr-actions">
          <t-button variant="outline" size="small" class="back-btn" @click="backToList">返回选择网盘</t-button>
        </div>
      </template>

      <template v-else>
        <div class="success">
          <check-circle-filled-icon class="success-icon" />
          <div class="success-text">{{ current?.name }} 登录成功</div>
          <div class="qr-hint">返回列表后点击右侧「启用」，即可浏览该网盘</div>
          <t-button theme="primary" size="small" @click="backToList">返回列表</t-button>
        </div>
      </template>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { CheckCircleFilledIcon } from 'tdesign-icons-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { clickDriveLogin, dismissDriveLogin, fetchDriveLoginQr, fetchDriveLoginState } from '@/api/gateway';

type Drive = {
  index: number;
  toggleIndex: number;
  name: string;
  loggedIn: boolean;
  enabled?: boolean;
  actionText: string;
};

type QrState = { dataUrl: string; width: number; height: number };

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:visible']);

const QR_BOX = 240;
const POLL_INTERVAL = 3000;
const QR_TTL = 5 * 60 * 1000;
const MAX_POLL_FAILS = 5;

const formVisible = ref(false);
const step = ref<'list' | 'qr' | 'success'>('list');
const drives = ref<Drive[]>([]);
const caption = ref('');
const qrs = ref<{ name: string }[]>([]);
const listLoading = ref(false);
const listError = ref('');
const current = ref<Drive | null>(null);
const qr = ref<QrState>({ dataUrl: '', width: 0, height: 0 });
const qrLoading = ref(false);
const qrError = ref('');
const statusText = ref('等待扫码…');
const statusTheme = ref<'default' | 'success' | 'primary' | 'warning'>('default');

let pollTimer: ReturnType<typeof setInterval> | null = null;
let qrExpiresAt = 0;
let pollFails = 0;

const qrFrameStyle = computed(() => {
  const modules = Math.max(qr.value.width, 1);
  const quiet = Math.max(12, Math.round((QR_BOX / modules) * 4));
  return { padding: `${quiet}px` };
});

const parseLabels = (labels: string[]): Drive[] => {
  const out: Drive[] = [];
  for (let i = 0; i + 1 < labels.length; i += 2) {
    const loginLabel = labels[i] || '';
    const actionLabel = labels[i + 1] || '';
    const match = loginLabel.match(/^(.*?)[-–—\s]*([未已]登录.*)$/);
    out.push({
      index: i,
      toggleIndex: i + 1,
      name: (match?.[1] || loginLabel).trim() || `网盘 ${i / 2 + 1}`,
      loggedIn: /已登录/.test(loginLabel),
      enabled: /启用中/.test(actionLabel) ? true : /停用中/.test(actionLabel) ? false : undefined,
      actionText: actionLabel.trim(),
    });
  }
  return out;
};

// 启停按钮给的是动作词，不是 spider 的状态描述（"启用中/停用中"）
const toggleText = (d: Drive) => {
  if (d.enabled === true) return '停用';
  if (d.enabled === false) return '启用';
  return d.actionText || '启停';
};

const applyState = (data: { labels?: unknown; qrs?: unknown; texts?: unknown }) => {
  if (Array.isArray(data.labels)) drives.value = parseLabels(data.labels as string[]);
  if (Array.isArray(data.qrs)) qrs.value = data.qrs as { name: string }[];
  if (Array.isArray(data.texts) && data.texts.length) {
    caption.value = String((data.texts as unknown[])[0]);
  }
};

const loadState = async () => {
  listLoading.value = true;
  try {
    const res = await fetchDriveLoginState();
    applyState(res?.data || {});
    listError.value = '';
  } catch (e) {
    listError.value = e instanceof Error ? e.message : String(e);
  } finally {
    listLoading.value = false;
  }
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

// spider 每个网盘只生成一次授权码，离开前必须把旧的授权码对话框关掉
const cleanup = async () => {
  stopPolling();
  try {
    await dismissDriveLogin();
  } catch {
    // 关不掉不影响下一次重新生成，交给 /ui/click 再兜一次底
  }
};

const poll = async () => {
  if (!current.value) return;
  if (Date.now() >= qrExpiresAt) {
    stopPolling();
    statusText.value = '二维码已过期，请重新获取';
    statusTheme.value = 'warning';
    return;
  }
  try {
    const res = await fetchDriveLoginState();
    const data = res?.data || {};
    applyState(data);
    pollFails = 0;
    const drive = drives.value.find((item) => item.index === current.value?.index);
    if (drive?.loggedIn) {
      stopPolling();
      statusText.value = '登录成功';
      statusTheme.value = 'success';
      step.value = 'success';
    }
  } catch (e) {
    pollFails += 1;
    if (pollFails >= MAX_POLL_FAILS) {
      stopPolling();
      statusText.value = `连接网关失败：${e instanceof Error ? e.message : String(e)}`;
      statusTheme.value = 'warning';
    }
  }
};

const startPolling = () => {
  stopPolling();
  qrExpiresAt = Date.now() + QR_TTL;
  pollFails = 0;
  pollTimer = setInterval(poll, POLL_INTERVAL);
};

const loadQr = async (name: string) => {
  const res = await fetchDriveLoginQr(name);
  const dataUrl = String(res?.data?.dataUrl || '');
  if (!dataUrl) throw new Error(String(res?.data?.error || '二维码读取失败'));
  qr.value = { dataUrl, width: Number(res?.data?.width) || 0, height: Number(res?.data?.height) || 0 };
};

const openQr = async (drive: Drive) => {
  current.value = drive;
  step.value = 'qr';
  qr.value = { dataUrl: '', width: 0, height: 0 };
  qrError.value = '';
  qrLoading.value = true;
  statusText.value = '等待扫码…';
  statusTheme.value = 'default';
  const startedAt = Date.now() - 2000;
  try {
    const res = await clickDriveLogin(drive.index, 2);
    const list: { name: string; mtime?: number }[] = res?.data?.qrs || [];
    const fresh = [...list]
      .sort((a, b) => Number(a.mtime || 0) - Number(b.mtime || 0))
      .reverse()
      .find((item) => Number(item.mtime || 0) >= startedAt);
    if (!fresh) throw new Error('网关未返回新二维码，请稍后重试');
    await loadQr(String(fresh.name));
    startPolling();
  } catch (e) {
    qrError.value = e instanceof Error ? e.message : String(e);
  } finally {
    qrLoading.value = false;
  }
};

const retryQr = () => {
  if (current.value) openQr(current.value);
};

const toggleDrive = async (drive: Drive) => {
  try {
    const res = await clickDriveLogin(drive.toggleIndex, 0, true);
    applyState(res?.data || {});
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : String(e));
  }
};

const backToList = async () => {
  await cleanup();
  current.value = null;
  step.value = 'list';
  await loadState();
};

const reset = () => {
  stopPolling();
  step.value = 'list';
  current.value = null;
  qr.value = { dataUrl: '', width: 0, height: 0 };
  qrError.value = '';
  listError.value = '';
  drives.value = [];
  caption.value = '';
  statusText.value = '等待扫码…';
  statusTheme.value = 'default';
};

watch(
  () => formVisible.value,
  (val) => {
    emit('update:visible', val);
    if (!val) cleanup();
  },
);

watch(
  () => props.visible,
  async (val) => {
    formVisible.value = val;
    if (val) {
      reset();
      // 先关掉上次遗留的授权码，否则 spider 不会重新生成
      await cleanup();
      await loadState();
    } else {
      cleanup();
    }
  },
);

onBeforeUnmount(() => {
  stopPolling();
  dismissDriveLogin().catch(() => undefined);
});
</script>

<style lang="less" scoped>
.drive-login {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 0 16px;
}

.step-tip {
  color: var(--td-text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.step-caption {
  max-width: 360px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
  word-break: break-all;
}

.drive-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drive-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--td-bg-color-container-hover);
  }
}

.drive-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.drive-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drive-hint {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
}

.drive-toggle {
  flex-shrink: 0;
}

.qr-frame {
  display: inline-flex;
  background: #fff;
  border-radius: var(--td-radius-default);
  box-shadow: 0 0 0 1px var(--td-component-border);
  line-height: 0;
}

.qr-img {
  width: 240px;
  height: 240px;
  object-fit: contain;
  image-rendering: pixelated;
}

.qr-hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
}

.qr-actions {
  display: flex;
  gap: 10px;
}

.back-btn {
  margin-top: 2px;
}

.status {
  padding: 32px 0;
  color: var(--td-text-color-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.status-small {
  padding: 0;
  font-size: 12px;
}

.status-error {
  color: var(--td-error-color);
}

.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 0;
}

.success-icon {
  font-size: 48px;
  color: var(--td-success-color);
}

.success-text {
  font-size: 15px;
  color: var(--td-text-color-primary);
}
</style>
