export default {
  name: 'Film',
  noDesc: 'No Synopsis',
  infiniteLoading: {
    complete: 'Load Complete',
    error: 'Load Error',
    noMore: 'Nothing More',
    noData: 'No data, Please go Setting-SiteSetting set default source',
    netwotkError: 'Network request failed, Please try to refresh manually',
    categoryError: 'Set category exception, Please go to Setting to check source category then try to refresh manually'
  },
  state: {
    noSourceTitle: 'No film source yet',
    noSourceDesc: 'Add a film source and set it as default, then films will show up here',
    emptyTitle: 'No films found',
    emptyDesc: 'Nothing under the current category or filters, try another combination',
    errorTitle: 'Failed to load the film list',
    errorDesc: 'The network or the source may be unavailable, retry or check the source settings'
  }
}
