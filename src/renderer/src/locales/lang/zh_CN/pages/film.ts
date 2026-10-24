export default {
  name: '影视',
  noDesc: '暂无剧情简介',
  infiniteLoading: {
    complete: 'Load Complete',
    error: 'Load Error',
    noMore: '没有更多内容了',
    noData: '暂无数据,请前往设置-影视源设置默认源',
    netwotkError: '网络请求失败, 请尝试手动刷新',
    categoryError: '设置分类异常, 请前往设置检查源分类后尝试手动刷新'
  },
  state: {
    noSourceTitle: '还没有可用的影视源',
    noSourceDesc: '添加一个影视源并设为默认后, 这里才会显示影片',
    emptyTitle: '没有找到影片',
    emptyDesc: '当前分类或筛选条件下没有内容, 可以换个条件再试',
    errorTitle: '影片列表加载失败',
    errorDesc: '可能是网络不通或影视源暂时不可用, 可以重试或检查源配置'
  }
}
