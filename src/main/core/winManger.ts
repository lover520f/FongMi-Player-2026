import { is } from '@electron-toolkit/utils';
import { enable as renoteEnable } from '@electron/remote/main';
import { attachTitleBarToWindow } from '@electron-uikit/titlebar';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { register as localshortcutRegister, unregisterAll as localshortcutUnregisterAll } from 'electron-localshortcut';
import { join } from 'path';
import url from 'url';

import { setting } from './db/service';
import logger from './logger';

import loadHtml from '../../../resources/html/load.html?asset';

const winPool = {};

// 已注册监听的窗口名：复用窗口时重复注册会导致 F12 双开关 devtools、close 事件重复触发
const wiredWindows = new Set<string>();

const createWin = (name, options) => {
  const args = Object.assign({}, options);

  let win: BrowserWindow;

  if (winPool[name] && !getWin(name)?.isDestroyed()) {
    win = getWin(name)!;
    if (!win.isVisible()) win.show();
    win.focus();
    // 不再 reload：调用方（createMain/createPlay/createLoad）随后都会自行 loadURL/loadFile，
    // 额外的 reload 会与之竞争产生双重导航
  } else {
    win = new BrowserWindow(args);
    attachTitleBarToWindow(win);
    winPool[name] = win.id;
    wiredWindows.delete(name); // 新窗口需要重新注册监听
  }

  return win;
};

const getWin = (name: string) => {
  const id = winPool[name];
  logger.info(`[winManager][getWin]name:${name} id:${id}`);

  if (id) return BrowserWindow.fromId(Number(id));
  else return null;
};

const getAllWin = () => {
  return BrowserWindow.getAllWindows();
};

const closeAllWin = () => {
  try {
    for (const i in winPool) {
      const win = getWin(i);
      if (win && !win.isDestroyed()) {
        getWin(i)!.close();
      }
    }
    app.quit();
  } catch (err) {
    logger.error(`[winManger][error]${err}`);
  }
};

const createMain = () => {
  const db: any = getWindowState('main');
  const mainWindow: BrowserWindow = createWin('main', {
    width: db.status ? db.position.width : 1000,
    height: db.status ? db.position.height : 640,
    x: db.status ? db.position.x : null,
    y: db.status ? db.position.y : null,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000' : '#fff',
    // titleBarStyle: 'hidden',
    titleBarStyle: 'hiddenInset',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: 'fmplayer',
    trafficLightPosition: { x: 12, y: 20 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      webSecurity: false,
      spellcheck: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });

  const fresh = !wiredWindows.has('main');
  if (fresh) {
    wiredWindows.add('main');
    renoteEnable(mainWindow.webContents);
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (!fresh) return; // 复用窗口：只重新加载页面，监听保持首次注册

  mainWindow.webContents.setWindowOpenHandler((details) => {
    mainWindow!.webContents.send('blockUrl', details.url);
    if (['github.com'].some((url) => details.url.includes(url))) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('ready-to-show', () => {
    localshortcutRegister(mainWindow!, ['CommandOrControl+Shift+I', 'F12'], () => {
      if (mainWindow!.webContents.isDevToolsOpened()) {
        mainWindow!.webContents.closeDevTools();
      } else {
        mainWindow!.webContents.openDevTools();
      }
    });
    mainWindow!.show();

    // setTimeout(() => {
    // mainWindow!.show();
    //   const loadWindow = getWin('load');
    //   if (loadWindow && !loadWindow.isDestroyed()) {
    //     loadWindow.hide();
    //     loadWindow.destroy();
    //   }
    // }, 1000);
  });

  mainWindow.on('close', () => {
    saveWindowState('main');
    localshortcutUnregisterAll(mainWindow!);
  });

  mainWindow.on('closed', () => {
    delete winPool['main'];
    wiredWindows.delete('main');
  });

  mainWindow.webContents.on('did-attach-webview', (_, wc) => {
    wc.setWindowOpenHandler((details) => {
      mainWindow!.webContents.send('blockUrl', details.url);
      return { action: 'deny' };
    });
  });

  if (is.dev) {
    mainWindow!.webContents.on('console-message', (_, level, message, line, sourceId) => {
      logger.info(`[vue][level: ${level}][file: ${sourceId}][line: ${line}] ${message}`);
    });
  }
};

const createPlay = () => {
  const db: any = getWindowState('play');
  const playWindow: BrowserWindow = createWin('play', {
    width: db.status ? db.position.width : 875,
    height: db.status ? db.position.height : 550,
    x: db.status ? db.position.x : null,
    y: db.status ? db.position.y : null,
    minWidth: 525,
    minHeight: 280,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000' : '#fff',
    // titleBarStyle: 'hidden',
    titleBarStyle: 'hiddenInset',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: 'zy-play',
    trafficLightPosition: { x: 12, y: 20 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      spellcheck: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });

  const fresh = !wiredWindows.has('play');
  if (fresh) {
    wiredWindows.add('play');
    renoteEnable(playWindow.webContents);
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    playWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/play`);
  } else {
    playWindow.loadURL(
      url.format({
        pathname: join(__dirname, '../renderer/index.html'),
        protocol: 'file:',
        slashes: true,
        hash: 'play',
      }),
    );
  }

  if (!fresh) return; // 复用窗口：只重新加载页面，监听保持首次注册

  playWindow!.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  playWindow.on('ready-to-show', () => {
    localshortcutRegister(playWindow!, ['CommandOrControl+Shift+I', 'F12'], () => {
      const webContents = playWindow!.webContents;
      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools();
      } else {
        webContents.openDevTools();
      }
    });

    playWindow!.show();
  });

  playWindow.on('close', () => {
    saveWindowState('play');
    if (playWindow) playWindow.webContents.send('destroy-playerWindow');
    localshortcutUnregisterAll(playWindow!);
  });

  playWindow.on('closed', () => {
    delete winPool['play'];
    wiredWindows.delete('play');
    const mainWindow = getWin('main');
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMain();
    } else {
      mainWindow.show();
    }
  });

  if (is.dev) {
    playWindow!.webContents.on('console-message', (_, level, message, line, sourceId) => {
      logger.info(`[vue][level: ${level}][file: ${sourceId}][line: ${line}] ${message}`);
    });
  }
};

const createLoad = () => {
  const db: any = getWindowState('load');
  const loadWindow: BrowserWindow = createWin('load', {
    width: db.status ? db.position.width : 1000,
    height: db.status ? db.position.height : 640,
    x: db.status ? db.position.x : null,
    y: db.status ? db.position.y : null,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000' : '#fff',
    // titleBarStyle: 'hidden',
    titleBarStyle: 'hiddenInset',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: 'zy-load',
    trafficLightPosition: { x: 12, y: 20 },
    webPreferences: {
      hardwareAcceleration: false,
    },
  });

  loadWindow.loadFile(loadHtml);

  if (wiredWindows.has('load')) return; // 复用窗口：只重新加载页面，监听保持首次注册
  wiredWindows.add('load');

  loadWindow.on('ready-to-show', () => loadWindow!.show());
  loadWindow.on('closed', () => {
    delete winPool['load'];
    wiredWindows.delete('load');
  });
};

const getWindowState = (name: string) => {
  const db = setting.find({ key: 'windowPosition' }).value || {
    status: false,
    position_main: { width: 1000, height: 640 },
    position_play: { width: 1000, height: 640 },
  };
  let data = {};
  if (name === 'main' || name === 'load') {
    data = {
      status: db.status,
      position: db.position_main,
    };
  } else if (name === 'play') {
    data = {
      status: db.status,
      position: db.position_play,
    };
  } else {
    data = db;
  }
  return data;
};

const saveWindowState = (name: string) => {
  const win = getWin(name);
  const bounds = win!.getBounds();
  const db = getWindowState('all');
  db[`position_${name}`] = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  setting.update_data('windowPosition', {
    value: db,
  });
};

export { closeAllWin, createLoad, createMain, createPlay, getAllWin, getWin };
