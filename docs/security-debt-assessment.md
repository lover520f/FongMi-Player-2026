# 安全债评估报告：web-security / 证书校验相关开关

> 生成日期：2026-10-24
> 范围：`src/main/index.ts` 中的全局命令行开关及其与第三方视频源访问的依赖关系
> 结论：**这些开关是「解析播放第三方源」的硬依赖，不能盲删；建议按「域收敛」路径渐进加固，且必须实机回归。**

---

## 一、当前开关清单

位置：`src/main/index.ts:33-40`

| 行 | 开关 | 作用 | 风险等级 |
|---|---|---|---|
| 33 | `ELECTRON_DISABLE_SECURITY_WARNINGS=true` | 关闭 Electron 的安全警告控制台输出 | 低（仅隐藏警告，不改变行为） |
| 34-37 | `disable-features` = `OutOfBlinkCors, BlockInsecurePrivateNetworkRequests, OutOfProcessPdf, IsolateOrigins, site-per-process` | 关闭一批 Chromium 安全/隔离特性 | 中 |
| 38 | `enable-features` = `PlatformHEVCDecoderSupport` | 启用 HEVC 硬件解码 | 无（功能项） |
| 39 | `ignore-certificate-errors` | **全局忽略所有 TLS 证书错误** | 高 |
| 40 | `disable-web-security` | **全局关闭同源策略 / CORS** | **极高** |

另外，`src/main/core/winManger.ts` 所有窗口的 `webPreferences` 均写了 `webSecurity: true`（`:89`、`:184`），
但因为 `index.ts:40` 的 `disable-web-security` 是**进程级命令行开关**，会全局覆盖 `webSecurity: true`，
导致这个配置**形同虚设**——这是典型的「配置打架」。

---

## 二、依赖链分析（删掉会破坏什么）

这两个开关只服务于**渲染进程**里对第三方源的访问。主进程 `src/main/core/server/routes/*` 里的
`fetch` / `axios` 走的是 Node 侧网络，**不经过 Chromium 的 CORS / 证书检查**，与这两个开关无关。

### 2.1 `disable-web-security` 的依赖点

| 依赖点 | 文件 | 机制 | 跨域原因 |
|---|---|---|---|
| drpy 解析规则抓源 | `src/renderer/src/utils/drpy/drpyInject.ts:135,158` | `sync-fetch`（同步 XHR）在渲染进程内抓第三方源页面 | 渲染进程直连第三方域名，与 `file://` 页面非同源 |
| drpy 解析请求 | `src/renderer/src/utils/drpy/drpy3.ts:1794` `request()` | 渲染进程内 `request` 抓源 | 同上 |
| iframe 嗅探 | `src/renderer/src/utils/sniffer.ts:120` `snifferIframe()` | 用 iframe 加载第三方源页面，读 `contentWindow.performance` 取资源 URL | iframe 跨域读取 |
| iframe 播放 | `src/renderer/src/components/player/index.vue:4` | iframe 内嵌第三方播放页 | 跨域 |
| webview 解析页 | `src/renderer/src/pages/analyze/DialogIframe.vue:5` | `<webview disablewebsecurity />`（**webview 标签自己的属性，独立于全局开关**） | 第三方平台页跨域 |

### 2.2 `ignore-certificate-errors` 的依赖点

- 第三方视频源大量是 **http 明文源** 或 **自签名 / 过期证书的 https 源**。
- 若开启证书校验，这些源会直接加载失败，导致 drpy 解析、嗅探、播放大面积不可用。
- 这是「解析播放」类产品的普遍现状（视频源质量参差），不是本项目特有缺陷。

---

## 三、风险说明

1. **`disable-web-security`（最高风险）**：全局关闭同源策略，意味着主窗口 `file://` 页面加载的**任何**
   第三方脚本都能跨域读写任意站点数据。攻击面覆盖整个渲染进程，不局限于播放窗口。
2. **`ignore-certificate-errors`（高）**：全局忽略证书错误，使中间人攻击（MITM）失去检测能力。
3. **配置打架**：`webSecurity: true` 被全局开关静默覆盖，开发者可能误以为「已经开启了同源策略」。
4. **`disable-features` 里的 `site-per-process` / `IsolateOrigins` 被关闭**：进一步削弱了进程隔离，
   叠加 `disable-web-security` 后风险放大。

---

## 四、可选收敛路径（按收益/风险比排序）

### 路径 A：分区 session 隔离（推荐，收益最高）

**思路**：把第三方源访问收敛到一个独立的 `partition` session，只对该 session 开「跨域豁免」，
主窗口（UI 渲染）回归正常 `webSecurity: true`。

- 主窗口（main）用默认 session，`webSecurity: true` 真正生效。
- 播放窗口（play）用独立 `partition: 'persist:player'`，通过 `session.setCertificateVerifyProc` 做
  **白名单域** 的证书豁免，通过 webRequest 头注入代替全局 CORS 关闭。
- drpy 的 `syncFetch` 需要改造成走主进程代理（已有 `server/routes/util.ts` 的 axios 代理能力，可复用）。

**代价**：改动较大，涉及 `winManger.ts` 窗口 session 分配、`drpyInject.ts` 的 syncFetch 改造、
证书白名单维护。**必须实机回归**第三方源解析与播放。

### 路径 B：webRequest 白名单域（中等收益）

**思路**：保留全局开关，但在 `session.webRequest.onBeforeRequest` 里对「非白名单域」强制走严格模式，
仅对已知的第三方源域名（如自定义源配置的域名）放行。

**代价**：白名单域难以穷举（用户可自定义任意源），落地后容易「误伤」新源。收益中等，维护成本高。

### 路径 C：仅清理 `disable-features` 冗余（低风险、小收益）

**思路**：单独审查并移除 `disable-features` 里可能已过时的项（如 `OutOfBlinkCors` 是否仍被依赖），
暂不动 `disable-web-security` / `ignore-certificate-errors` 两个核心开关。

**代价**：小，但需要逐项验证移除后解析/播放无回归。

### 路径 D：文档化（零风险，安全等级不变）

**思路**：保留开关，补齐注释说明「为什么必须开、依赖哪些功能、删除会导致什么」，并沉淀到项目记忆。

**代价**：无。适合作为短期措施，配合长期走路径 A。

---

## 五、建议

1. **短期（本轮）**：先落路径 D —— 给 `index.ts:33-40` 补全注释，说清每个开关的依赖与删除后果，
   避免后续维护者「看着不安全就删」造成播放大面积回归。
2. **中期**：走路径 A（分区 session 隔离），这是唯一能「真正提升安全等级」且不破坏功能的路线。
3. **任何改动前**：必须先确认 `drpyInject.ts` 的 `syncFetch` 是否能改造成走主进程代理；
   这一步是路径 A 的**前置阻塞项**。

---

## 六、关键文件索引

- `src/main/index.ts:33-40` —— 全局开关定义处（本报告主体）
- `src/main/core/winManger.ts:89,184` —— `webSecurity: true`（被全局开关覆盖）
- `src/renderer/src/utils/drpy/drpyInject.ts:135,158` —— syncFetch 跨域抓源
- `src/renderer/src/utils/drpy/drpy3.ts:1794` —— drpy 渲染进程 request
- `src/renderer/src/utils/sniffer.ts:120` —— iframe 嗅探跨域读取
- `src/renderer/src/components/player/index.vue:4` —— iframe 播放
- `src/renderer/src/pages/analyze/DialogIframe.vue:5` —— webview `disablewebsecurity`（独立机制）
- `src/main/core/server/routes/util.ts` —— 主进程 axios 代理（路径 A 可复用）
