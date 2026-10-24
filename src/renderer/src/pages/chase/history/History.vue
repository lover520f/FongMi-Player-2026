<template>
  <div id="back-top" ref="contentRef" class="history">
    <div
      v-if="options.ago.length > 0 || options.week.length > 0 || options.today.length > 0"
      class="filter_box"
      @click="clearEvent"
    >
      <span class="icon_btn pos clear"> <delete-icon /> {{ $t('pages.chase.history.clearAll') }} </span>
    </div>
    <div v-for="(item, name, index) in options" :key="index" class="container-item">
      <template v-if="item.length !== 0">
        <div class="container-item-header">
          <span class="title">{{ translateDate[name] }}</span>
        </div>
        <div class="container-item-main">
          <t-row :gutter="[16, 16]" style="margin: 0">
            <t-col
              v-for="detail in item"
              :key="detail['id']"
              :md="3"
              :lg="3"
              :xl="2"
              :xxl="1"
              class="card"
              @click="playEvent(detail)"
            >
              <div class="card-close" @click.stop="removeEvent(detail)">
                <delete-icon />
              </div>
              <div class="card-main">
                <t-image
                  class="card-main-item"
                  :src="detail['videoImage']"
                  :style="{ width: '100%', background: 'none', overflow: 'hidden' }"
                  :lazy="true"
                  fit="cover"
                  :loading="renderImageLoading"
                  :error="renderImageError"
                >
                  <template #overlayContent>
                    <div class="op">
                      <div class="op-box">
                        <span>{{ detail['siteName'] ? detail['siteName'] : $t('pages.chase.sourceDeleted') }}</span>
                      </div>
                    </div>
                  </template>
                </t-image>
              </div>
              <div class="card-footer">
                <p class="card-footer-title text-hide">
                  {{ detail['videoName'] }} {{ formatIndex(detail['videoIndex']).index }}
                </p>
                <p class="card-footer-desc tiles-item_desc_row text-hide">
                  <laptop-icon size="14px" class="tiles-item_watch_pc icon" />
                  <span v-if="detail['playEnd']" class="tiles-item_desc_watch">{{
                    $t('pages.chase.progress.watched')
                  }}</span>
                  <span v-else class="tiles-item_desc_watch">
                    {{ $t('pages.chase.progress.watching')
                    }}{{ formatProgress(detail['watchTime'], detail['duration']) }}
                  </span>
                </p>
              </div>
            </t-col>
          </t-row>
        </div>
      </template>
    </div>

    <infinite-loading class="infinite-loading-container" :identifier="infiniteId" :duration="200" @infinite="load">
      <template #complete>{{ emptyTip }}</template>
      <template #error>{{ $t('pages.chase.infiniteLoading.error') }}</template>
    </infinite-loading>
    <detail-view v-model:visible="isVisible.detail" :site="siteData" :data="formDetailData" />
    <t-loading
      :attach="`.${prefix}-content`"
      size="medium"
      :text="$t('pages.setting.loading')"
      :loading="isVisible.loading"
    />
    <t-back-top container="#back-top" size="small" :offset="['1.4rem', '0.5rem']" :duration="2000" />
  </div>
</template>

<script setup lang="tsx">
import 'v3-infinite-loading/lib/style.css';

import has from 'lodash/has';
import _isEmpty from 'lodash/isEmpty';
import reject from 'lodash/reject';
import size from 'lodash/size';
import moment from 'moment';
import { DeleteIcon, LaptopIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import InfiniteLoading from 'v3-infinite-loading';
import { computed, onActivated, onBeforeUnmount, onMounted, ref, reactive, nextTick } from 'vue';

import { prefix } from '@/config/global';
import { t } from '@/locales';
import { usePlayStore } from '@/store';

import { delHistory, fetchHistoryList, clearHistoryFilmList } from '@/api/history';
import { fetchSiteList } from '@/api/site';
import { fetchDetail, t3RuleInit, catvodRuleInit } from '@/utils/cms';
import { renderImageError, renderImageLoading } from '@/utils/common/imageState';
import { formatIndex } from '@/utils/common/film';
import emitter from '@/utils/emitter';

import DetailView from '../../film/Detail.vue';

const store = usePlayStore();

const translateDate = computed(() => {
  return {
    today: t('pages.chase.date.today'),
    week: t('pages.chase.date.week'),
    ago: t('pages.chase.date.ago'),
  };
});

const isEmpty = computed(() => !list.value.length);
const emptyTip = computed(() =>
  isEmpty.value ? t('pages.chase.infiniteLoading.noData') : t('pages.chase.infiniteLoading.complete'),
);

// 一份扁平数据按日期分桶。以前是三个数组各自 push，
// 刷新时只能整体清空重来；有了唯一的源，原地刷新才做得到
type HistoryRow = {
  id: string;
  date: number;
  relateId?: string;
  siteName?: string;
  site?: Record<string, unknown>;
  videoImage?: string;
  videoName?: string;
  videoIndex: string;
  playEnd?: boolean;
  watchTime?: number;
  duration?: number;
  [key: string]: unknown;
};

const list = ref<HistoryRow[]>([]);
const options = computed<Record<'today' | 'week' | 'ago', HistoryRow[]>>(() => {
  const buckets = { today: [] as HistoryRow[], week: [] as HistoryRow[], ago: [] as HistoryRow[] };
  for (const item of list.value) {
    const timeDiff = filterDate(item.date);
    if (timeDiff === 0) buckets.today.push(item);
    else if (timeDiff < 7) buckets.week.push(item);
    else buckets.ago.push(item);
  }
  return buckets;
});
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
const infiniteId = ref(+new Date());
const siteConfig = ref<{ data: Array<{ id?: string; name?: string }> }>({
  data: [],
});

const contentRef = ref<HTMLElement | null>(null);

// 组件根节点上挂着 Chase 页给的 .content-wrapper，滚动就发生在这个根节点上，
// 所以要从它本身开始找，不能从 parentElement 开始
const findScroller = (): HTMLElement | null => {
  let el: HTMLElement | null = contentRef.value;
  while (el) {
    if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    el = el.parentElement;
  }
  return null;
};

// keep-alive 切走时 DOM 会被摘下来，再挂回去滚动位置就归零，
// 所以边滚边记，别指望 deactivated 那一刻还读得到
let lastScrollTop = 0;
const onScrollEvent = (): void => {
  lastScrollTop = contentRef.value?.scrollTop ?? 0;
};

onMounted(async () => {
  contentRef.value?.addEventListener('scroll', onScrollEvent, { passive: true });
  const site_res = await fetchSiteList();
  if (has(site_res, 'data') && !_isEmpty(site_res['data'])) {
    siteConfig.value.data = site_res['data'];
  }
});
onBeforeUnmount(() => {
  contentRef.value?.removeEventListener('scroll', onScrollEvent);
});

let isFirstActivate = true;
onActivated(() => {
  const isListenedRefreshHistory = emitter.all.get('refreshHistory');
  if (!isListenedRefreshHistory) emitter.on('refreshHistory', refreshHistory);
  if (isFirstActivate) {
    isFirstActivate = false;
    return;
  }
  refreshInPlace();
});

// 补上站点名，卡片左下角要显示来源
const decorate = (items: HistoryRow[]): HistoryRow[] => {
  for (const item of items) {
    const findItem = siteConfig.value.data.find(({ id }) => id === item.relateId);
    if (findItem) item.site = { ...findItem };
    item.siteName = findItem?.name || '';
  }
  return items;
};

// 按 id 去重后接在后面：分页边界重叠或刷新时都不会出重复卡片
const appendUnique = (items: HistoryRow[]): void => {
  const seen = new Set(list.value.map((item) => item.id));
  const fresh = items.filter((item) => !seen.has(item.id));
  if (fresh.length) list.value = list.value.concat(fresh);
};

const getHistoryList = async () => {
  const { pageIndex, pageSize } = pagination.value;

  const history_res = await fetchHistoryList(pageIndex, pageSize, 'film');

  appendUnique(decorate(history_res.data));

  pagination.value.count = history_res.total;
  pagination.value.pageIndex++;

  const length = size(history_res.data);
  console.log(`[history] load data length: ${length}`);
  return length;
};

const load = async ($state) => {
  console.log('[history] loading...');

  try {
    const resLength = await getHistoryList();
    if (resLength === 0) $state.complete();
    else $state.loaded();
  } catch (err) {
    console.log(err);
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
    console.error(`[history][playEvent][error]`, err);
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
      await delHistory(id);
      list.value = reject(list.value, { id });
      pagination.value.count--;
    } catch (err) {
      console.error('[history][removeEvent][error]', err);
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

const clearEvent = () => {
  const handleClear = async () => {
    try {
      await clearHistoryFilmList();
      defaultSet();
    } catch (err) {
      console.error('[history][clearEvent][error]', err);
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

// 日期计算
const filterDate = (date) => {
  const timeToday = moment().format('YYYY-MM-DD');
  const timeSource = moment.unix(date).format('YYYY-MM-DD'); // Parse Unix timestamp
  const timeDiff = moment(timeToday).diff(timeSource, 'days');
  return timeDiff;
};

// 播放进度
const formatProgress = (start, all) => {
  // 云盘等来源可能只记录观看时长、没有总时长（duration=0），
  // 直接相除会得到 Infinity% 这类脏数据，这里按 0% 处理。
  const s = Number(start);
  const a = Number(all);
  if (!Number.isFinite(s) || !Number.isFinite(a) || a <= 0) return '0%';
  const progress = Math.trunc((s / a) * 100);
  if (progress <= 0) return '0%';
  return `${Math.min(progress, 100)}%`;
};

const defaultSet = () => {
  list.value = [];
  infiniteId.value++;
  pagination.value.pageIndex = 0;
};

// 数据被整体替换（导入/恢复）时只能清空重来
const refreshHistory = () => {
  console.log('[history][bus][refresh]');
  defaultSet();
};

// 切回本页时刷新：只重取最靠前的几页换掉头部，其余原样留着。
// 不清空、不动 infiniteId —— 卡片不会先掉到 0 张，滚动位置也留得住。
// 不按已加载页数全量重取：滚得深的人一进一页就要发几十个请求。
const REFRESH_PAGES = 3;
let refreshToken = 0;
const refreshInPlace = async () => {
  const token = ++refreshToken;
  const { pageSize } = pagination.value;
  const pages = Math.min(REFRESH_PAGES, Math.max(1, Math.ceil(list.value.length / pageSize)));
  const scroller = findScroller();
  const keepTop = lastScrollTop || scroller?.scrollTop || 0;

  try {
    const responses = await Promise.all(
      Array.from({ length: pages }, (_, page) => fetchHistoryList(page, pageSize, 'film')),
    );
    if (token !== refreshToken) return; // 期间又切走/刷新了，这份结果作废

    const head: HistoryRow[] = [];
    const headIds = new Set<string>();
    for (const item of decorate(responses.flatMap((res) => res.data || []))) {
      if (headIds.has(item.id)) continue;
      headIds.add(item.id);
      head.push(item);
    }

    // 播放过的记录日期会变成「现在」跑到最前面，它原来那条要从后面摘掉，
    // 否则同一部片会在列表里出现两次
    list.value = head.concat(list.value.filter((item) => !headIds.has(item.id)));
    pagination.value.count = responses[0]?.total ?? list.value.length;
    // 向下取整：宁可下一页重叠（有 id 去重）也不能漏页
    pagination.value.pageIndex = Math.floor(list.value.length / pageSize);
    console.log(`[history][refreshInPlace] pages:${pages} items:${list.value.length}`);
  } catch (err) {
    // 刷新失败不该连带把已有列表也弄没，静默保留旧的
    console.log('[history][refreshInPlace][error]', err);
  } finally {
    await nextTick();
    // 等一帧再写：DOM 刚挂回去时滚动容器还没有有效布局，这时候赋值会被吞掉
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const target = scroller ?? findScroller();
    if (target) target.scrollTop = keepTop;
  }
};
</script>

<style lang="less" scoped>
.history {
  width: 100%;
  height: 100%;
  position: relative;

  .filter_box {
    position: absolute;
    top: 10px;
    right: 5px;
    z-index: 11;

    .pos {
      cursor: pointer;
    }

    .icon_btn {
      font-size: 12px;
      color: rgba(132, 133, 141, 0.8);
      letter-spacing: 0;
      line-height: 16px;
      user-select: none;
      padding-left: 20px;
      position: relative;

      svg {
        position: absolute;
        left: 0;
        bottom: 2px;
      }
    }

    .clear {
      margin-left: 20px;
    }

    &:hover {
      .icon_btn {
        color: var(--td-primary-color);
      }
    }
  }

  .container-item {
    .container-item-header {
      height: 40px;
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: var(--td-bg-color-container);

      .title {
        display: inline-block;
        padding-right: 18px;
        vertical-align: middle;
        line-height: 40px;
        font-size: 20px;
        font-weight: 700;
        text-align: left;
      }
    }

    .container-item-main {
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
            border-radius: var(--td-radius-default);

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

            .icon {
              margin-right: var(--td-comp-margin-xs);
            }
          }
        }
      }
    }
  }
}
</style>
