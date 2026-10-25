<template>
  <div class="film view-container">
    <common-nav
      :title="$t('pages.film.name')"
      :list="siteConfig.data"
      :active="active.nav"
      search
      @change-key="changeSitesEvent"
    />
    <div class="content">
      <!-- 无源/请求失败时不再只剩一片空白：给出原因、重试入口和直达设置的按钮 -->
      <state-view
        v-if="pageState"
        :type="pageState === 'error' ? 'error' : 'empty'"
        :title="stateText.title"
        :description="stateText.desc"
        :action-text="pageState === 'noSource' ? $t('pages.state.goSetting') : $t('pages.state.retry')"
        @action="pageState === 'noSource' ? goSiteSetting() : retryLoad()"
      />
      <header v-if="!pageState && classConfig.data.length > 0" class="header">
        <div class="header-nav">
          <tag-nav :list="classConfig.data" :active="active.class" @change-key="changeClassEvent" />
        </div>
        <div v-if="filter.data[active.class]" class="quick_item quick_filter">
          <root-list-icon size="large" @click="isVisible.toolbar = !isVisible.toolbar" />
        </div>
      </header>
      <div v-if="!pageState" class="container"
        :class="classConfig.data.length > 0 ? 'container-full' : 'container-hidden'">
        <!-- 过滤工具栏 -->
        <div v-show="isVisible.toolbar" class="filter header-wrapper">
          <div class="tags">
            <div v-for="filterItem in filter.data[active.class]" :key="filterItem.key" class="tags-list">
              <div class="item title">{{ filterItem.name }}</div>
              <div class="wp">
                <div
                  v-for="item in filterItem.value"
                  :key="item"
                  class="item"
                  :class="{ active: active.filter[filterItem.key] === item.v }"
                  :label="item.n"
                  :value="item.v"
                  @click="changeFilterEvent(filterItem.key, item.v)"
                >
                  {{ item.n }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="back-top" class="content-wrapper">
          <!-- 还没有任何结果可比对时用骨架占位，别把等待变成一片空白 -->
          <t-row v-if="listSkeleton" :gutter="[16, 16]" style="margin: 0">
            <skeleton-grid :count="12" aspect="139.9%" />
          </t-row>
          <t-row v-else :gutter="[16, 16]" style="margin: 0">
            <t-col
              v-for="item in displayList"
              :key="filmKey(item)"
              :md="3"
              :lg="3"
              :xl="2"
              :xxl="1"
              :class="['card', { 'card-stale': listStale }]"
              @click="playEvent(item)"
            >
              <div class="card-main">
                <div v-if="item.vod_remarks || item.vod_remark" class="card-tag card-tag-orange">
                  <span class="card-tag-text text-hide">{{ item.vod_remarks || item.vod_remark }}</span>
                </div>
                <t-image
                  class="card-main-item"
                  :src="thumb(item.vod_pic, 280)"
                  :style="{ height: '100%', background: 'none', overflow: 'hidden' }"
                  :lazy="true"
                  fit="cover"
                  :loading="renderImageLoading"
                  :error="renderImageError"
                >
                  <template #overlayContent>
                    <div v-if="item.relateSite" class="op">
                      <div class="op-box">
                        <span>{{ item.relateSite.name }}</span>
                      </div>
                    </div>
                  </template>
                </t-image>
              </div>
              <div class="card-footer">
                <p class="card-footer-title text-hide">{{ item.vod_name }}</p>
                <p class="card-footer-desc text-hide">
                  <span v-if="item.vod_blurb">{{ item.vod_blurb }}</span>
                  <span v-else-if="item.vod_content">{{ item.vod_content }}</span>
                  <span v-else-if="item.vod_remarks">{{ item.vod_remarks }}</span>
                  <span v-else>{{ $t('pages.film.noDesc') }}</span>
                </p>
              </div>
            </t-col>
          </t-row>
          <infinite-loading
            v-if="isVisible.infiniteLoading"
            class="infinite-loading-container"
            :identifier="infiniteId"
            :distance="200"
            @infinite="load"
          >
            <template #complete>{{ infiniteCompleteTip }}</template>
            <template #error>{{ infiniteCompleteTip || $t('pages.film.infiniteLoading.netwotkError') }}</template>
          </infinite-loading>
        </div>
      </div>
    </div>

    <detail-view
      v-model:visible="isVisible.detail"
      :site="formDetailSite || siteConfig.default"
      :data="formDetailData"
    />
    <folder-view
      v-model:visible="isVisible.folder"
      :site="formFolderSite || siteConfig.default"
      :data="formFolderData"
      @play="onFolderPlay"
    />
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

import compact from 'lodash/compact';
import find from 'lodash/find';
import findIndex from 'lodash/findIndex';
import has from 'lodash/has';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import uniq from 'lodash/uniq';
import PQueue from 'p-queue';
import { MessagePlugin } from 'tdesign-vue-next';
import { RootListIcon } from 'tdesign-icons-vue-next';
import InfiniteLoading from 'v3-infinite-loading';
import { computed, onActivated, onUnmounted, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { prefix } from '@/config/global';
import { t } from '@/locales';
import { usePlayStore, useSettingStore } from '@/store';

import { fetchSiteActive, warmSite } from '@/api/site';
import emitter from '@/utils/emitter';
import { renderImageError, renderImageLoading } from '@/utils/common/imageState';
import { thumb } from '@/utils/common/imgThumb';
import {
  fetchClassify,
  fetchList,
  fetchSearch,
  fetchDetail,
  t3RuleInit,
  t3RuleTerminate,
  catvodRuleInit,
} from '@/utils/cms';

import DetailView from './film/Detail.vue';
import FolderView from './film/DialogFolder.vue';
import CommonNav from '../components/common-nav/index.vue';
import SkeletonGrid from '../components/skeleton-grid/index.vue';
import StateView from '../components/state-view/index.vue';
import TagNav from '../components/tag-nav/index.vue';

const storePlayer = usePlayStore();
const storeSetting = useSettingStore();
const router = useRouter();

const queue = new PQueue({ concurrency: 5 }); // 设置并发限制为5
const infiniteId = ref(+new Date()); // infinite-loading属性重置组件
const searchTxt = ref(''); // 搜索框
const searchCurrentSite = ref(); // 搜索当前源

/* ------------------------------------------------------------ 聚搜调度 */
// 聚搜原先是一轮只打一个源、靠滚动触发下一轮：24 个源要滚 20 次、实测 55.7s 才走完，
// 结果不足一屏时哨兵一直在视口内，干脆推不动。改成一次并发打一批，谁先回来谁先上屏。
// 只有 drpy（type 7）例外，它的 worker 是全局单例，见 runSerial。
const SEARCH_CONCURRENCY = 6; // 一批同时打几个源
const SEARCH_BATCH_GAP = 150; // 批次间隔：让这一批先渲染上屏，再打下一批
// 单次搜索的总预算：源挂住时 request 自身有超时，但 24 个源串成 4 批仍可能拖很久，
// 超出预算就停手，剩下的源留给用户继续滚动时接着搜（游标记着进度）
const SEARCH_TOTAL_BUDGET = 20000;
let searchCursor = 0; // 下一个还没派发的源下标（只增不减，天然防止回头重复搜）
let searchInFlight = false; // 一批在途，挡住 infinite-loading 的重入
let drpyChain: Promise<unknown> = Promise.resolve(); // drpy 串行锁

// drpy 的 doWork 是模块级单例：worker / onmessage / timeout timer 全是共享变量，
// 两个请求交错会互相覆盖 onmessage，先进的那个 Promise 永远等不到 resolve。
// 所以 type 7 一律排队执行，init 与 search 之间也不能夹进别的 t3Work 调用。
const runSerial = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = drpyChain.then(task, task);
  drpyChain = run.catch(() => undefined);
  return run;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const formDetailData = ref({
  neme: '',
  key: '',
  type: 1,
}); //  详情组件源传参
const formDetailSite = ref<{ id?: string; type?: number } | null>(null); // 详情组件实际解析到的源（聚搜结果可能来自其他站）
const formFolderSite = ref<{ id?: string; type?: number } | null>(null); // 目录弹窗实际解析到的源
const formFolderData = ref<{ vod_id?: string; vod_name?: string; vod_tag?: string }>({}); // 网盘文件夹组件源传参
const isVisible = reactive({
  toolbar: false, // 筛选
  hot: false,
  detail: false,
  folder: false,
  loadClass: false,
  infiniteLoading: false,
  gridList: false,
  t3Work: false,
  catvod: false,
  loading: false,
});
const pagination = ref({
  pageIndex: 1,
  pageSize: 36,
  count: 0,
  total: 0,
}); // 分页请求
const filter = ref({
  data: [],
  format: {},
  select: {
    site: '',
    sort: '按更新时间',
    class: '',
    area: '全部',
    year: '全部',
  },
}) as any;

const infiniteCompleteTip = ref(`${t('pages.film.infiniteLoading.noMore')}`);
const listGen = ref(0); // 列表请求代次：切站/分类/筛选/搜索后递增，过期响应直接丢弃

// 整页状态：'' = 正常渲染列表，noSource = 没有可用源，error = 源配置请求失败
const pageState = ref<'' | 'noSource' | 'error'>('');

const stateText = computed(() => {
  const key = pageState.value === 'error' ? 'error' : pageState.value === 'noSource' ? 'noSource' : 'empty';
  return {
    title: t(`pages.film.state.${key}Title`),
    desc: t(`pages.film.state.${key}Desc`),
  };
});

// 空态直接把人送到「影视源设置」，不要求用户自己翻菜单
const goSiteSetting = () => {
  storeSetting.updateConfig({ sysConfigSwitch: 'siteSource' });
  router.push('/setting/index');
};

// 重试：清掉上一轮的列表与分页，让 infinite-loading 以新的 identifier 重新触发
const retryLoad = async () => {
  pageState.value = '';
  isVisible.infiniteLoading = false;
  beginListWait();
  filmData.value = { list: [], rawList: [] };
  listGen.value++;
  pagination.value.pageIndex = 1;
  await getSetting();
  // 这里 infinite-loading 是「重新挂载」（错误态下 v-if 为假），它自己会触发首屏，
  // 不能再用旧实例的 $state 主动拉，否则会与新实例的请求撞页
  if (!pageState.value) infiniteId.value++;
  // 又退回错误/空态时不会有新列表到达，占位要跟着撤掉
  else endListWait();
};

// per-site cache: switch source without full refetch
const siteViewCache = new Map<string, any>();
// 视图缓存存的是整份列表快照(含 rawList, 可能几百条), 无界增长是隐性内存风险。
// 这里做成简单 LRU: 超过上限时淘汰最久未用的源(delete 后重新 set 即回到最新)。
const SITE_VIEW_CACHE_MAX = 10;
const saveSiteCache = (siteId: string) => {
  if (!siteId) return;
  if (siteViewCache.has(siteId)) siteViewCache.delete(siteId);
  siteViewCache.set(siteId, {
    classData: JSON.parse(JSON.stringify(classConfig.value.data || [])),
    filters: JSON.parse(JSON.stringify(filter.value?.data || [])),
    list: JSON.parse(JSON.stringify(filmData.value.list || [])),
    rawList: JSON.parse(JSON.stringify(filmData.value.rawList || [])),
    pageIndex: pagination.value.pageIndex,
    activeClass: active.value.class,
    activeFilter: JSON.parse(JSON.stringify(active.value.filter || {})),
    loadClass: isVisible.loadClass,
  });
  while (siteViewCache.size > SITE_VIEW_CACHE_MAX) {
    const oldest = siteViewCache.keys().next().value;
    if (oldest === undefined) break;
    siteViewCache.delete(oldest);
  }
};

const restoreSiteCache = (siteId: string): boolean => {
  const cached = siteViewCache.get(siteId);
  if (!cached || !cached.list?.length) return false;
  classConfig.value.data = cached.classData?.length ? cached.classData : [{ type_id: 0, type_name: '最新' }];
  filter.value.data = cached.filters || [];
  filmData.value = { list: cached.list, rawList: cached.rawList || cached.list };
  pagination.value.pageIndex = Math.max(cached.pageIndex || 2, 2);
  active.value.class = cached.activeClass ?? classConfig.value.data?.[0]?.type_id ?? 0;
  if (cached.activeFilter) active.value.filter = cached.activeFilter;
  filter.value.format = buildFilterFormat(); // 恢复筛选选择时同步重建请求参数
  isVisible.loadClass = true;
  infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
  return true;
};

const siteConfig = ref({
  default: {
    id: '',
    type: 0,
    categories: '',
    ext: '',
  },
  search: '',
  filter: false,
  data: [],
  searchGroup: [],
}) as any;

const active = ref({
  site: '',
  nav: null,
  class: 0,
  filter: {
    site: '',
    sort: '按更新时间',
    class: '',
    area: '全部',
    year: '全部',
  },
}) as any;

const filmData = ref({
  list: [],
  rawList: [],
}) as any;

// 去重键：同一部片在不同源里的 vod_id 会撞车，所以必须带上来源站点（只有聚搜的
// 结果才带 relateSite）。两侧都用同一个键，跨站点的同 id 结果才不会被误删。
type FilmItem = { vod_id?: string | number; relateSite?: { key?: string; id?: string; name?: string } };

const filmKey = (item: FilmItem | null | undefined): string => {
  const site = item?.relateSite;
  const siteKey = site ? site.key || site.id || site.name || '' : '';
  return `${siteKey}::${item?.vod_id}`;
};

// 追加去重从 O(n×m) 降到 O(n+m)。原来是 _.differenceWith(新页, 已有列表, _.isEqual)，
// 拿每个新条目跟整张已有列表逐个深比较：追加第 14 页（504 条）时单页要跑约 1.9 万次
// 深比较，实测每页耗时从 80ms 线性涨到 212ms —— 越往下翻，新一页落地越慢。
const appendUnique = (incoming: FilmItem[], existing: FilmItem[]): FilmItem[] => {
  const seen = new Set(existing.map((item) => filmKey(item)));
  const fresh: FilmItem[] = [];
  for (const item of incoming) {
    const key = filmKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(item);
  }
  return fresh;
};

const classConfig = ref({
  data: [{ type_id: 0, type_name: '最新' }],
}) as any;

// 切分类/筛选/换源时数据层会把 list 清空等新一页，直接照着渲染就是一次白屏。
// 这里把「数据」和「显示」拆开：新请求在途时先留着上一批卡片并压暗，
// 新数据一到再整体换掉；手上没有上一批（首次进入）才退回骨架占位。
// 上一批卡片的快照：只用于「新结果到达前先垫着」，字段不需要精确建模
type FilmCardItem = { vod_id?: string | number } & Record<string, unknown>;
const lastList = ref<FilmCardItem[]>([]);
const listPending = ref(false);
let listWaitTimer: ReturnType<typeof setTimeout> | null = null;

const displayList = computed(() => (listPending.value && lastList.value.length ? lastList.value : filmData.value.list));
// 压暗中的是上一批结果：不可点，避免点进已经不属于当前分类的条目
const listStale = computed(() => listPending.value && lastList.value.length > 0 && filmData.value.list.length === 0);
const listSkeleton = computed(() => listPending.value && displayList.value.length === 0);

const beginListWait = () => {
  listPending.value = true;
  if (listWaitTimer) clearTimeout(listWaitTimer);
  // 兜底：源站挂住不回时，别让压暗的旧列表一直僵在那里
  listWaitTimer = setTimeout(() => {
    listPending.value = false;
    listWaitTimer = null;
  }, 10000);
};

const endListWait = () => {
  if (listWaitTimer) {
    clearTimeout(listWaitTimer);
    listWaitTimer = null;
  }
  listPending.value = false;
};

// infinite-loading 只在「哨兵进入视口」时才触发；这里把旧卡片留着垫底之后，
// 哨兵被顶到视口外，切分类不会再自己触发请求（实测一次都没发）。
// 所以首屏改成显式拉取：复用最近一次观察者交过来的 $state，状态栏才能照常更新。
let infiniteState: { complete: () => void; loaded: () => void; error: () => void } | null = null;
let firstPageLoading = false;

const reloadList = async () => {
  if (!infiniteState) {
    // 观察者还没跑过（页面刚挂载）：交给组件自己的首次触发
    pagination.value.pageIndex = 1;
    return;
  }
  firstPageLoading = true;
  pagination.value.pageIndex = 1;
  try {
    await load(infiniteState, true);
  } finally {
    firstPageLoading = false;
  }
};

// 新一批「真实网络数据」落地就记成快照，供下一次切换时垫底。
// filterEvent 的客户端重排不在此列（clientFiltering 期间跳过），否则垫底快照
// 会被上一次筛选的残集污染。
watch(
  () => filmData.value.list,
  (list) => {
    if (clientFiltering) return;
    if (list?.length) {
      lastList.value = list;
      endListWait();
    }
  },
);

onMounted(() => {
  getSetting();
});

// 总线注册：off+on 保证同一实例只挂一份，卸载时移除，避免页面重建后监听泄漏/失效
const registerBus = () => {
  emitter.off('refreshFilmConfig', refreshConfig);
  emitter.on('refreshFilmConfig', refreshConfig);
  emitter.off('searchFilm', onSearchFilm);
  emitter.on('searchFilm', onSearchFilm);
};

onActivated(registerBus);

onUnmounted(() => {
  emitter.off('refreshFilmConfig', refreshConfig);
  emitter.off('searchFilm', onSearchFilm);
  if (listWaitTimer) clearTimeout(listWaitTimer);
});

// cms筛选：基于已有数据（纯客户端重排，不发请求）
// 重写 list 会触发下面的 watch，但这里是「筛选后的残集」而非「真实新数据落地」，
// 若照样记进 lastList，切源/切分类时垫底的就会是上一次筛选的残集，还可能和
// 恢复的筛选条件对不上。用 clientFiltering 标志让 watch 跳过这种重写。
let clientFiltering = false;
const filterEvent = () => {
  const { rawList } = filmData.value;
  const { area, year, sort } = active.value.filter;

  const filteredData = rawList
    .filter((item) => area === '全部' || (item['vod_area'] || '').includes(area))
    .filter((item) => year === '全部' || (item['vod_year'] || '').includes(year))
    .sort((a, b) => {
      switch (sort) {
        case '按上映年份':
          return b['vod_year'] - a['vod_year'];
        case '按片名':
          return a['vod_name'].localeCompare(b['vod_name'], 'zh-Hans-CN');
        default:
          return +new Date(b['vod_time']) - +new Date(a['vod_time']);
      }
    });

  clientFiltering = true;
  filmData.value.list = filteredData;
  clientFiltering = false;
};

// 按站点类型构造筛选参数（恢复缓存与筛选切换共用）
const buildFilterFormat = () => {
  const { type } = siteConfig.value.default;
  if (type === 2 || type === 6 || type === 7 || type === 8) {
    return Object.entries(active.value.filter).reduce<{ [key: string]: string | undefined }>((item, [key, value]) => {
      if (typeof value === 'string' && value !== '') {
        item[key] = value as string;
      }
      return item;
    }, {});
  }
  if (type === 3 || type === 4) {
    return Object.entries(active.value.filter)
      .map(([key, value]) => `${key}=${value === '全部' ? '' : value}`)
      .join('&');
  }
  return undefined;
};

// 非cms筛选：基于请求数据
const filterApiEvent = async () => {
  filter.value.format = buildFilterFormat();

  listGen.value++;
  beginListWait();
  filmData.value.list = [];
  filmData.value.rawList = [];
  infiniteId.value++;
  pagination.value.pageIndex = 1;
};

// 筛选条件切换
const changeFilterEvent = (key, item) => {
  console.log(`[film] change filter: ${key}:${item}`);
  active.value.filter[key] = item;

  const { type } = siteConfig.value.default;

  if (type === 1 || type === 0) filterEvent();
  else {
    filterApiEvent();
    void reloadList();
  }
};

const searchGroup = (type: string) => {
  // 全局搜索 + 源搜索 0关闭1聚合搜索2本站搜索
  const defaultConfig = siteConfig.value.default;
  const selfSearch = defaultConfig['search'] !== 0 ? [{ ...defaultConfig }] : [];

  const groupRes = siteConfig.value.data.filter(
    (item) => item['group'] === defaultConfig['group'] && item['search'] === 1,
  );
  const allRes = siteConfig.value.data.filter((item) => item['search'] === 1);

  switch (type) {
    case 'site':
      return selfSearch;
    case 'group':
      return defaultConfig['search'] === 2 ? groupRes.concat(selfSearch) : groupRes;
    case 'all':
      return defaultConfig['search'] === 2 ? allRes.concat(selfSearch) : allRes;
    default:
      return [];
  }
};

const getSetting = async () => {
  try {
    const data = await fetchSiteActive();
    if (has(data, 'default') && !isEmpty(data['default'])) {
      siteConfig.value.default = data['default'];
      active.value.nav = data['default']['id'];
      // 预热默认源：若默认源是网关（type 8）源，后台触发 classify 填 Player 侧缓存 + 网关侧 home 缓存，
      // 让首次点源即命中缓存，规避 spider 首次初始化的冷启动（非 type 8 源由后端忽略）。
      if (data['default']?.type === 8 && data['default']?.id) {
        warmSite(data['default'].id).catch((e) => console.log('[film][warm][error]', e?.message || e));
      }
    } else {
      infiniteCompleteTip.value = t('pages.film.infiniteLoading.noData');
    }
    if (has(data, 'data') && !isEmpty(data['data'])) {
      siteConfig.value.data = data['data'];
    }
    if (has(data, 'filter') && !isEmpty(data['filter'])) {
      siteConfig.value.filter = data['filter'];
    }
    if (has(data, 'search') && !isEmpty(data['search'])) {
      siteConfig.value.search = data['search'];
      siteConfig.value.searchGroup = searchGroup(data['search']);
    }
    // 一个源都没有：整页换成空态并给出「前往设置」，而不是只留一行提示文案
    if (isEmpty(active.value.nav)) {
      pageState.value = 'noSource';
      isVisible.infiniteLoading = false;
      return;
    }
    pageState.value = '';
    isVisible.infiniteLoading = true;
  } catch (err) {
    console.log(err);
    infiniteCompleteTip.value = t('pages.film.infiniteLoading.netwotkError');
    pageState.value = 'error';
    isVisible.infiniteLoading = false;
    MessagePlugin.error(t('pages.film.infiniteLoading.netwotkError'));
  }
};

// 获取地区
const arrangeCmsArea = () => {
  const { rawList } = filmData.value;
  const data = compact(map(rawList, (item) => (item['vod_area'] || '').split(',')[0]));
  data.unshift('全部');
  const dataFormat = uniq(data);

  const listFormat = dataFormat.map((item) => {
    return { n: item, v: item === '全部' ? '' : item };
  });

  const id = active.value.class;
  const currentFilter = filter.value.data[id];
  if (!currentFilter) return;

  const index = findIndex(currentFilter, { key: 'area' });
  if (index === -1) return;
  console.log(`[film] cms filter area: `, listFormat);
  filter.value.data[id][index].value = listFormat;
};

// 获取年份
const arrangeCmsYear = () => {
  const { rawList } = filmData.value;
  const id = active.value.class;
  const { type } = siteConfig.value.default;
  const currentFilter = filter.value.data[id];
  if (!currentFilter) return;
  const index = findIndex(currentFilter, { key: 'year' });
  if (index === -1) return;

  let data;
  if (type === 0) data = compact(map(rawList, (item) => item['vod_year']));
  else data = compact(map(rawList, (item) => (item['vod_year'] || '').split('–')[0]));
  data.unshift('全部');
  const dataFormat = uniq(data);
  const listFormat = dataFormat.map((item) => {
    return { n: item, v: item === '全部' ? '' : item };
  });
  console.log(`[film] cms filter year: `, listFormat);
  filter.value.data[id][index].value = listFormat;
};

// 类别过滤
const categoriesFilter = (classData: any[]): any[] => {
  const list = Array.isArray(classData) ? classData : [];
  const { categories } = siteConfig.value.default;
  if (!categories || categories.trim() === '') return list;

  const categoryList = categories.split(',').map((item) => item.trim());
  const classDataList = list.map((item) => item['type_name']);
  const categoriesInOrder: any[] = [];

  for (const category of categoryList) {
    const isFind = classDataList.indexOf(category);
    if (isFind === -1) continue;

    const foundCategory = list.find((item) => item['type_name'] === category);
    if (foundCategory) {
      categoriesInOrder.push(foundCategory);
    }
  }

  return categoriesInOrder;
};

// 过滤条件-选中第一项
const classFilter = (filters) => {
  const result = {};

  if (has(filters, active.value.class)) {
    filters[active.value.class].forEach((item) => {
      result[item.key] = item.value[0]?.v ?? '全部';
    });
  }

  active.value.filter = result;
};

// 获取分类
const getClassList = async (site) => {
  try {
    const res = await fetchClassify(site);

    const { pagecount, limit, total, classData, filters, homeList } = res;
    const { pageIndex, ...rest } = pagination.value;
    pagination.value = { pageIndex, ...rest, count: pagecount, pageSize: limit, total };
    filter.value.data = filters || {};

    const classDataFormat = categoriesFilter(classData || []);
    const hasCategoryConfig = !!(site.categories && String(site.categories).trim());

    if (isEmpty(classDataFormat)) {
      if (hasCategoryConfig) {
        infiniteCompleteTip.value = t('pages.film.infiniteLoading.categoryError');
        isVisible.loadClass = false;
      } else {
        classConfig.value.data = [{ type_id: 0, type_name: '最新' }];
        active.value.class = 0;
        isVisible.loadClass = true;
        infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
      }
    } else {
      classConfig.value.data = classDataFormat;
      const classItem = classDataFormat[0];
      active.value.class = classItem['type_id'];
      if (!isEmpty(filters)) classFilter(filters);
      isVisible.loadClass = true;
    }

    return { classReady: isVisible.loadClass, homeList: homeList || [] };
  } catch (err) {
    console.log(err);
    // 分类失败不直接判死：列表仍可能可用；仅在完全无数据时由 complete 提示
    if (!isVisible.loadClass) {
      classConfig.value.data = [{ type_id: 0, type_name: '最新' }];
      active.value.class = 0;
      isVisible.loadClass = true;
    }
    if (filmData.value.list.length === 0) {
      infiniteCompleteTip.value = t('pages.film.infiniteLoading.netwotkError');
    }
    return { classReady: isVisible.loadClass, homeList: [] };
  }
};

// 切换分类
const changeClassEvent = (key) => {
  active.value.class = key;
  if (!isEmpty(filter.value.data)) classFilter(filter.value.data);
  filterApiEvent();
  searchTxt.value = '';
  infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
  filmData.value = { list: [], rawList: [] };
  listGen.value++;
  infiniteId.value++;
  pagination.value.pageIndex = 1;
  void reloadList();
};

// 获取资源
const getFilmList = async () => {
  const defaultSite = siteConfig.value.default;
  const pg = pagination.value.pageIndex;
  const t = active.value.class;
  const { format } = filter.value;

  console.log(
    `[film] load parameter: ${defaultSite.type === 2 || defaultSite.type === 7 ? JSON.stringify({ ...format }) : JSON.stringify(format)}`,
  );

  let length = 0;
  const gen = listGen.value;
  try {
    const res = await fetchList(
      defaultSite,
      pg,
      t,
      defaultSite.type === 2 || defaultSite.type === 7 ? { ...format } : format,
    );
    if (gen !== listGen.value) {
      console.log('[film] stale list response dropped');
      return 0;
    }
    const newFilms = appendUnique(res, filmData.value.list);
    filmData.value.list = [...filmData.value.list, ...newFilms];
    // rawList 也要去重：type 0/1（苹果CMS/自定义CMS）的 filterEvent() 是拿 rawList
    // 重新筛选排序后整体赋给 list 的，所以真正决定渲染内容的是 rawList。只去重 list
    // 的话，CMS 分页重叠返回的同一条目还是会从 rawList 绕回来，在 v-for 里撞 key。
    const freshRaw = appendUnique(res, filmData.value.rawList);
    filmData.value.rawList = [...filmData.value.rawList, ...freshRaw];
    if (newFilms.length > 0) {
      pagination.value.pageIndex++;
    }
    if (defaultSite.type === 0 || defaultSite.type === 1) filterEvent();
    length = newFilms.length;
    if (length > 0) {
      infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
    }
  } catch (err) {
    if (gen === listGen.value) infiniteCompleteTip.value = t('pages.film.infiniteLoading.netwotkError');
    console.error(err);
    length = 0;
  } finally {
    console.log(`[film] load data length: ${length}`);
    return length;
  }
};

// 加载
const load = async (
  $state: { complete: () => void; loaded: () => void; error: () => void },
  explicit = false,
) => {
  infiniteState = $state;
  // 显式首屏请求在途时，观察者若因布局变化再次触发同一页就忽略，避免重复请求
  if (!explicit && firstPageLoading && pagination.value.pageIndex <= 1) return;
  console.log('[film] loading...');
  // 第一页即整页首屏：数据到达前先摆骨架，别让容器空着（后续分页不再重置占位）
  if (pagination.value.pageIndex <= 1) beginListWait();
  try {
    if (isEmpty(active.value.nav)) {
      infiniteCompleteTip.value = t('pages.film.infiniteLoading.noData');
      $state.complete();
      return;
    }

    const defaultSite = searchTxt.value ? searchCurrentSite.value : siteConfig.value.default;
    console.log(defaultSite);
    // 搜索不在这里 init：聚搜的每个源规则各不相同，统一 init 只能盖住第一个源，
    // 且首个源失败会把整轮搜索直接判死。改由 searchOneSite 在各自的搜索任务里 init。
    if (!searchTxt.value && defaultSite.type === 7 && !isVisible.t3Work) {
      const res = await t3RuleInit(defaultSite);
      if (res.code === 200) isVisible.t3Work = true;
      else {
        infiniteCompleteTip.value = t('pages.film.infiniteLoading.netwotkError');
        $state.error();
        return; // 初始化失败不再继续请求，避免二次状态跳转与注定失败的加载
      }
    }
    // type8: gateway /init 基本是空对象，跳过省一跳 RTT

    let resLength = 0;
    if (searchTxt.value) {
      resLength = await getSearchList();
    } else if (!isVisible.loadClass) {
      // 串行：先拿分类（会设置 active.value.class），再请求列表。之前这里用
      // Promise.allSettled 并发，getFilmList 同步读 active.value.class 时拿到的是切源
      // 占位的 0（而非真实分类），而很多源对 tid=0 返回空列表，导致列表空、蒙版卡住。
      const classInfo = await getClassList(defaultSite);
      resLength = await getFilmList();
      if (resLength === 0 && classInfo?.homeList?.length) {
        filmData.value.list = classInfo.homeList;
        filmData.value.rawList = classInfo.homeList;
        resLength = classInfo.homeList.length;
        pagination.value.pageIndex = 2;
      }
      // class failed but list worked — clear network error tip
      if (resLength > 0) {
        infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
      }
    } else {
      resLength = await getFilmList();
    }

    if (resLength === 0 || filmData.value.list[0]?.vod_name === '无数据,防无限请求') {
      $state.complete();
    } else {
      if (defaultSite.type === 0 || defaultSite.type === 1) {
        arrangeCmsArea();
        arrangeCmsYear();
      }
      $state.loaded();
    }
  } catch (err) {
    console.error(err);
    $state.error();
  } finally {
    // 第一页（或切分类后的第一页）一落地就收起占位；后续分页调用重复置 false 无副作用
    endListWait();
  }
};

// 搜索
const searchEvent = async () => {
  console.log(`[film] search keyword:${searchTxt.value}`);
  infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
  beginListWait();
  filmData.value.list = [];
  filmData.value.rawList = [];
  // 搜索是一次全新查询，必须同时丢掉上一屏的快照。
  // displayList 会在 listPending 期间回落到 lastList，若不清空，结果到达前用户看到的
  // 仍是切走前的旧卡片（首页列表），表现为「搜了没反应 / 搜不出来内容」。
  lastList.value = [];
  listGen.value++;
  infiniteId.value++;
  pagination.value.pageIndex = 1;
  // 新一次搜索从第一个源重新开始：游标归零、在途标记清掉，否则会接着上一次的尾巴搜
  searchCursor = 0;
  searchInFlight = false;
  searchCurrentSite.value = siteConfig.value.searchGroup ? siteConfig.value.searchGroup[0] : null;
  void reloadList();
};

// 单个源的一次搜索：搜索 → 补图 → 去重入列表。聚搜时谁先回来谁先落地，
// 用户不用等最慢的那个源。返回本源的净新增条数，失败/空结果一律算 0。
const searchOneSite = async (site: any, gen: number, pg = 1): Promise<number> => {
  const doSearch = async () => {
    if (site.type === 7) {
      try {
        // drpy 必须先 init 本源的规则才能 search；两步都在这把锁里，中间不许夹别的源
        const initRes = await t3RuleInit(site);
        if (initRes?.code !== 200) {
          console.log(`[film][search][drpy-init-fail] ${site.name}`);
          return null;
        }
        return await fetchSearch(site, searchTxt.value, pg);
      } finally {
        // 搜完 worker 里装的是这个聚搜源的规则，回到常规浏览前必须让 load 重新 init，
        // 否则会拿别人的规则去请求分类列表（原实现是在聚搜收尾时统一复位）
        isVisible.t3Work = false;
      }
    }
    return fetchSearch(site, searchTxt.value, pg);
  };

  try {
    const resultSearch: any = site.type === 7 ? await runSerial(doSearch) : await doSearch();
    if (gen !== listGen.value) return 0; // 期间换了关键词/离页，结果作废
    if (!resultSearch || resultSearch.length === 0) return 0;

    let resultDetail =
      siteConfig.value.filter === 'on'
        ? resultSearch.filter((item) => item?.vod_name.indexOf(searchTxt.value) > -1)
        : resultSearch;

    if (resultSearch.length > 0 && !has(resultSearch[0], 'vod_pic')) {
      if ([0, 1].includes(site.type)) {
        const ids = resultSearch.map((item) => item.vod_id);
        resultDetail = await fetchDetail(site, ids.join(','));
      } else if ([2, 6, 7].includes(site.type)) {
        console.log('[film][search] updatePic not use in drpy/hipy sites.');
      } else {
        const updatePic = async (item) => {
          try {
            const result = await fetchDetail(site, item.vod_id);
            return result[0];
          } catch (error) {
            return false;
          }
        };
        const res = await Promise.all(resultSearch.map((item) => queue.add(() => updatePic(item))));
        resultDetail = res.filter(Boolean);
      }
    }

    if (gen !== listGen.value) return 0;
    const filmList = resultDetail.map((item) => ({
      ...item,
      relateSite: site,
    }));
    const newFilms = appendUnique(filmList, filmData.value.list); // 去重
    if (newFilms.length) filmData.value.list.push(...newFilms);
    return newFilms.length;
  } catch (err) {
    // 单个源挂掉只丢这个源，不能拖累整轮聚搜
    console.log(`[film][search][site-fail] ${site?.name}: ${err}`);
    return 0;
  }
};

// 搜索加载数据
const getSearchList = async () => {
  const gen = listGen.value;
  const searchGroup: any = siteConfig.value.searchGroup;

  if (!searchGroup || !searchGroup.length) {
    console.log('[film][search] No search site found.');
    return 0;
  }

  // 单源搜索保持原语义：一次一问，问完页号加一，搜空即收尾
  if (searchGroup.length === 1) {
    const added = await searchOneSite(searchGroup[0], gen, pagination.value.pageIndex);
    if (gen !== listGen.value) return 0;
    pagination.value.pageIndex++;
    return added;
  }

  // 聚搜：游标只增不减，全部派发完就收尾。原实现「索完一轮就把 searchCurrentSite
  // 停在最后一个源」，空源又返回 1 让滚动继续触发，于是同一个源被反复搜、
  // 一次滚动打几十个请求也停不下来——游标到顶直接返回 0 就是在堵这个口子。
  if (searchInFlight) {
    await sleep(SEARCH_BATCH_GAP); // 上一批还在飞：等一拍再让哨兵试，避免空转刷屏
    return 1;
  }
  if (searchCursor >= searchGroup.length) return 0;

  searchInFlight = true;
  const deadline = Date.now() + SEARCH_TOTAL_BUDGET;
  try {
    // 这里是把游标一路推到底，而不是「跑一批就返回、等哨兵再触发」：
    // 结果一多就把哨兵顶出视口，而哨兵只在「进入视口」时才会回调，用户不滚动
    // 后半批源就永远不会被搜。批与批之间留一个小间隔，让这一批先渲染上屏。
    while (searchCursor < searchGroup.length && Date.now() < deadline) {
      const batch = searchGroup.slice(searchCursor, searchCursor + SEARCH_CONCURRENCY);
      searchCursor += batch.length;
      console.log(`[film][search] batch ${batch.length} sites, cursor=${searchCursor}/${searchGroup.length}`);
      // allSettled：单源失败不影响同批其它源（searchOneSite 内部已兜住异常）
      await Promise.allSettled(batch.map((site) => searchOneSite(site, gen)));
      if (gen !== listGen.value) return 0; // 换词/离页：剩下的批次不必再打
      if (searchCursor < searchGroup.length) await sleep(SEARCH_BATCH_GAP);
    }
  } finally {
    // 守卫代次：期间用户又搜了新词时，这批已经作废，不能顺手把新批次的在途标记清掉，
    // 否则哨兵会立刻再开一批，游标跳着走、同几个源被重复搜
    if (gen === listGen.value) searchInFlight = false;
  }

  if (gen !== listGen.value) return 0;
  // 预算用完但还有源没搜：返回非 0，让用户继续滚动时接着搜（游标记着进度）
  if (searchCursor < searchGroup.length) return 1;
  // 全搜完了：有结果就让无限滚动收尾，没结果直接 complete
  return filmData.value.list.length > 0 ? 1 : 0;
};

// 切换站点
const changeSitesEvent = async (key: string) => {
  const prevId = siteConfig.value.default?.id;
  if (prevId && prevId !== key) saveSiteCache(prevId);

  isVisible.infiniteLoading = true;
  isVisible.t3Work = false;
  if (siteConfig.value.default.type === 7) await t3RuleTerminate();
  isVisible.catvod = false;
  infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
  searchTxt.value = '';
  const res = find(siteConfig.value.data, { id: key });
  active.value.nav = key;
  siteConfig.value.default = res;
  beginListWait();
  filmData.value = { list: [], rawList: [] };
  filter.value = {
    data: [],
    format: {},
    select: {
      site: '',
      sort: '按更新时间',
      class: '',
      area: '全部',
      year: '全部',
    },
  };
  classConfig.value.data = [{ type_id: 0, type_name: '最新' }];
  isVisible.loadClass = false;
  pagination.value.pageIndex = 1;
  active.value.class = 0;
  listGen.value++;

  const hit = restoreSiteCache(key);
  if (hit) {
    console.log(`[film] site cache hit: ${key}`);
  } else {
    console.log(`[film] site cache miss: ${key}`);
  }
  infiniteId.value++;
  // 命中缓存时列表已经就位，直接显式重拉会把第一页叠在缓存后面；
  // 只有空列表才需要主动拉首屏（否则压暗的旧卡片会把哨兵顶出视口）
  if (!hit) void reloadList();
  siteConfig.value.searchGroup = await searchGroup(siteConfig.value.search);
};

// msearch:###关键词?##封面@headers — TV 同类 id 不走详情，直接搜
const parseMsearchKeyword = (id: string, fallback = '') => {
  const m = String(id || '').match(/^msearch:###(.*?)(?:\?##|$)/);
  const kw = (m?.[1] || '').trim();
  return kw || String(fallback || '').trim();
};

// 播放
const playEvent = async (item) => {
  const rawId = String(item?.vod_id || '');
  const isFolder = String(item?.vod_tag || '') === 'folder';
  if (rawId.startsWith('msearch:')) {
    // TV 同类：不取详情，用榜单片名填搜索框并聚搜
    const kw = String(item?.vod_name || '').trim() || parseMsearchKeyword(rawId);
    console.log(`[film][playEvent][msearch] -> search`, kw);
    if (!kw) return;
    const allSearchable = (siteConfig.value.data || []).filter((s) => s && Number(s.search) !== 0);
    siteConfig.value.search = 'all';
    siteConfig.value.searchGroup = allSearchable.length ? allSearchable : searchGroup('all');
    emitter.emit('fillSearch', kw);
    emitter.emit('searchFilm', { kw, group: 'all', filter: siteConfig.value.filter });
    return;
  }

  isVisible.loading = true;

  try {
    let site = siteConfig.value.default;
    if (has(item, 'relateSite')) {
      const relateSite = item.relateSite;
      site = relateSite;
      try {
        if (relateSite.type === 7) {
          await t3RuleTerminate(); // 搜索加载和详情同时触发会冲突, 优先详情, 会阻断搜索加载
          const res = await t3RuleInit(relateSite);
          if (res.code === 200) isVisible.t3Work = true;
        } else if (relateSite.type === 8) {
          const content = await catvodRuleInit(relateSite);
          if (typeof content === 'object') isVisible.catvod = true;
        }
      } catch (err) {
        console.log(`[film][playEvent][error]`, err);
      } finally {
        isVisible.t3Work = false;
        isVisible.catvod = false;
      }
    }

    if (!('vod_play_from' in item && 'vod_play_url' in item)) {
      const detail = await fetchDetail(site, item.vod_id);
      if (!detail || (!detail[0]?.vod_name && !detail[0]?.vod_play_from)) {
        throw new Error(`empty detail: site=${site?.key || site?.name || '?'} id=${item.vod_id}`);
      }
      item = detail[0];
    }
    if (!item?.vod_name && !item?.vod_play_from) {
      throw new Error(`invalid detail item: site=${site?.key || site?.name || '?'} id=${item?.vod_id}`);
    }

    // 网盘文件夹：进目录浏览弹窗（列文件名，可继续下钻），不能当影片直接开播放窗
    if (isFolder) {
      formFolderData.value = item;
      formFolderSite.value = site;
      isVisible.folder = true;
      return;
    }

    const playerMode = storePlayer.getSetting.playerMode;
    if (playerMode.type === 'custom') {
      formDetailData.value = item;
      formDetailSite.value = site;
      isVisible.detail = true;
    } else {
      storePlayer.updateConfig({
        type: 'film',
        status: true,
        data: {
          info: item,
          ext: { site: site },
        },
      });

      window.electron.ipcRenderer.send('openPlayWindow', item.vod_name || '');
    }
  } catch (err) {
    console.error(`[film][playEvent][error]`, err);
    MessagePlugin.warning(t('pages.chase.reqError'));
  } finally {
    isVisible.loading = false;
  }
};

// 目录浏览里点到文件：走正常播放流程（playerMode 非 custom 直接开播放窗，custom 才进详情选集）
const onFolderPlay = (info) => {
  isVisible.folder = false;
  playEvent(info);
};

const onSearchFilm = (data: any) => {
  console.log('[film][bus][receive]', data);
  const { kw, group, filter } = data;
  searchTxt.value = kw;
  siteConfig.value.filter = filter;
  if (siteConfig.value.search !== group) {
    siteConfig.value.search = group;
    siteConfig.value.searchGroup = searchGroup(group);
  }
  searchEvent();
};

const refreshConfig = async () => {
  console.log('[film][bus][refresh]');
  isVisible.loadClass = false;
  isVisible.t3Work = false;
  if (siteConfig.value.default.type === 7) await t3RuleTerminate();
  isVisible.catvod = false;
  infiniteCompleteTip.value = t('pages.film.infiniteLoading.noMore');
  searchTxt.value = '';
  await getSetting();
  classConfig.value.data = [{ type_id: 0, type_name: '最新' }];
  // 源配置变了，上一批卡片不属于新配置，不能再垫底显示
  lastList.value = [];
  beginListWait();
  filmData.value = { list: [], rawList: [] };
  filter.value = {
    data: [],
    format: {},
    select: {
      site: '',
      sort: '按更新时间',
      class: '',
      area: '全部',
      year: '全部',
    },
  };
  listGen.value++;
  infiniteId.value++;
  pagination.value.pageIndex = 1;
  // 配置请求失败会落到整页状态，此时不会再触发列表请求
  if (pageState.value) endListWait();
};
</script>

<style lang="less" scoped>
.film {
  height: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  position: relative;
  overflow: hidden;

  .membership-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    width: 148px;
    border: 2px solid rgba(132, 133, 141, 0.16);
    transition: all 0.3s ease;
    font-size: 14px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 20px;

    .member-name {
      font-size: 12px;
      margin-left: 4px;
    }
  }

  .nav-sub-tab-member-info {
    margin-top: var(--td-comp-margin-s);
  }

  .content {
    // width: calc(100% - 170px);
    min-width: 750px;
    position: relative;
    padding: var(--td-comp-paddingTB-xs) var(--td-comp-paddingTB-s);
    background-color: var(--td-bg-color-container);
    border-radius: var(--td-radius-default);
    flex: 1;
    display: flex;
    flex-direction: column;

    .header {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      justify-content: space-between;
      white-space: nowrap;
      flex-shrink: 0;
      width: 100%;

      .header-nav {
        width: 100%;
        overflow: hidden;
      }

      .quick_filter {
        display: flex;
        align-items: center;
        cursor: pointer;
      }
    }

    .container-full {
      height: calc(100% - 58px);
    }

    .container-hidden {
      height: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      width: 100%;

      .filter {
        position: relative;
        height: auto;
        margin-bottom: 10px;
        transition: height 0.3s;
        width: 100%;

        .tags {
          width: 100%;

          .tags-list {
            padding-top: var(--td-comp-paddingTB-xs);
            width: 100%;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;

            &:after {
              clear: both;
              display: block;
              height: 0;
              visibility: hidden;
              content: '';
            }

            .title {
              // float: left;
              width: 50px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              text-align: left;
              cursor: auto;
              box-sizing: border-box;
              height: 30px;
              font-weight: 400;
              font-size: 15px;
              line-height: 30px;
            }

            .wp {
              // float: left;
              // width: calc(100% - 50px);
              width: 100%;
              overflow-y: auto;
              white-space: nowrap;
              flex-wrap: nowrap;
              display: flex;
              align-items: center;
              justify-content: flex-start;
              align-content: center;

              &::-webkit-scrollbar {
                height: 8px;
                background: transparent;
              }

              .item {
                display: block;
                padding: 0 14px;
                margin-right: 5px;
                box-sizing: border-box;
                height: 30px;
                font-weight: 400;
                font-size: 13px;
                line-height: 30px;
                text-align: center;
                cursor: pointer;
              }

              .active {
                height: 30px;
                border-radius: 20px;
                background: var(--td-bg-color-component);
              }
            }
          }
        }
      }

      .content-wrapper {
        overflow-y: auto;
        overflow-x: hidden;
        width: 100%;
        height: 100%;
        position: relative;

        .card {
          box-sizing: border-box;
          width: inherit;
          position: relative;
          cursor: pointer;

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
            overflow: hidden;
            border-radius: 7px;
            padding-top: 139.9%;

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

          .card-main:hover {
            .card-main-item {
              :deep(img) {
                transition: all 0.25s ease-in-out;
                transform: scale(1.05);
              }
            }
          }

          .card-footer {
            position: relative;
            padding-top: var(--td-comp-paddingTB-s);

            .card-footer-title {
              font-weight: 700;
              line-height: var(--td-line-height-title-medium);
              height: 22px;
            }

            .card-footer-desc {
              font-size: 13px;
              line-height: var(--td-line-height-body-large);
              color: var(--td-text-color-placeholder);
            }
          }

          &:hover {
            .card-footer-title {
              color: var(--td-brand-color);
            }
          }

          // 切分类后新结果还没回来：压暗上一批并挡住点击，
          // 比把网格整个清空再重画少一次视觉断裂
          &-stale {
            opacity: 0.4;
            filter: saturate(0.6);
            pointer-events: none;
            transition: opacity 0.2s ease;
          }
        }
      }
    }
  }
}
</style>
