import { FastifyReply, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fetch from 'node-fetch';

import {
  checkJava,
  gatewayBase,
  gatewayStatus,
  getGatewaySettings,
  restartGateway,
  saveGatewaySettings,
  startGateway,
  stopGateway,
} from '../../gateway';

const API_VERSION = 'api/v1';

const gwJson = async (path: string, timeoutMs = 30000): Promise<Record<string, unknown>> => {
  const base = gatewayBase().replace(/\/$/, '');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: ac.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `gateway ${res.status}`);
    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
};

// 网盘面板所在的站点（饭太硬配置里 MyDrive 系列站点）
const driveSite = (site?: string): string => {
  const value = String(site || '').trim();
  return /^[A-Za-z0-9_一-龥-]{1,32}$/.test(value) ? value : 'MDrive';
};

const api: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get(`/${API_VERSION}/gateway/status`, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.code(200).send(await gatewayStatus());
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.get(`/${API_VERSION}/gateway/settings`, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.code(200).send(getGatewaySettings());
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.put(`/${API_VERSION}/gateway/settings`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const patch = (req.body || {}) as Record<string, any>;
      reply.code(200).send(saveGatewaySettings(patch));
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.post(`/${API_VERSION}/gateway/start`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body || {}) as Record<string, any>;
      reply.code(200).send(await startGateway(body));
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.post(`/${API_VERSION}/gateway/stop`, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.code(200).send(await stopGateway());
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.post(`/${API_VERSION}/gateway/restart`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body || {}) as Record<string, any>;
      reply.code(200).send(await restartGateway(body));
    } catch (err: any) {
      reply.code(500).send({ message: err?.message || String(err) });
    }
  });

  fastify.post(
    `/${API_VERSION}/gateway/check-java`,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = (req.body || {}) as { javaHome?: string };
        const javaHome = body.javaHome || getGatewaySettings().javaHome;
        reply.code(200).send(await checkJava(String(javaHome || '')));
      } catch (err: any) {
        reply.code(500).send({ message: err?.message || String(err) });
      }
    },
  );

  // 网盘扫码登录：拉取面板状态（LoginShow → 网盘按钮列表 + 已生成的二维码）
  fastify.get(`/${API_VERSION}/gateway/login/state`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const site = driveSite((req.query as Record<string, string>)?.site);
      // 首次调用会触发 spider 冷加载，可能明显慢于平时
      await gwJson(`/action?site=${encodeURIComponent(site)}&action=LoginShow`, 120000);
      // spider 的登录面板是异步弹出的，等可点按钮出现
      let state: Record<string, unknown> = {};
      for (let n = 0; n < 20; n++) {
        state = await gwJson('/ui', 20000);
        if (Number(state.count ?? 0) > 0) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      reply.code(200).send(state);
    } catch (err) {
      reply.code(500).send({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // 点击面板按钮（i=2n 打开网盘授权码，i=2n+1 启停该网盘）
  fastify.get(`/${API_VERSION}/gateway/login/click`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const q = (req.query || {}) as Record<string, string>;
      const i = Number.parseInt(String(q.i ?? ''), 10);
      if (!Number.isInteger(i) || i < 0) {
        reply.code(400).send({ message: 'i is required' });
        return;
      }
      const site = driveSite(q.site);
      const retry = Number.parseInt(String(q.retry ?? ''), 10);
      const r = Number.isInteger(retry) && retry > 0 ? Math.min(retry, 3) : 0;
      const refresh = Number.parseInt(String(q.refresh ?? ''), 10) > 0 ? 1 : 0;
      reply
        .code(200)
        .send(
          await gwJson(
            `/ui/click?i=${i}&site=${encodeURIComponent(site)}&retry=${r}&refresh=${refresh}`,
            60000,
          ),
        );
    } catch (err) {
      reply.code(500).send({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // 关闭 spider 弹出的对话框（spider 每个网盘只生成一次授权码，必须先关掉旧码才会重新生成）
  fastify.get(`/${API_VERSION}/gateway/login/dismiss`, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      reply.code(200).send(await gwJson('/ui/dismiss', 20000));
    } catch (err) {
      reply.code(500).send({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // 读取授权二维码 PNG（返回 base64 dataUrl，原图是二维码矩阵，需客户端像素化放大）
  fastify.get(`/${API_VERSION}/gateway/login/qr`, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const name = String((req.query as Record<string, string>)?.name || '').trim();
      const path = name ? `/ui/qr?name=${encodeURIComponent(name)}` : '/ui/qr';
      reply.code(200).send(await gwJson(path, 20000));
    } catch (err) {
      reply.code(500).send({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  // 热切换：持久化配置地址（含历史）→ 让运行中的 Gateway POST /config 重载
  fastify.post(
    `/${API_VERSION}/gateway/apply-config`,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = (req.body || {}) as { configUrl?: string; gatewayBase?: string };
        const configUrl = String(body.configUrl || '').trim();
        if (!configUrl) {
          reply.code(400).send({ message: 'configUrl is required' });
          return;
        }
        const saved = saveGatewaySettings({ config: configUrl });
        const base = String(body.gatewayBase || gatewayBase()).replace(/\/$/, '');
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 180000);
        let applied = false;
        let siteCount: number | undefined;
        let message = '';
        try {
          const res = await fetch(`${base}/config?url=${encodeURIComponent(configUrl)}`, {
            method: 'POST',
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
          });
          const text = await res.text();
          let data: {
            message?: string;
            raw?: string;
            siteCount?: number;
            data?: { message?: string; siteCount?: number };
          } = {};
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
          if (!res.ok) {
            throw new Error(
              data?.message || data?.data?.message || data?.raw || `gateway ${res.status}`,
            );
          }
          applied = true;
          siteCount = data?.siteCount ?? data?.data?.siteCount;
        } catch (e) {
          message =
            e instanceof Error
              ? e.name === 'AbortError'
                ? 'gateway /config timeout'
                : e.message
              : String(e);
        } finally {
          clearTimeout(timer);
        }
        reply.code(200).send({
          applied,
          saved: true,
          config: configUrl,
          configHistory: saved.configHistory,
          siteCount,
          message: applied ? '' : `配置已保存，网关热切换失败：${message}`,
        });
      } catch (err) {
        reply.code(500).send({ message: err instanceof Error ? err.message : String(err) });
      }
    },
  );
};

export default api;
