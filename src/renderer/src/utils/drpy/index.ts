import Worker from '@/utils/drpy/worker?worker';
import { getPinia } from '@/utils/tool';

/**
 * t3/drpy 规则的执行 worker。
 *
 * 原先这里在模块顶层直接 `new Worker()`：只要某个页面 import 了本模块（首页拉数据的
 * 链路也会走到），启动瞬间就会把 2.3MB 的 worker 及其解析依赖（cheerio / pako 等）
 * 一起载入，首屏白等。改成第一次真要跑规则时才创建。
 */
let worker: Worker | null = null;
let timer: any = null;

const ensureWorker = () => {
  if (!worker) worker = new Worker({ name: 't3Worker' });
  return worker;
};

const doWork = (data) => {
  return new Promise((resolve, reject) => {
    const current = ensureWorker();

    current.onmessage = (event) => {
      const response = event.data;
      if (response) clearInterval(timer);
      resolve(response);
    };

    current.onerror = (error) => {
      reject(error);
    };

    current.postMessage(data);

    const TIMEOUT = getPinia('setting', 'timeout') || 5000;
    timer = setTimeout(async () => {
      current.terminate();
      // 超时后丢弃这个 worker，下次调用会新建一个干净的
      if (worker === current) worker = null;
      reject(new Error('Worker job run 15s, timed out'));
    }, TIMEOUT * 2);
  });
};

const terminateWork = () => {
  return new Promise((resolve, reject) => {
    if (timer) clearInterval(timer);
    if (worker) {
      worker.terminate();
      worker = null;
      resolve({
        msg: 'Worker terminated successfully.',
        code: 200,
      });
    } else {
      reject({
        msg: new Error('Worker is not defined or already terminated.'),
        code: 500,
      });
    }
  });
};

export { doWork, terminateWork };
