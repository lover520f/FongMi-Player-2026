export default {
  name: 'Drive',
  message: {
    reqError: 'request network error',
  },
  infiniteLoading: {
    noMore: 'nothing more',
    noData: 'no data, please go Setting-DriveSetting set default source'
  },
  state: {
    noSourceTitle: 'No drive source yet',
    noSourceDesc: 'Add a drive source and set it as default, then files will show up here',
    errorTitle: 'Failed to load the drive',
    errorDesc: 'Reading the drive config or directory failed, retry or check the drive source in settings'
  }
}