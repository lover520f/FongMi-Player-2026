import XgPlayer, { Events, SimplePlayer } from 'xgplayer';
import Danmu from 'xgplayer/es/plugins/danmu';
import LivePreset from 'xgplayer/es/presets/live';
// import FlvPlugin from 'xgplayer-flv';
import FlvPlugin from 'xgplayer-flv.js';
// import HlsPlugin from 'xgplayer-hls';
import HlsPlugin from 'xgplayer-hls.js';
import Mp4Plugin from 'xgplayer-mp4';
import ShakaPlugin from 'xgplayer-shaka';
// import DashPlugin from 'xgplayer-dash';

import { publicColor, publicIcons, publicStorage } from './components';

const publicListener = {
  timeUpdate: null as any,
  sendDanmu: null as any,
  playrateUpdate: null as any,
  volumeUpdate: null as any,
  error: null as any,
};

// 西瓜、火山公共部分参数
const publicConfigVeXg = {
  url: '',
  autoplay: true,
  pip: true,
  cssFullscreen: false,
  // xgplayer 默认 keyShortcut: true（←→ 快进 10s、↑↓ 音量、f/m/空格）。
  // 键位与步长和别的内核不一致，统一关掉，改由 pages/Play.vue 提供。
  keyShortcut: false,
  startTime: 0,
  playbackRate: {
    list: [
      2,
      1.5,
      1.25,
      {
        rate: 1,
        iconText: {
          zh: '倍速',
        },
      },
      0.75,
      0.5,
    ],
    index: 7,
  },
  time: {
    index: 0,
  },
  icons: {
    play: publicIcons.play,
    pause: publicIcons.pause,
    playNext: publicIcons.playNext,
    fullscreen: publicIcons.fullscreen,
    exitFullscreen: publicIcons.exitFullscreen,
    volumeSmall: publicIcons.volumeSmall,
    volumeLarge: publicIcons.volumeLarge,
    volumeMuted: publicIcons.volumeMuted,
    pipIcon: publicIcons.pipIcon,
    pipIconExit: publicIcons.pipIconExit,
    openDanmu: publicIcons.openDanmu,
    closeDanmu: publicIcons.closeDanmu,
  },
  commonStyle: {
    playedColor: publicColor.theme, // 播放完成部分进度条底色
    volumeColor: publicColor.theme, // 音量颜色
  },
  width: 'auto',
  height: '100%',
};

// 播放器配置
const options = {
  ...publicConfigVeXg,
  url: '',
  type: '',
  id: 'xgplayer',
  enableContextmenu: true,
  danmu: {
    panel: false,
    comments: [],
    area: { start: 0, end: 0.3 },
    defaultOff: true, //开启此项后弹幕不会初始化，默认初始化弹幕
  },
  plugins: [],
};

const barrge = (player: XgPlayer, comments: any, _url: string, _id: string) => {
  player.plugins.danmu.updateComments(comments, true);
  // player.getPlugin('danmu').updateComments(comments, true); // 效果一样
  // player.plugins.danmu.sendComment({
  //   duration: 5000, //弹幕持续显示时间,毫秒(最低为5000毫秒)
  //   id: nanoid(), //弹幕id，需唯一
  //   start: player.currentTime * 1000, //弹幕出现时间，毫秒
  //   color: true, //该条弹幕为彩色弹幕，默认false
  //   txt: '', //弹幕文字内容
  //   style: {
  //     //弹幕自定义样式
  //     color: '#FFFFFF',
  //   },
  // }); // 应插件内实现
};

const create = (options: any): XgPlayer => {
  const plugins = options.plugins;

  switch (options.type) {
    case 'customMp4':
      options.plugins = [...plugins, Mp4Plugin];
      break;
    case 'customFlv':
      options.plugins = [...plugins, FlvPlugin];
      break;
    case 'customHls':
      options.plugins = [...plugins, HlsPlugin];
      break;
    case 'customDash':
      options.plugins = [...plugins, ShakaPlugin];
      break;
    case 'customWebTorrent':
      break;
    default:
      break;
  }
  delete options.type;
  let player;
  if (options.isLive) {
    SimplePlayer.defaultPreset = LivePreset;
    player = new SimplePlayer({ ...options });
  } else {
    options.plugins = [...options.plugins, Danmu];
    player = new XgPlayer({ ...options });
  };

  player.storage = new publicStorage('xgplayer_settings');

  player.once(Events.READY, () => {
    if (!options.isLive) player.playbackRate = player.storage.get('playrate') || 1;
    player.volume = player.storage.get('volume') || 1;
  });

  publicListener.playrateUpdate = () => {
    player.storage.set('playrate', player.playbackRate);
  };
  player.on(Events.RATE_CHANGE, publicListener.playrateUpdate);

  publicListener.volumeUpdate = () => {
    player.storage.set('volume', player.volume);
  };
  player.on(Events.VOLUME_CHANGE, publicListener.volumeUpdate);

  return player;
};

const currentTime = (player: XgPlayer): number => {
  return player.currentTime || 0;
};

const destroy = (player: XgPlayer) => {
  player.destroy();
};

const duration = (player: XgPlayer): number => {
  return player.duration || 0;
};

const pause = (player: XgPlayer) => {
  player.pause();
};

const play = (player: XgPlayer) => {
  player.play();
};

const playNext = (player: XgPlayer, options: any) => {
  switch (options.type) {
    case 'customMp4':
      options.plugins = [Danmu, Mp4Plugin];
      break;
    case 'customFlv':
      options.plugins = [Danmu, FlvPlugin];
      break;
    case 'customHls':
      options.plugins = [Danmu, HlsPlugin];
      break;
    case 'customDash':
      options.plugins = [Danmu, ShakaPlugin];
      break;
    case 'customWebTorrent':
      break;
    default:
      break;
  }
  player.playNext({ url: options.url });
  if (player.plugins?.danmu) player.plugins.danmu.clear();
};

const seek = (player: XgPlayer, time: number) => {
  // 数据已就绪可直接seek,否则监听LOADED_DATA,避免事件先于监听触发导致seek丢失
  const media = player.media as HTMLVideoElement | null;
  if (media && media.readyState >= 2) {
    player.seek(time);
    return;
  }
  player.once(Events.LOADED_DATA, () => {
    player.seek(time);
  });
};

const speed = (player: XgPlayer, speed: number) => {
  player.once(Events.LOADED_DATA, () => {
    player.playbackRate = speed;
  });
};

const time = (player: XgPlayer) => {
  return {
    currentTime: player.currentTime || 0,
    duration: player.duration || 0,
  };
};

const offBarrage = (_player: XgPlayer) => {
  // player.offAll();
  // 无该事件
};

const onTimeUpdate = (player: XgPlayer, callback: any) => {
  publicListener.timeUpdate = ({ currentTime, duration }) => callback({ currentTime, duration });
  player.on(Events.TIME_UPDATE, publicListener.timeUpdate);
};

const offTimeUpdate = (player: XgPlayer) => {
  if (!publicListener.timeUpdate) return;
  player.off(Events.TIME_UPDATE, publicListener.timeUpdate);
  publicListener.timeUpdate = null;
};

const onError = (player: XgPlayer, callback: any) => {
  if (!callback) return;
  publicListener.error = () => callback({ engine: 'xgplayer' });
  player.on(Events.ERROR, publicListener.error);
  player.on(Events.SOURCE_ERROR, publicListener.error);
};

const offError = (player: XgPlayer) => {
  if (!publicListener.error) return;
  player.off(Events.ERROR, publicListener.error);
  player.off(Events.SOURCE_ERROR, publicListener.error);
  publicListener.error = null;
};

const toggle = (player: XgPlayer) => {
  if (player.paused) player.play();
  else player.pause();
};

const volume = (player: Artplayer, volume: number) => {
  player.volume = volume;
};

export {
  options,
  barrge,
  create,
  currentTime,
  destroy,
  duration,
  pause,
  play,
  playNext,
  seek,
  speed,
  time,
  onTimeUpdate,
  offBarrage,
  offTimeUpdate,
  onError,
  offError,
  toggle,
  volume,
};
