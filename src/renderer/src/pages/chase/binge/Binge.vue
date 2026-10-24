<template>
  <div class="binge">
    <div class="header operation-container">
      <div class="left-operation-container">
        <div class="component-op">
          <div class="item" @click="checkUpdaterEvent">
            <assignment-checked-icon />
            <span>{{ $t('pages.chase.binge.checkUpdate') }}</span>
          </div>
          <div class="item" @click="clearEvent">
            <delete-icon />
            <span>{{ $t('pages.chase.binge.clearAll') }}</span>
          </div>
        </div>
      </div>
      <div class="right-operation-container"></div>
    </div>
    <div ref="mainRef" class="main">
      <t-row :gutter="[16, 16]" style="margin: 0">
        <t-col
          v-for="item in bingeConfig.data"
          :key="item['id']"
          :md="3"
          :lg="3"
          :xl="2"
          :xxl="1"
          class="card"
          @click="playEvent(item)"
        >
          <div class="card-close" @click.stop="removeEvent(item)">
            <delete-icon />
          </div>
          <div class="card-main">
            <div v-if="item['videoUpdate']" class="card-tag card-tag-orange">
              <span class="card-tag-text text-hide">{{ $t('pages.chase.isUpdate') }}</span>
            </div>
            <t-image
              class="card-main-item"
              :src="item['videoImage']"
              :style="{ width: '100%', background: 'none', overflow: 'hidden' }"
              :lazy="true"
              fit="cover"
              :loading="renderImageLoading"
              :error="renderImageError"
            >
              <template #overlayContent>
                <div class="op">
                  <div class="op-box">
                    <span>{{ item['siteName'] ? item['siteName'] : $t('pages.chase.sourceDeleted') }}</span>
                  </div>
                </div>
              </template>
            </t-image>
          </div>
          <div class="card-footer">
            <p class="card-footer-title text-hide">{{ item['videoName'] }}</p>
            <p class="card-footer-desc tiles-item_desc_row text-hide">
              {{ item['videoRemarks'] ? item['videoRemarks'] : '' }}
            </p>
          </div>
        </t-col>
      </t-row>

      <infinite-loading class="infinite-loading-container" :identifier="infiniteId" :duration="200" @infinite="load">
        <template #complete>{{ emptyTip }}</template>
        <template #error>{{ $t('pages.chase.infiniteLoading.error') }}</template>
      </infinite-loading>
    </div>

    <detail-view v-model:visible="isVisible.detail" :site="siteData" :data="formDetailData" />
    <t-loading
      :attach="`.${prefix}-content`"
      size="medium"
      :text="$t('pages.setting.loading')"
      :loading="isVisible.loading"
    />
  </div>
</template>

<script setup lang="tsx">
import 'v3-infinite-loading/lib/style.css';

import findIndex from 'lodash/findIndex';
import has from 'lodash/has';
import _isEmpty from 'lodash/isEmpty';
import reject from 'lodash/reject';
import size from 'lodash/size';
import PQueue from 'p-queue';
import { AssignmentCheckedIcon, DeleteIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import InfiniteLoading from 'v3-infinite-loading';
import { computed, onActivated, onBeforeUnmount, onMounted, ref, reactive, nextTick } from 'vue';

import { clearStar, delStar, fetchStarList } from '@/api/star';
import { fetchSiteList } from '@/api/site';
import { prefix } from '@/config/global';
import { t } from '@/locales';
import { usePlayStore } from '@/store';
import { catvodRuleInit, fetchDetail, t3RuleInit } from '@/utils/cms';
import { renderImageError, renderImageLoading } from '@/utils/common/imageState';
import emitter from '@/utils/emitter';

import DetailView from '../../film/Detail.vue';

const store = usePlayStore();

const queue = new PQueue({ concurrency: 5 }); // 设置并发限制为5

const pagination = ref({
  pageIndex: 0,
  pageSize: 32,
  count: 0,
});
const formDetailData = ref({
  neme: '',
  key: '',
  type: 1,
}); //  详情组件源传参
const siteData = ref();
const isVisible = reactive({
  detail: false,
  loading: false,
});
const bingeConfig = ref<any>({
  data: [],
});
const siteConfig = ref<{ data: Array<{ id?: string; name?: string }> }>({
  data: [],
});

const mainRef = ref<HTMLElement | null>(null);

// keep-alive 切走时 DOM 会被摘下来，再挂回去滚动位置就归零，
// 所以边滚边记，别指望 deactivated 那一刻还读得到
let lastScrollTop = 0;
const onScrollEvent = (): void => {
  lastScrollTop = mainRef.value?.scrollTop ?? 0;
};

const infiniteId = ref(+new Date());

const isEmpty = computed(() => !size(bingeConfig.value.data));
const emptyTip = computed(() =>
  isEmpty.value ? t('pages.chase.infiniteLoading.noData') : t('pages.chase.infiniteLoading.complete'),
);

onMounted(async () => {
  mainRef.value?.addEventListener('scroll', onScrollEvent, { passive: true });
  const site_res = await fetchSiteList();
  if (has(site_res, 'data') && !_isEmpty(site_res['data'])) {
    siteConfig.value.data = site_res['data'];
  }
});
onBeforeUnmount(() => {
  mainRef.value?.removeEventListener('scroll', onScrollEvent);
});

let isFirstActivate = true;
onActivated(() => {
  const isListenedRefreshBinge = emitter.all.get('refreshBinge');
  if (!isListenedRefreshBinge) emitter.on('refreshBinge', refreshBinge);
  if (isFirstActivate) {
    isFirstActivate = false;
    return;
  }
  refreshInPlace();
});

// 补上站点名，卡片左下角要显示来源
type StarRow = {
  id: string;
  relateId?: string;
  siteName?: string;
  site?: Record<string, unknown>;
  [key: string]: unknown;
};

const decorate = (items: StarRow[]): StarRow[] => {
  for (const item of items) {
    const findItem = siteConfig.value.data.find(({ id }) => id === item.relateId);
    if (findItem) item.site = { ...findItem };
    item.siteName = findItem?.name || '';
  }
  return items;
};

const getBingeList = async () => {
  const { pageIndex, pageSize } = pagination.value;

  const star_res = await fetchStarList(pageIndex, pageSize);

  // 原来这里是 unionWith + isEqual：每个新条目跟整张收藏列表深比较一遍，
  // 收藏一多就是平方级。按 id 去重是线性的
  const seen = new Set(bingeConfig.value.data.map((item) => item.id));
  const fresh = decorate(star_res.data).filter((item) => !seen.has(item.id));
  bingeConfig.value.data = bingeConfig.value.data.concat(fresh);

  pagination.value.count = star_res.total;
  pagination.value.pageIndex++;

  const length = size(star_res.data);
  console.log(`[binge] load data length: ${length}`);
  return length;
};

const load = async ($state) => {
  console.log('[binge] loading...');
  try {
    const resLength = await getBingeList();
    if (resLength === 0) $state.complete();
    else $state.loaded();
  } catch (error) {
    $state.error();
  }
};

// 播放
const playEvent = async (item) => {
  isVisible.loading = true;

  try {
    const { videoName, videoId } = item;
    const site: any = siteConfig.value.data.find(({ id }) => id === item.relateId);
    if (!site) {
      MessagePlugin.warning(t('pages.chase.sourceDeleted'));
      return;
    }
    siteData.value = site;
    if (site.type === 7) {
      await t3RuleInit(site);
    } else if (site.type === 8) await catvodRuleInit(site);
    if (!('vod_play_from' in item && 'vod_play_url' in item)) {
      const detail = await fetchDetail(site, videoId);
      if (!detail?.[0]) throw new Error(`empty detail: id=${videoId}`);
      item = detail[0];
    }
    if (!item) throw new Error(`invalid detail item: id=${videoId}`);
    console.log(item);

    const playerMode = store.getSetting.playerMode;

    if (playerMode.type === 'custom') {
      formDetailData.value = item;
      isVisible.detail = true;
    } else {
      const config = {
        type: 'film',
        status: true,
        data: {
          info: item,
          ext: { site: site },
        },
      };

      store.updateConfig(config);
      window.electron.ipcRenderer.send('openPlayWindow', videoName);
    }
  } catch (err) {
    console.error(`[binge][playEvent][error]`, err);
    MessagePlugin.warning(t('pages.chase.reqError'));
  } finally {
    isVisible.loading = false;
  }
};

// 删除
const removeEvent = (item) => {
  const { id } = item;
  const handleDelete = async () => {
    confirmDia.hide();
    try {
      await delStar(id);
      bingeConfig.value.data = reject(bingeConfig.value.data, { id }) as any;
      pagination.value.count--;
    } catch (err) {
      console.error('[chase][binge][removeEvent][error]', err);
      MessagePlugin.error(t('pages.chase.reqError'));
    }
  };

  const confirmDia = DialogPlugin({
    body: t('pages.chase.dialog.deleteOne.body'),
    header: t('pages.chase.dialog.clearAll.header'),
    width: '340px',
    placement: 'center',
    closeBtn: '',
    confirmBtn: t('pages.chase.dialog.confirm'),
    cancelBtn: t('pages.chase.dialog.cancel'),
    onConfirm: handleDelete,
    onClose: () => confirmDia.hide(),
  });
};

// 更新
const updateVideoRemarks = (item, res) => {
  const index = findIndex(bingeConfig.value.data, { id: item.id });
  if (index < 0) return;
  const isUpdate = res.vod_remarks !== bingeConfig.value.data[index].videoRemarks;
  bingeConfig.value.data[index].videoUpdate = isUpdate;
  bingeConfig.value.data[index].videoRemarks = res.vod_remarks;
};

const checkUpdaterEvent = async () => {
  if (!size(bingeConfig.value.data)) {
    MessagePlugin.info(t('pages.chase.binge.message.noCheckData'));
    return;
  }

  try {
    MessagePlugin.info(t('pages.setting.message.checking'));
    const fetchAndUpdateVideoRemarks = async (item) => {
      if (!item.siteName) return 'skip';
      const { site, videoId } = item;
      if (site.type === 7) await t3RuleInit(site);
      else if (site.type === 8) await catvodRuleInit(site);
      const [res] = await fetchDetail(site, videoId);
      if (res.vod_remarks) {
        updateVideoRemarks(item, res);
      }
      return 'ok';
    };
    const results = await Promise.all(
      bingeConfig.value.data.map((item) =>
        queue.add(() =>
          fetchAndUpdateVideoRemarks(item).catch((err) => {
            console.error('[chase][binge][checkUpdater][error]', err);
            return 'fail';
          }),
        ),
      ),
    );
    const ok = results.filter((r) => r === 'ok').length;
    const fail = results.filter((r) => r === 'fail').length;
    if (fail > 0 && ok === 0) {
      MessagePlugin.error(t('pages.setting.form.fail'));
    } else if (fail > 0) {
      MessagePlugin.warning(`${t('pages.setting.form.success')} (${ok}/${ok + fail})`);
    } else if (ok === 0) {
      MessagePlugin.info(t('pages.chase.binge.message.noCheckData'));
    } else {
      MessagePlugin.success(t('pages.setting.form.success'));
    }
  } catch (err) {
    console.log('[chase][binge][checkUpdaterEvent][error]', err);
    MessagePlugin.error(t('pages.setting.form.fail'));
  }
};

const clearEvent = () => {
  const handleClear = async () => {
    try {
      await clearStar();
      defaultSet();
    } catch (err) {
      console.error('[chase][binge][clearEvent][error]', err);
      MessagePlugin.error(t('pages.chase.reqError'));
    } finally {
      confirmDia.hide();
    }
  };

  const confirmDia = DialogPlugin({
    body: t('pages.chase.dialog.clearAll.body'),
    header: t('pages.chase.dialog.clearAll.header'),
    width: '340px',
    placement: 'center',
    closeBtn: '',
    confirmBtn: t('pages.chase.dialog.confirm'),
    cancelBtn: t('pages.chase.dialog.cancel'),
    onConfirm: handleClear,
    onClose: () => confirmDia.hide(),
  });
};

const defaultSet = () => {
  bingeConfig.value.data = [];
  infiniteId.value++;
  pagination.value.pageIndex = 0;
};

// 数据被整体替换（导入/恢复）时只能清空重来
const refreshBinge = () => {
  console.log('[binge][bus][refresh]');
  defaultSet();
};

// 切回本页时刷新：只重取最靠前的几页换掉头部，其余原样留着。
// 不清空、不动 infiniteId —— 卡片不会先掉到 0 张，滚动位置也留得住。
// 收藏是插入序，新增的排在最后，头部刷新主要用来让「取消收藏」尽快生效。
const REFRESH_PAGES = 6;
let refreshToken = 0;
const refreshInPlace = async () => {
  const token = ++refreshToken;
  const { pageSize } = pagination.value;
  const pages = Math.min(REFRESH_PAGES, Math.max(1, Math.ceil(bingeConfig.value.data.length / pageSize)));
  const keepTop = lastScrollTop || mainRef.value?.scrollTop || 0;

  try {
    const responses = await Promise.all(
      Array.from({ length: pages }, (_, page) => fetchStarList(page, pageSize)),
    );
    if (token !== refreshToken) return; // 期间又切走/刷新了，这份结果作废

    const head: StarRow[] = [];
    const headIds = new Set<string>();
    for (const item of decorate(responses.flatMap((res) => res.data || []))) {
      if (headIds.has(item.id)) continue;
      headIds.add(item.id);
      head.push(item);
    }

    bingeConfig.value.data = head.concat(bingeConfig.value.data.filter((item) => !headIds.has(item.id)));
    pagination.value.count = responses[0]?.total ?? bingeConfig.value.data.length;
    // 向下取整：宁可下一页重叠（有 id 去重）也不能漏页
    pagination.value.pageIndex = Math.floor(bingeConfig.value.data.length / pageSize);
    console.log(`[binge][refreshInPlace] pages:${pages} items:${bingeConfig.value.data.length}`);
  } catch (err) {
    // 刷新失败不该连带把已有列表也弄没，静默保留旧的
    console.log('[binge][refreshInPlace][error]', err);
  } finally {
    await nextTick();
    // 等一帧再写：DOM 刚挂回去时滚动容器还没有有效布局，这时候赋值会被吞掉
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (mainRef.value) mainRef.value.scrollTop = keepTop;
  }
};
</script>

<style lang="less" scoped>
.binge {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: hidden !important;

  .header {
    margin: var(--td-comp-margin-s) 0;
    display: flex;
    justify-content: space-between;
  }

  .main {
    height: calc(100% - 32px - 2 * var(--td-comp-margin-s));
    overflow-y: auto;
    overflow-x: hidden;
  }

  .card {
    box-sizing: border-box;
    width: inherit;
    position: relative;
    cursor: pointer;
    border-radius: var(--td-radius-medium);

    &:hover {
      .card-close {
        display: flex;
      }

      .card-main {
        .card-main-item {
          overflow: hidden;

          :deep(img) {
            transition: all 0.25s ease-in-out;
            transform: scale(1.05);
          }
        }
      }

      .card-footer {
        .card-footer-title {
          transition: all 0.25s ease-in-out;
          color: var(--td-brand-color);
        }
      }
    }

    .card-close {
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      position: absolute;
      right: 8px;
      height: 28px;
      width: 28px;
      z-index: 9;
      background-color: rgba(22, 24, 35, 0.8);
      border-radius: 0 var(--td-radius-medium);

      svg {
        color: var(--td-gray-color-5);
      }

      &:hover {
        svg {
          color: var(--td-brand-color);
        }
      }
    }

    .text-hide {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
    }

    .card-main {
      position: relative;
      width: 100%;
      height: 0;
      border-radius: 7px;
      padding-top: 62%;

      .card-tag-orange {
        background: #ffdd9a;
        color: #4e2d03;
      }

      .card-tag {
        z-index: 15;
        position: absolute;
        left: 0;
        top: 0;
        border-radius: 6px 0 6px 0;
        padding: 1px 6px;
        max-width: 60%;

        .card-tag-text {
          font-size: 12px;
          height: 18px;
          line-height: 18px;
        }
      }

      .card-main-item {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 5px;

        .op {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: linear-gradient(to bottom, rgba(22, 24, 35, 0.4) 0%, rgba(22, 24, 35, 0.8) 100%);

          .op-box {
            padding: var(--td-comp-paddingTB-xs) 0;
            background: linear-gradient(
              to right,
              rgba(255, 255, 255, 0),
              rgba(255, 255, 255, 0.4) 30%,
              rgba(255, 255, 255, 0.4) 70%,
              rgba(255, 255, 255, 0)
            );
            span {
              text-align: center;
              display: inline-block;
              width: 100%;
              color: #fdfdfd;
              font-weight: 500;
            }
          }
        }
      }
    }

    .card-footer {
      position: relative;
      padding-top: var(--td-comp-paddingTB-xs);

      .card-footer-title {
        font-weight: 700;
        line-height: var(--td-line-height-title-medium);
        height: 22px;
      }

      .card-footer-desc {
        font-size: 12px;
        color: var(--td-text-color-placeholder);
        align-items: center;
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        position: relative;
      }
    }
  }
}
</style>
