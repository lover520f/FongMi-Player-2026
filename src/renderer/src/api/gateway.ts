import request from '@/utils/request';

export function fetchGatewayStatus() {
  return request({
    url: '/v1/gateway/status',
    method: 'get',
  });
}

export function fetchGatewaySettings() {
  return request({
    url: '/v1/gateway/settings',
    method: 'get',
  });
}

export function saveGatewaySettings(data) {
  return request({
    url: '/v1/gateway/settings',
    method: 'put',
    data,
  });
}

export function startGateway(data?: Record<string, any>) {
  return request({
    url: '/v1/gateway/start',
    method: 'post',
    data: data || {},
  });
}

export function stopGateway() {
  return request({
    url: '/v1/gateway/stop',
    method: 'post',
    data: {},
  });
}

export function restartGateway(data?: Record<string, any>) {
  return request({
    url: '/v1/gateway/restart',
    method: 'post',
    data: data || {},
  });
}

export function checkGatewayJava(javaHome?: string) {
  return request({
    url: '/v1/gateway/check-java',
    method: 'post',
    data: { javaHome: javaHome || '' },
  });
}

export function applyGatewayConfig(data: { configUrl: string; gatewayBase?: string }) {
  return request({
    url: '/v1/gateway/apply-config',
    method: 'post',
    data,
    timeout: 180000,
  });
}

// 网盘扫码登录：面板状态（网盘按钮 + 登录/启停状态 + 已生成二维码）
export function fetchDriveLoginState(site?: string) {
  return request({
    url: '/v1/gateway/login/state',
    method: 'get',
    params: { site: site || 'MDrive' },
    timeout: 130000,
  });
}

// 点击面板按钮：i=2n 打开网盘授权码，i=2n+1 启停该网盘；retry=授权码没出时网关侧重试次数；
// refresh=启停后重新 LoginShow，让面板文案立即反映新状态
export function clickDriveLogin(index: number, retry = 0, refresh = false) {
  return request({
    url: '/v1/gateway/login/click',
    method: 'get',
    params: { i: index, retry, refresh: refresh ? 1 : 0 },
    timeout: 65000,
  });
}

// 关闭 spider 弹出的对话框（重新生成授权码前必须）
export function dismissDriveLogin() {
  return request({
    url: '/v1/gateway/login/dismiss',
    method: 'get',
    timeout: 25000,
  });
}

// 授权二维码 PNG（base64 dataUrl）
export function fetchDriveLoginQr(name?: string) {
  return request({
    url: '/v1/gateway/login/qr',
    method: 'get',
    params: name ? { name } : {},
    timeout: 25000,
  });
}
