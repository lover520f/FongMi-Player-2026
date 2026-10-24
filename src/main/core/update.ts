import { is } from '@electron-toolkit/utils';
import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs-extra';
import { resolve, join } from 'path';

import logger from './logger';
import { getWin } from './winManger';

const updaterCacheDirName = 'fmplayer-updater';
const updatePath = join(app.getAppPath(), updaterCacheDirName, 'pending');
logger.info(`[update] update module initialized; path: ${updatePath}`);

if (is.dev) {
  Object.defineProperty(app, 'isPackaged', {
    get() {
      return true;
    },
  });
  autoUpdater.updateConfigPath = resolve(__dirname, '../../dev-app-update.yml');
}

autoUpdater.autoDownload = false; // 关闭自动下载
autoUpdater.autoInstallOnAppQuit = false; // 关闭自动安装

// 启动后静默检查一次：原来只有用户手动点「检查更新」才会查，
// 装了新版也可能一直不知道。延迟执行，避开窗口创建和首屏加载。
const SILENT_CHECK_DELAY = 15 * 1000;
// 区分「静默检查」和「用户手动检查」：只有前者命中新版本时才额外推一条提示，
// 否则用户主动检查完也要被弹一次。
let silentChecking = false;

export default () => {
  // 通用的IPC发送函数
  const sendUpdateMessage = (channel: string, message?: any) => {
    const win = getWin('main');
    if (win) win.webContents.send(channel, message);
  };

  // 下载更新的函数，包含错误处理逻辑
  const downloadUpdate = async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (e: any) {
      if (e.message && e.message.includes('file already exists') && e.path) {
        fs.emptyDirSync(e.path);
        logger.info('[update] error: old version file already exists');
        downloadUpdate();
      } else {
        logger.error(`[update] error: ${e}`);
        sendUpdateMessage('update-error', e);
      }
    }
  };

  // 主进程监听检查更新事件
  ipcMain.on('checkForUpdate', async () => {
    logger.info('checkForUpdate');
    try {
      await autoUpdater.checkForUpdates();
    } catch (e: any) {
      logger.error(`[update] error: ${e}`);
      sendUpdateMessage('update-error', e);
    }
  });

  // 主进程监听开始下载事件
  ipcMain.on('downloadUpdate', () => {
    logger.info('[update] download update');
    downloadUpdate();
  });

  // 主进程监听退出并安装事件
  ipcMain.on('quitAndInstall', () => {
    logger.info('[update] quit and install');
    autoUpdater.quitAndInstall();
  });

  // 监听各类更新事件并发送IPC消息
  autoUpdater.on('checking-for-update', () => {
    logger.info('[update] checking update');
    sendUpdateMessage('checking-for-update');
  });

  autoUpdater.on('update-available', (info: any) => {
    logger.info(`[update] available: ${info}`);
    sendUpdateMessage('update-available', info);
    // 静默检查时更新对话框通常是关着的，上面那条没人收，额外推一条给全局提示
    if (silentChecking) sendUpdateMessage('update-available-silent', info);
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('[update] not available');
    sendUpdateMessage('update-not-available');
  });

  autoUpdater.on('error', (e: Error) => {
    // 静默检查失败（断网、--dir 产物没有 app-update.yml、仓库没有 release）属于正常情况，
    // 不当作错误、也不推给界面，避免用户什么都没点就看到报错
    if (silentChecking) {
      logger.info(`[update] silent check error: ${e}`);
      return;
    }
    logger.error(`[update] error: ${e}`);
    sendUpdateMessage('error', e);
  });

  autoUpdater.on('download-progress', (progress: any) => {
    const percent = Math.trunc(progress.percent);
    logger.info(`[update] download progress: ${percent}%`);
    sendUpdateMessage('download-progress', percent);
  });

  autoUpdater.on('update-downloaded', () => {
    logger.info('[update] downloaded');
    sendUpdateMessage('update-downloaded');
  });

  // 开发模式读的是 dev-app-update.yml，静默检查没有意义，只在打包版执行
  if (!is.dev) {
    setTimeout(async () => {
      silentChecking = true;
      logger.info('[update] silent check');
      try {
        await autoUpdater.checkForUpdates();
      } catch (e: any) {
        // 断网、仓库没有 release、被墙都算正常情况，静默跳过，不打扰用户
        logger.info(`[update] silent check skipped: ${e}`);
      } finally {
        silentChecking = false;
      }
    }, SILENT_CHECK_DELAY);
  }
};
