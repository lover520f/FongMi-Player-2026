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

import _ from 'lodash';
import moment from 'moment';
import { DeleteIcon, LaptopIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import InfiniteLoading from 'v3-infinite-loading';
import { computed, onActivated, onMounted, ref, reactive } from 'vue';

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

const isEmpty = computed(() => !options.value.today.length && !options.value.week.length && !options.value.ago.length);
const emptyTip = computed(() =>
  isEmpty.value ? t('pages.chase.infiniteLoading.noData') : t('pages.chase.infiniteLoading.complete'),
);

const options = ref({
  today: [],
  week: [],
  ago: [],
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
const siteConfig = ref({
  data: [],
});

onMounted(async () => {
  const site_res = await fetchSiteList();
  if (_.has(site_res, 'data') && !_.isEmpty(site_res['data'])) {
    siteConfig.value.data = site_res['data'];
  }
});

let isFirstActivate = true;
onActivated(() => {
  const isListenedRefreshHistory = emitter.all.get('refreshHistory');
  if (!isListenedRefreshHistory) emitter.on('refreshHistory', refreshHistory);
  if (isFirstActivate) {
    isFirstActivate = false;
    return;
  }
  refreshHistory();
});

const getHistoryList = async () => {
  const { pageIndex, pageSize } = pagination.value;

  const history_res = await fetchHistoryList(pageIndex, pageSize, 'film');

  for (const item of history_res.data) {
    const findItem: any = siteConfig.value.data.find(({ id }) => id === item.relateId);
    if (findItem) item.site = { ...findItem };
    item.siteName = findItem ? findItem['name'] : '';
    const timeDiff = filterDate(item.date);
    let timeKey;
    if (timeDiff === 0) timeKey = 'today';
    else if (timeDiff < 7) timeKey = 'week';
    else timeKey = 'ago';
    options.value[timeKey].push(item);
  }

  pagination.value.count = history_res.total;
  pagination.value.pageIndex++;

  const length = _.size(history_res.data);
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
    const timeDiff = filterDate(item.date);
    let timeKey;
    if (timeDiff === 0) timeKey = 'today';
    else if (timeDiff < 7) timeKey = 'week';
    else timeKey = 'ago';
    try {
      await delHistory(id);
      options.value[timeKey] = _.reject(options.value[timeKey], { id });
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
  options.value = {
    today: [],
    week: [],
    ago: [],
  };
  infiniteId.value++;
  pagination.value.pageIndex = 0;
};

const refreshHistory = () => {
  console.log('[history][bus][refresh]');
  defaultSet();
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
