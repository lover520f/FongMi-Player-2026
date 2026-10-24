<template>
  <div
    v-if="route.name === 'FilmIndex' || route.name === 'IptvIndex' || route.name === 'AnalyzeIndex'"
    class="search-bar"
    @keydown.down="moveSuggest(1, $event)"
    @keydown.up="moveSuggest(-1, $event)"
    @keydown.esc="closeSuggest"
  >
    <t-popup placement="bottom-right" :visible="isVisible.popup" :on-visible-change="popupVisibleEvent">
      <t-input
        v-model="searchValue"
        :placeholder="$t('pages.search.searchPlaceholder')"
        class="search-input"
        clearable
        :on-enter="enterEvent"
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
          <!-- 一旦输入了关键词，就把位置让给候选：历史和热榜是「想搜什么」的入口，候选是「已经想好了」 -->
          <div v-if="keyword" class="suggest">
            <div class="suggest-nav">
              <span class="suggest-title">{{ $t('pages.search.suggestTitle') }}</span>
              <span v-if="suggestLoading" class="suggest-loading">{{ $t('pages.search.suggestLoading') }}</span>
            </div>
            <ul v-if="suggestRows.length" class="suggest-list">
              <li
                v-for="(row, index) in suggestRows"
                :key="row.title"
                :class="['suggest-item', index === suggestIndex ? 'is-active' : '']"
                @mouseenter="suggestIndex = index"
                @click="searchEvent(row.title)"
              >
                <search-icon class="suggest-icon" />
                <span class="suggest-text">
                  <template v-if="row.hit"
                    >{{ row.head }}<em class="suggest-hit">{{ row.hit }}</em
                    >{{ row.tail }}</template
                  >
                  <template v-else>{{ row.title }}</template>
                </span>
              </li>
            </ul>
            <div v-else-if="!suggestLoading" class="suggest-empty">{{ $t('pages.search.suggestEmpty') }}</div>
            <div class="suggest-submit" @click="searchEvent(keyword)">
              <search-icon class="suggest-icon" />
              <span class="suggest-submit-text">{{ $t('pages.search.suggestSubmit', { kw: keyword }) }}</span>
            </div>
          </div>
          <div v-show="!keyword && searchList.length > 0" class="history">
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
          <div v-show="!keyword" class="hot">
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
import { computed, nextTick, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { t } from '@/locales';
import emitter from '@/utils/emitter';
import { komectHot, doubanHot, kyLiveHot, enlightentHot } from '@/utils/hot';
import { fetchHistoryList, clearHistorySearchList, addHistory } from '@/api/history';
import { fetchSiteActive } from '@/api/site';
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
const keyword = computed(() => searchValue.value.trim());
let hotReqId = 0; // 热榜请求代次：切源/重进页面后丢弃过期响应
let historyReqId = 0; // 历史请求代次：清空后丢弃在途响应

/* ---------------------------------------------------------------- 搜索联想 */
// 候选分两层：
//   本地 = 搜索历史 + 当前热榜，随打随出，零请求；
//   远端 = 拿默认源搜一次，补「只打了一个词，本地一条都匹配不上」的空档。
// 远端只打一个源，260ms 防抖 + 4s 超时 + 代次丢弃 —— 联想是锦上添花，
// 慢和失败都不能拖着输入框，也不能让旧关键词的结果盖住新关键词。
const SUGGEST_MAX = 8; // 面板最多几条
const SUGGEST_MIN_CHARS = 2; // 少于此字数不发远端请求，避免每个字都打一次源
const SUGGEST_DEBOUNCE = 260;
const SUGGEST_TIMEOUT = 4000;
const SUGGEST_CACHE_MAX = 60;

const suggestIndex = ref(-1);
const suggestLoading = ref(false);
const remoteSuggest = reactive({ kw: '', items: [] as string[] });
const suggestCache = new Map<string, string[]>();
let suggestTimer: ReturnType<typeof setTimeout> | null = null;
let suggestToken = 0;
// 程序性写入（点热榜、fillSearch、切路由清空）不该把候选面板弹出来
let suppressSuggestWatch = false;

// 候选标题是外部源给的，高亮靠「切成三段」而不是拼 html —— 既不会把源里的标签当标记渲染，
// 也免了先转义再插标签那一套
const splitSuggest = (title: string): { head: string; hit: string; tail: string } => {
  const raw = String(title ?? '');
  const kw = keyword.value;
  const at = kw ? raw.toLowerCase().indexOf(kw.toLowerCase()) : -1;
  if (!kw || at < 0) return { head: raw, hit: '', tail: '' };
  return { head: raw.slice(0, at), hit: raw.slice(at, at + kw.length), tail: raw.slice(at + kw.length) };
};

// 本地候选：历史优先——用户搜过的词最可能是他要再搜一次的
const matchLocal = (kw: string): string[] => {
  const low = kw.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key) || !key.includes(low)) return;
    seen.add(key);
    out.push(text);
  };
  for (const item of searchList.value || []) push(item?.title);
  for (const item of hotConfig.hotData || []) push(item?.vod_name);
  return out;
};

const suggestItems = computed<string[]>(() => {
  const kw = keyword.value;
  if (!kw) return [];
  const low = kw.toLowerCase();
  const seen = new Set<string>();
  const pool = matchLocal(kw).concat(remoteSuggest.kw === kw ? remoteSuggest.items : []);
  const all: string[] = [];
  for (const raw of pool) {
    const text = String(raw ?? '').trim();
    if (!text || text.length > 80) continue; // 超长多半是源把简介塞进了标题
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(text);
  }
  // 前缀命中排前面：输「庆」时「庆余年」比「我在庆余年里当群演」更像要找的
  all.sort((a, b) => Number(!a.toLowerCase().startsWith(low)) - Number(!b.toLowerCase().startsWith(low)));
  return all.slice(0, SUGGEST_MAX);
});

const suggestRows = computed(() => suggestItems.value.map((title) => ({ title, ...splitSuggest(title) })));

const rememberSuggest = (kw: string, items: string[]) => {
  suggestCache.set(kw, items);
  if (suggestCache.size > SUGGEST_CACHE_MAX) {
    const oldest = suggestCache.keys().next().value;
    if (oldest !== undefined) suggestCache.delete(oldest);
  }
};

// 联想用的源：优先默认源（用户真正会先搜的那个），它不可搜时退到任意一个可搜源
type SuggestSite = { id?: string; search?: number | string; [key: string]: unknown };
let suggestSite: SuggestSite | null = null;
let suggestSitePending: Promise<SuggestSite | null> | null = null;
const resolveSuggestSite = async (): Promise<SuggestSite | null> => {
  if (suggestSite) return suggestSite;
  if (!suggestSitePending) {
    suggestSitePending = (async () => {
      const res = await fetchSiteActive();
      const def = (res?.default || null) as SuggestSite | null;
      if (def && Number(def.search) !== 0) return def;
      const list: SuggestSite[] = Array.isArray(res?.data) ? res.data : [];
      return list.find((item) => Number(item.search) === 1) || null;
    })()
      .then((site) => {
        suggestSite = site;
        return site;
      })
      .catch(() => null)
      .finally(() => {
        suggestSitePending = null;
      });
  }
  return suggestSitePending;
};

// 源被增删改后：缓存的源、缓存的关键词候选、在途请求全部作废
const resetSuggestSource = () => {
  suggestSite = null;
  suggestSitePending = null;
  suggestCache.clear();
  suggestToken++;
};

const withTimeout = <T,>(task: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    task,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('suggest timeout')), ms);
    }),
  ]);

const loadRemoteSuggest = async (kw: string, token: number) => {
  const cached = suggestCache.get(kw);
  if (cached) {
    remoteSuggest.kw = kw;
    remoteSuggest.items = cached;
    return;
  }
  const site = await resolveSuggestSite();
  if (!site || token !== suggestToken) return;

  suggestLoading.value = true;
  try {
    // cms.ts 带着 xmldom / crypto-js / xpath，惰性引入，别为了联想把它们塞进首屏包
    const { fetchSearch } = await import('@/utils/cms');
    const res: unknown = await withTimeout(fetchSearch(site, kw, 1), SUGGEST_TIMEOUT);
    if (token !== suggestToken) return; // 期间又改了关键词，这份结果作废
    const list = Array.isArray(res) ? (res as Array<{ vod_name?: string }>) : [];
    const titles = list
      .map((item) => String(item?.vod_name ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
    rememberSuggest(kw, titles);
    remoteSuggest.kw = kw;
    remoteSuggest.items = titles;
  } catch (err) {
    // 源超时/报错就只留本地候选：联想失败不该影响打字，也不该弹提示打扰
    console.log('[search][suggest][skip]', err instanceof Error ? err.message : err);
  } finally {
    if (token === suggestToken) suggestLoading.value = false;
  }
};

const scheduleRemoteSuggest = (kw: string) => {
  if (suggestTimer) {
    clearTimeout(suggestTimer);
    suggestTimer = null;
  }
  suggestToken++; // 任何输入变化都作废在途请求
  suggestLoading.value = false;
  if (Array.from(kw).length < SUGGEST_MIN_CHARS) return;

  const token = suggestToken;
  suggestTimer = setTimeout(() => {
    suggestTimer = null;
    void loadRemoteSuggest(kw, token);
  }, SUGGEST_DEBOUNCE);
};

const applySearchValue = (val: string) => {
  // watch 是 flush:'sync' 的，这里置位后立刻会被消费掉，不会漏到下一次真实输入
  suppressSuggestWatch = true;
  searchValue.value = val;
  suppressSuggestWatch = false;
};

watch(
  keyword,
  (kw) => {
    if (suppressSuggestWatch) return;
    suggestIndex.value = -1;

    if (!kw) {
      if (suggestTimer) {
        clearTimeout(suggestTimer);
        suggestTimer = null;
      }
      suggestToken++;
      suggestLoading.value = false;
      remoteSuggest.kw = '';
      remoteSuggest.items = [];
      return;
    }

    // 一输入就展开候选面板；电视页没有候选面板，保持原样
    if (activeRouteName.value === 'FilmIndex' || activeRouteName.value === 'AnalyzeIndex') {
      isVisible.popup = true;
    }

    const cached = suggestCache.get(kw);
    remoteSuggest.kw = cached ? kw : '';
    remoteSuggest.items = cached || [];
    scheduleRemoteSuggest(kw);
  },
  { flush: 'sync' },
);

const moveSuggest = (step: number, event?: KeyboardEvent) => {
  if (!isVisible.popup || !suggestRows.value.length) return;
  event?.preventDefault();
  const len = suggestRows.value.length;
  let next = suggestIndex.value + step;
  if (next < -1) next = len - 1; // 在输入框按 ↑ 跳到最后一个
  if (next > len - 1) next = -1; // 在最后一项按 ↓ 回到输入框
  suggestIndex.value = next;
  void nextTick(() => {
    const el = document.querySelector('.suggest-item.is-active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  });
};

const closeSuggest = () => {
  if (!isVisible.popup) return;
  isVisible.popup = false;
  suggestIndex.value = -1;
};

const enterEvent = () => {
  const picked = suggestIndex.value >= 0 ? suggestRows.value[suggestIndex.value]?.title || '' : '';
  searchEvent(picked || keyword.value);
};

watch(
  () => activeRouteName.value,
  async (newVal) => {
    if (newVal === 'FilmIndex') await getFilmSearhConfig();
    applySearchValue('');
  },
);

onMounted(async () => {
  if (activeRouteName.value === 'FilmIndex') await getFilmSearhConfig();
  if (!emitter.all.get('fillSearch')) {
    emitter.on('fillSearch', (kw: string) => {
      // 只是把词填进框里，搜不搜由调用方自己发事件决定，别顺手弹候选
      applySearchValue(kw || '');
    });
  }
  // 站点页增删改源后缓存下来的源和候选都过期了（这个事件 Film 页也在监听，
  // 所以不能像上面那样用 emitter.all.get 判重，改用「先摘再挂」同名的具名函数）
  emitter.off('refreshFilmConfig', resetSuggestSource);
  emitter.on('refreshFilmConfig', resetSuggestSource);
});

onActivated(() => {
  const isListenedRefreshHotConfig = emitter.all.get('refreshHotConfig');
  if (!isListenedRefreshHotConfig) emitter.on('refreshHotConfig', refreshHotConfig);
  if (!emitter.all.get('fillSearch')) {
    emitter.on('fillSearch', (kw: string) => {
      // 只是把词填进框里，搜不搜由调用方自己发事件决定，别顺手弹候选
      applySearchValue(kw || '');
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
  applySearchValue(item ?? '');
  suggestIndex.value = -1;
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
    suggestIndex.value = -1;
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

  .suggest {
    .suggest-nav {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 8px;

      .suggest-title {
        font-weight: 700;
      }

      .suggest-loading {
        font-size: 12px;
        font-weight: 400;
        color: var(--td-text-color-placeholder);
      }
    }

    .suggest-list {
      max-height: 272px;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-thumb {
        border-radius: 3px;
        background-color: var(--td-scrollbar-color, rgba(0, 0, 0, 0.18));
      }
    }

    .suggest-item {
      display: flex;
      align-items: center;
      height: 34px;
      padding: 0 8px;
      border-radius: var(--td-radius-default);
      cursor: pointer;

      .suggest-icon {
        flex: none;
        margin-right: 8px;
        color: var(--td-text-color-placeholder);
      }

      .suggest-text {
        overflow: hidden;
        font-weight: 500;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      &:hover,
      &.is-active {
        background-color: var(--td-bg-color-component-hover);
      }
    }

    .suggest-hit {
      font-style: normal;
      font-weight: 700;
      color: var(--td-brand-color);
    }

    .suggest-empty {
      padding: 10px 8px;
      font-size: 13px;
      font-weight: 400;
      color: var(--td-text-color-placeholder);
    }

    // 最后一行始终是「原样搜索」：候选里没有想要的，也能直接提交整串
    .suggest-submit {
      display: flex;
      align-items: center;
      height: 34px;
      margin-top: 6px;
      padding: 0 8px;
      border-top: 1px solid var(--td-component-stroke);
      border-radius: var(--td-radius-default);
      color: var(--td-text-color-secondary);
      cursor: pointer;

      .suggest-icon {
        flex: none;
        margin-right: 8px;
      }

      .suggest-submit-text {
        overflow: hidden;
        font-weight: 500;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      &:hover {
        background-color: var(--td-bg-color-component-hover);
      }
    }
  }

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
