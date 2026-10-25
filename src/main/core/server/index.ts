import { app } from 'electron';
import http from 'http';
import fastify from 'fastify';
import fastifyLogger from 'fastify-logger';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';

import { JsonDB, Config } from 'node-json-db';
import { join } from 'path';
import logger from '../logger';
import {
  analyze,
  iptv,
  setting,
  drive,
  site,
  history,
  star,
  db,
  proxy,
  catbox,
  cache,
  lab,
  file,
  barrge,
  util,
  gateway,
  img,
} from './routes';
import initConfig from './routes/catbox/config';

logger.info('[server] fastify module initialized');

const SERVER_PORT = 9978;

// 浏览器对同一个 origin（scheme + host + port）只有 6 个 HTTP/1.1 并发连接。
// 列表海报统一走本机缩略代理后会全挤在 9978 这 6 个连接上排队——这正是 v1.3.0
// 把代理回退掉的原因之一。这里额外开几个转发端口，前端按图片地址哈希分散，
// 4 个 origin × 6 = 24 个并发，接近直连时几十个图床各自的并发能力。
const MIRROR_PORTS = [9988, 9989, 9990];

const startMirrorPorts = (upstream: number) => {
  for (const port of MIRROR_PORTS) {
    const mirror = http.createServer((req, res) => {
      const forward = http.request(
        { host: '127.0.0.1', port: upstream, path: req.url, method: req.method, headers: req.headers },
        (upRes) => {
          res.writeHead(upRes.statusCode || 502, upRes.headers);
          upRes.pipe(res);
        },
      );
      forward.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(forward);
    });
    mirror.on('error', (e) => logger.error(`[server] mirror ${port} failed: ${e.message}`));
    mirror.listen(port, '127.0.0.1', () => logger.info(`[server] mirror port listening: ${port}`));
  }
};

const logOpt = {
  console: true, // 是否开启console.log 。。。
  file: join(app.getPath('userData'), 'logs/fastify.log'), // 文件路径
  maxBufferLength: 4096, // 日志写入缓存队列最大长度
  flushInterval: 1000, // flush间隔
  logrotator: {
    // 分割配置
    byHour: false,
    byDay: true,
    hourDelimiter: '_',
  },
};
const { opt } = fastifyLogger(logOpt);
opt.stream = null;

const initServer = async () => {
  const server = fastify({
    logger: opt, // 是否开启日志
    forceCloseConnections: true, // 是否强制关闭连接
    ignoreTrailingSlash: true, // 是否忽略斜杠
    maxParamLength: 10240, // 参数长度限制
    bodyLimit: 1024 * 1024 * 3, // 限制请求体大小为 3MB
  });

  try {
    server.addHook('onError', async (_request, _reply, error) => {
      logger.error(error);
      if (!error.statusCode) error.statusCode = 500;
      return error;
    });

    server.decorate('config', initConfig);
    server.decorate('db', new JsonDB(new Config(join(app.getPath('userData'), 'cache.json'), true, true, '/')));

    server.get('/', async (_, reply) => {
      reply.code(200).send({ status: 'run' });
    });
    server.register(fastifyMultipart);
    server.register(fastifyCors);
    server.register(analyze);
    server.register(iptv);
    server.register(setting);
    server.register(drive);
    server.register(site);
    server.register(history);
    server.register(star);
    server.register(db);
    server.register(proxy);
    server.register(catbox);
    server.register(cache);
    server.register(lab);
    server.register(file);
    server.register(barrge);
    server.register(util);
    server.register(gateway);
    server.register(img);

    await server.listen({ port: SERVER_PORT, host: '127.0.0.1' });
    startMirrorPorts(SERVER_PORT);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

export default initServer;
