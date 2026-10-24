export default {
  name: '网盘',
  message: {
    reqError: '网络请求错误',
  },
  infiniteLoading: {
    noMore: '没有更多内容了',
    noData: '暂无数据, 请前往设置-网盘源设置默认源'
  },
  state: {
    noSourceTitle: '还没有可用的网盘源',
    noSourceDesc: '添加一个网盘源并设为默认后, 这里才会显示文件',
    errorTitle: '网盘加载失败',
    errorDesc: '读取网盘配置或目录时出错了, 可以重试, 或去设置里检查网盘源'
  }
}