<template>
  <div
    v-if="route.name === 'FilmIndex' || route.name === 'IptvIndex' || route.name === 'AnalyzeIndex'"
    class="search-bar"
  >
    <t-popup placement="bottom-right" :visible="isVisible.popup" :on-visible-change="popupVisibleEvent">
      <t-input
        v-model="searchValue"
        :placeholder="$t('pages.search.searchPlaceholder')"
        class="search-input"
        clearable
        :on-enter="searchEvent"
        :on-click="focusEvent"
        @clear="searchEvent(searchValue)"
      >
        <template #label>
          <t-select
            v-if="activeRouteName === 'FilmIndex'"
            v-model="active.filmGroupType"
            auto-width
            class="search-select"
            @click.stop
          >
            <t-option key="site" :label="$t('pages.search.site')" value="site" />
            <t-option key="group" :label="$t('pages.search.group')" value="group" />
            <t-option key="all" :label="$t('pages.search.all')" value="all" />
          </t-select>
        </template>
        <template #suffixIcon>
          <search-icon style="cursor: pointer" @click="searchEvent(searchValue)" />
        </template>
      </t-input>
      <template v-if="activeRouteName === 'FilmIndex' || activeRouteName === 'AnalyzeIndex'" #content>
        <div class="search-content">
          <div v-show="searchList.length > 0" class="history">
            <div class="history-nav">
              <div class="history-title">{{ $t('pages.search.searchHistory') }}</div>
              <div class="history-clear" @click.stop="clearSearchHistory">
                <delete-icon />
              </div>
            </div>
            <div class="history-content">
              <t-tag
                v-for="(item, index) in searchList"
                :key="index"
                class="nav-item"
                shape="round"
                variant="outline"
                @click="searchEvent(item.title)"
                >{{ item.title }}</t-tag
              >
            </div>
          </div>
          <div class="hot">
            <div class="hot-nav">
              <span
                v-for="item in hotConfig.hotOption"
                :key="item.key"
                :class="['nav-item', item.key === active.flag ? 'nav-item-active' : '']"
                @click="changeHotSource(item.key)"
                >{{ item.name }}</span
              >
            </div>
            <div class="hot-content">
              <t-skeleton :row-col="rowCol" :loading="isVisible.load"></t-skeleton>
              <div v-if="!isVisible.load">
                <div v-if="hotConfig.hotData.length !== 0" class="hot-data">
                  <div
                    v-for="(item, index) in hotConfig.hotData"
                    :key="item.vod_id"
                    class="rax-view-v2 hot-item"
                    @click="searchEvent(item.vod_name)"
                  >
                    <div class="normal-view" :class="[index in [0, 1, 2] ? `color-${index + 1}` : '']">
                      <div class="normal-index">{{ index + 1 }}</div>
                      <div class="normal-title no-warp">{{ item.vod_name }}</div>
                      <div class="normal-tip">{{ item.vod_hot }}</div>
                    </div>
                  </div>
                </div>
                <div v-else class="empty">
                  <div class="image" style="width: 200px" v-html="emptyImage"></div>
                  <div class="desc">
                    <p>{{ $t('pages.search.hotNoData') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </t-popup>
  </div>
</template>

<script setup lang="ts">
import _ from 'lodash';
import moment from 'moment';
import { DeleteIcon, SearchIcon } from 'tdesign-icons-vue-next';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { t } from '@/locales';
import emitter from '@/utils/emitter';
import { komectHot, doubanHot, kyLiveHot, enlightentHot } from '@/utils/hot';
import { fetchHistoryList, clearHistorySearchList, addHistory } from '@/api/history';
import { fetchSettingDetail } from '@/api/setting';

import CONFIG from '@/config/hotClass';
import emptyImage from '@/assets/empty.svg?raw';

const route = useRoute();

const isVisible = reactive({
  load: true,
  popup: false,
});
const active = reactive({
  type: 'group',
  filmGroupType: 'site',
  filmFilterType: 'off',
  flag: '',
});
const hotConfig = reactive({
  hotType: '',
  hotName: '',
  hotUrl: '',
  hotClass: 'episode', // 仅酷云[旧]生效
  hotSource: 1,
  hotUpdateTime: moment().format('YYYY-MM-DD'),
  hotData: [],
  hotOption: [] || {},
}) as any;
const searchList = ref([]) as any;
const searchValue = ref('');
const activeRouteName = computed(() => route.name);
let hotReqId = 0; // 热榜请求代次：切源/重进页面后丢弃过期响应
let historyReqId = 0; // 历史请求代次：清空后丢弃在途响应

watch(
  () => activeRouteName.value,
  async (newVal) => {
    if (newVal === 'FilmIndex') await getFilmSearhConfig();
    searchValue.value = '';
  },
);

onMounted(async () => {
  if (activeRouteName.value === 'FilmIndex') await getFilmSearhConfig();
  if (!emitter.all.get('fillSearch')) {
    emitter.on('fillSearch', (kw: string) => {
      searchValue.value = kw || '';
    });
  }
});

onActivated(() => {
  const isListenedRefreshHotConfig = emitter.all.get('refreshHotConfig');
  if (!isListenedRefreshHotConfig) emitter.on('refreshHotConfig', refreshHotConfig);
  if (!emitter.all.get('fillSearch')) {
    emitter.on('fillSearch', (kw: string) => {
      searchValue.value = kw || '';
    });
  }
});

const rowCol = [
  { type: 'text', width: '100%', height: '22px' },
  { type: 'text', width: '100%', height: '22px' },
  { type: 'text', width: '100%', height: '22px' },
  { type: 'text', width: '100%', height: '22px' },
];

const focusEvent = async () => {
  if (activeRouteName.value === 'FilmIndex' || activeRouteName.value === 'AnalyzeIndex') {
    getSearchHistory();
    getSetConfig();
    isVisible.popup = true;
  }
};

// 获取搜索历史
const getSearchHistory = async () => {
  const reqId = ++historyReqId;
  try {
    const res = await fetchHistoryList(0, 5, 'search');
    if (reqId !== historyReqId) return; // 已被清空/新请求接管，丢弃过期结果
    searchList.value = res.data;
  } catch (err) {
    console.error('[search][getSearchHistory][error]', err);
  }
};

// 清空搜索历史
const clearSearchHistory = async () => {
  const dialog = DialogPlugin.confirm({
    header: t('pages.setting.header.delete'),
    body: t('pages.setting.table.deleteTip'),
    confirmBtn: t('pages.setting.dialog.confirm'),
    cancelBtn: t('pages.setting.dialog.cancel'),
    onConfirm: async () => {
      dialog.destroy();
      historyReqId++; // 先作废在途历史响应，避免清空后被回填
      try {
        await clearHistorySearchList();
        searchList.value = [];
      } catch (err) {
        console.error('[search][clearSearchHistory][error]', err);
        MessagePlugin.error(`${t('pages.setting.data.fail')}:${err}`);
      }
    },
  });
};

// 热播映射
const hotTypeMappings = {
  komect: {
    hotUpdateTime: () => moment().format('YYYY/MM/DD'),
    hotSource: '电影',
  },
  douban: {
    hotUpdateTime: () => moment().format('YYYY/MM/DD'),
    hotSource: 'tv_hot',
  },
  enlightent: {
    hotUpdateTime: () => moment().format('YYYY/MM/DD'),
    hotSource: 'tv',
  },
  kuyun: {
    hotUpdateTime: () => moment().format('YYYY-MM-DD'),
    hotSource: 1,
  },
  kylive: {
    hotUpdateTime: () => moment().format('YYYY-MM-DD'),
    hotSource: 0,
  },
};

const getFilmSearhConfig = async () => {
  const searchResponse = await fetchSettingDetail('defaultSearchType');
  active.filmGroupType = searchResponse?.value || 'group';
  const filterResponse = await fetchSettingDetail('defaultFilterType');
  active.filmFilterType = filterResponse?.value || 'off';
};

// 获取设置配置
const getSetConfig = async () => {
  try {
    const res = await fetchSettingDetail('defaultHot');
    const hotType = res.value;

    hotConfig.hotType = hotType;
    if (hotType in hotTypeMappings) {
      const { hotUpdateTime, hotSource } = hotTypeMappings[hotType];
      hotConfig.hotUpdateTime = hotUpdateTime();
      hotConfig.hotSource = hotSource;
      hotConfig.hotName = CONFIG[hotType]?.name;
      hotConfig.hotUrl = CONFIG[hotType]?.url;
      const optionData = CONFIG[hotType]?.data;
      // data 可能是数组也可能是对象（如 kuyun），统一归一化避免 hotOption[0] 崩溃
      hotConfig.hotOption = Array.isArray(optionData) ? optionData : Object.values(optionData || {});
      active.flag = hotConfig.hotOption[0]?.key || '';
    }

    hotReqId++;
    getHotList();
  } catch (err) {
    console.error('[search][getSetConfig][error]', err);
    MessagePlugin.error(`${t('pages.setting.data.fail')}:${err}`);
    isVisible.load = false; // 配置拉取失败也不能让 skeleton 永驻
  }
};

// 切换数据源
const changeHotSource = (flag) => {
  hotConfig.hotSource = flag;
  active.flag = flag;
  isVisible.load = true;
  hotConfig.hotData = [];
  hotReqId++;
  getHotList();
};

// 获取数据
const getHotList = async (retryCount = 1, reqId = hotReqId) => {
  try {
    const retryLimit = 4; // 重试次数 实际为 3 次
    const date = moment().subtract(retryCount, 'days');
    const dateFormat = hotConfig.hotType === 'enlightent' ? date.format('YYYY/MM/DD') : date.format('YYYY-MM-DD');

    let queryHotList;
    switch (hotConfig.hotType) {
      case 'kylive':
        queryHotList = await kyLiveHot(dateFormat, 2, hotConfig.hotSource);
        break;
      case 'enlightent':
        queryHotList = await enlightentHot(dateFormat, 'allHot', hotConfig.hotSource, 1);
        break;
      case 'douban':
        queryHotList = await doubanHot(hotConfig.hotSource, 20, 0);
        break;
      case 'komect':
        queryHotList = await komectHot(hotConfig.hotSource, 20, 1);
        break;
    }

    if (reqId !== hotReqId) return; // 切源后过期的响应直接丢弃

    if (_.size(queryHotList)) {
      isVisible.load = false;
      hotConfig.hotData = queryHotList;
      hotConfig.hotUpdateTime = dateFormat;
    } else {
      if (retryCount < retryLimit) {
        await getHotList(retryCount + 1, reqId); // 递归请求（保持同一代次）
      } else {
        isVisible.load = false;
      }
    }
  } catch (err) {
    if (reqId !== hotReqId) return;
    MessagePlugin.error(`error:${err}`);
    console.error(err);
    isVisible.load = false; // 出错也要收起 skeleton
  }
};

// 搜索资源
const searchEvent = async (item) => {
  searchValue.value = item;
  if (activeRouteName.value === 'FilmIndex' || activeRouteName.value === 'AnalyzeIndex') {
    if (item && _.findIndex(searchList.value, { title: item }) === -1) {
      const doc = {
        date: moment().unix(),
        title: item,
        type: 'search',
      };
      const searchListSize = _.size(searchList.value);
      if (searchListSize <= 5) {
        searchList.value.unshift(doc);
      } else {
        searchList.value.unshift(doc);
        searchList.value.pop();
      }
      addHistory(doc);
    }
  }
  switch (activeRouteName.value) {
    case 'FilmIndex':
      emitter.emit('searchFilm', { kw: item, group: active.filmGroupType, filter: active.filmFilterType });
      break;
    case 'IptvIndex':
      emitter.emit('searchIptv', item);
      break;
    case 'AnalyzeIndex':
      emitter.emit('searchAnalyze', item);
      break;
  }

  isVisible.popup = false;
};

const popupVisibleEvent = (_, context) => {
  if (context.trigger === 'document') {
    isVisible.popup = false;
  }
};

// 监听设置变更
const refreshHotConfig = () => {
  console.log('[search][bus][refresh]');
  hotConfig.hotData = [];
  getSetConfig();
};
</script>

<style lang="less" scoped>
:global(.t-popup__content) {
  box-shadow: var(--td-shadow-1);
  background-color: var(--td-bg-color-container);
}

.no-warp {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.search-content {
  width: 465px;
  padding: 15px;
  font-weight: 500;

  .history {
    margin-bottom: 10px;

    .history-nav {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;

      .history-title {
        font-weight: 700;
      }
    }

    .history-content {
      .nav-item {
        font-weight: 500;
        padding: 0 10px;
        margin: 0 5px 5px 0;
        cursor: pointer;
      }
    }
  }

  .hot {
    .hot-nav {
      margin-bottom: 10px;

      .nav-item {
        margin-right: 10px;
        cursor: pointer;
      }

      .nav-item-active {
        font-size: 1.2em;
        font-weight: 700;
        color: var(--td-brand-color-active);
      }
    }

    .hot-content {
      .hot-data {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        flex-wrap: wrap;

        .rax-view-v2 {
          width: 50%;
        }

        .hot-item {
          .normal-view {
            display: flex;
            padding-left: 5px;
            cursor: pointer;

            .normal-index {
              flex: 0.15;
            }

            .normal-title {
              flex: 0.8;
              word-break: break-all;
              display: -webkit-box;
              text-overflow: ellipsis;
              overflow: hidden;
            }

            .normal-tip {
              font-weight: 700;
            }
          }

          .color-1 {
            color: #f7534f;
          }

          .color-2 {
            color: #fa7b32;
          }

          .color-3 {
            color: #ffc63f;
          }

          &:hover {
            border-radius: 5px;
            background-color: var(--td-bg-color-component-hover);
          }
        }
      }
    }
  }
}

.search-select {
  :deep(.t-input) {
    border-style: none;
  }

  :deep(.t-input--focused) {
    border-style: none;
    box-shadow: none;
  }
}

.search-input {
  height: 32px;
  width: 200px;

  :deep(.t-input__prefix) {
    .t-input--suffix {
      padding: 0;
    }

    .t-input__inner {
      color: var(--td-text-color-placeholder);
      font-weight: 500;
    }

    .t-input__suffix:not(:empty) {
      margin-left: var(--td-comp-margin-xxs);
    }
  }

  :deep(.t-input) {
    background-color: var(--td-bg-color-container);
    border-radius: var(--td-radius-default);
    border-color: transparent;
    box-shadow: none;

    .t-input__inner::placeholder {
      color: var(--td-text-color-placeholder);
      font-weight: 500;
    }

    &.t-is-focused .t-input__prefix > .t-icon {
      color: var(--td-text-color-placeholder);
    }
  }
}

.empty {
  height: 360px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  text-align: center;
  box-sizing: border-box;
  padding: var(--td-comp-paddingTB-xxl) 0;

  .desc {
    margin-top: var(--td-comp-margin-xl);

    p {
      margin: 0;
      font-size: var(--td-font-size-title-small);
      font-weight: 500;
      color: var(--el-text-color-secondary);
    }
  }
}
</style>
