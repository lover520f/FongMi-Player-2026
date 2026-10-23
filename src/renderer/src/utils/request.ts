import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getPinia } from '@/utils/tool';

const baseURL = String(
  import.meta.env.DEV ? '/api' : `${import.meta.env.VITE_API_URL}${import.meta.env.VITE_API_URL_PREFIX}`,
);

const service: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});

// 网关 token：懒加载缓存。网关绝对 URL 请求自动追加 ?token=（jar 开启 --token 后全端点强制校验）
let gatewayAuth: { origin: string; token: string } | null = null;
let gatewayAuthPending: Promise<{ origin: string; token: string } | null> | null = null;

async function loadGatewayAuth(): Promise<{ origin: string; token: string } | null> {
  if (gatewayAuth) return gatewayAuth;
  if (!gatewayAuthPending) {
    // 用 service 直取（相对 URL 不命中网关逻辑），避免与 api/gateway 循环依赖
    gatewayAuthPending = service
      .get('/v1/gateway/settings')
      .then(({ data }: AxiosResponse) => {
        const s = (data?.data ?? data ?? {}) as { host?: string; port?: number; token?: string };
        const host = s.host === '0.0.0.0' || !s.host ? '127.0.0.1' : s.host;
        const token = String(s.token || '');
        gatewayAuth = token ? { origin: `http://${host}:${s.port || 9979}`, token } : null;
        return gatewayAuth;
      })
      .catch(() => null)
      .finally(() => {
        gatewayAuthPending = null;
      });
  }
  return gatewayAuthPending;
}

function applyGatewayToken(config: AxiosRequestConfig): Promise<AxiosRequestConfig> {
  const url = String(config.url || '');
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(config);
  return loadGatewayAuth().then((auth) => {
    if (!auth) return config;
    try {
      const parsed = new URL(url);
      if (parsed.origin !== auth.origin) return config;
      // 覆盖旧 token（401 重试时 settings 可能已轮换）
      parsed.searchParams.set('token', auth.token);
      config.url = parsed.toString();
    } catch {
      /* ignore */
    }
    return config;
  });
}

function isGatewayUrl(config?: AxiosRequestConfig): boolean {
  const url = String(config?.url || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (!gatewayAuth) return false;
  try {
    return new URL(url).origin === gatewayAuth.origin;
  } catch {
    return false;
  }
}

// @ts-ignore
service.interceptors.request.use((config: AxiosRequestConfig) => {
  return applyGatewayToken(config);
});

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response;
    return res;
  },
  (error: AxiosError) => {
    const { response } = error;
    const data = response?.data as any;
    if (data?.code === 301 && data?.message === '未登录') {
      console.log('未登录');
    }
    // token 失效/轮换：清缓存重取并重试一次
    if (response?.status === 401 && isGatewayUrl(error.config)) {
      const cfg = error.config as AxiosRequestConfig & { __gwRetried?: boolean };
      if (!cfg.__gwRetried) {
        cfg.__gwRetried = true;
        gatewayAuth = null;
        return service.request(cfg);
      }
    }
    return Promise.reject(error);
  },
);

const request = async (config: AxiosRequestConfig) => {
  if (!config?.timeout) {
    const url = String(config?.url || '');
    // Gateway catvod / absolute spider endpoints often need >5s
    if (/^https?:\/\//i.test(url)) {
      config.timeout = 60000;
    } else {
      const TIMEOUT = getPinia('setting', 'timeout') < 1000 ? 1000 : getPinia('setting', 'timeout');
      config.timeout = TIMEOUT;
    }
  }
  const { data } = await service.request(config);
  return data as any;
};

const requestComplete: any = async (config: AxiosRequestConfig) => {
  if (!config?.timeout) {
    const url = String(config?.url || '');
    if (/^https?:\/\//i.test(url)) {
      config.timeout = 60000;
    } else {
      const TIMEOUT = getPinia('setting', 'timeout') < 1000 ? 1000 : getPinia('setting', 'timeout');
      config.timeout = TIMEOUT;
    }
  }
  const { status, data, headers } = await service.request(config);
  return {
    status,
    data,
    headers,
  };
};

export { request as default, requestComplete };
