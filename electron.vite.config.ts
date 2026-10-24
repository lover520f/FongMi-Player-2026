import { writeFileSync } from 'fs';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig, externalizeDepsPlugin, swcPlugin } from 'electron-vite';
import { ConfigEnv, loadEnv } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import svgLoader from 'vite-svg-loader';

// 按需加载T-Desgin组件
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { TDesignResolver } from 'unplugin-vue-components/resolvers';

const CWD = process.cwd();

// see config at https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv) => {
  const { VITE_API_URL, VITE_API_URL_PREFIX } = loadEnv(mode, CWD);
  return {
    main: {
      resolve: {
        alias: {
          '@main': resolve('src/main'),
        },
      },
      build: {
        rollupOptions: {
          external: ['sqlite3'],
        },
      },
      plugins: [externalizeDepsPlugin(), swcPlugin()],
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer'),
          '@': resolve('src/renderer/src'),
        },
      },
      build: {
        emptyOutDir: true, // 打包时先清空上一次构建生成的目录
        reportCompressedSize: false, // 关闭文件计算
        sourcemap: false, // 关闭生成map文件 可以达到缩小打包体积
        rollupOptions: {
          output: {
            entryFileNames: `assets/entry/[name][hash].js`, // 引入文件名的名称
            chunkFileNames: `assets/chunk/[name][hash].js`, // 包的入口文件名称
            assetFileNames: `assets/file/[name][hash].[ext]`, // 资源文件像 字体，图片等
            /**
             * 分块要点（改动前首屏静态闭包 22.8MB，其中 vendor 15.5MB + monaco 7.0MB 全在首屏）：
             * 1. `vite/preload-helper` 会被 Vite 注入到每个用了 `import()` 的 chunk 里，
             *    `@rollup/plugin-commonjs` 的 helper 同理。这两个虚拟模块都不含 node_modules，
             *    又没有 manual chunk 归属，Rollup 就把它们塞进了当时遇到的第一个 manual chunk
             *    （monaco / editor-core_）。结果是所有 chunk 都从那儿 import，7MB 编辑器被拖进首屏。
             *    所以虚拟模块必须显式分组，不能留 undefined。
             * 2. 播放内核 / 编辑器 / UI 库按使用场景分组，只有真正被异步 chunk 引用时才按需下载。
             */
            manualChunks(id) {
              if (
                id.includes('vite/preload-helper') ||
                id.includes('vite/modulepreload-polyfill') ||
                id.includes('commonjsHelpers') ||
                id.includes('commonjs-dynamic-modules')
              )
                return 'runtime_'; // 共享工具虚拟模块，谁都用，必须独立且极小

              if (id.includes('monaco-editor')) return 'monaco-editor_'; // 源规则编辑器

              if (id.includes('src/renderer/src')) {
                // drpy/t3 规则运行时：只被源编辑页（异步路由）引用，必须自成一档
                if (id.includes('/utils/drpy/')) return 'worker_t3_';
                // store / router / locales / api / config 是首屏共享层，单独收拢；
                // 不收拢的话 Rollup 会把它们塞进上面某个按场景划分的大 chunk，
                // 那个大 chunk 随即变成首屏必需 —— drpy 就是这样把 cheerio 带进来的
                if (/src[\\/]renderer[\\/]src[\\/](store|router|locales|api|config)[\\/]/.test(id))
                  return 'app-core_';
                // 页面、布局、组件、工具：交给 Rollup 按真实引用关系自动分块
                return undefined;
              }

              if (id.includes('node_modules')) {
                // 播放内核与流协议：只在播放页、随性看抽屉里用
                if (
                  /node_modules[\\/](xgplayer|artplayer|dplayer|nplayer|@nplayer|hls\.js|hls-parser|dashjs|shaka-player|flv\.js|mpegts\.js|danmuku|danmu)/.test(
                    id,
                  )
                )
                  return 'player-core_';
                // markdown 渲染：免责声明弹窗首屏就要用，必须保持轻量
                // 用带斜杠的精确路径，避免把 markdown-it-mathjax3 里嵌套的 juice 等一起卷进来
                if (/node_modules[\\/](markdown-it|entities|linkify-it|mdurl|uc\.micro)[\\/]/.test(id))
                  return 'markdown_';
                // 代码高亮：只在 AI 对话 / 自定播放器 / 缩略图这些异步弹窗里出现
                if (/node_modules[\\/]highlight\.js/.test(id)) return 'hljs_';
                // 源规则编辑配套 + HTML 解析全家桶，合并成一个异步块。
                // 不能拆成两个：cheerio 的 CJS 包装和 parse5 之间存在跨 chunk 的变量引用，
                // 拆开后初始化时会拿到 undefined（Object.defineProperty called on non-object）。
                // 这些包只被「源编辑页 / 分析页 / drpy 规则」用到，合并后整体保持异步即可。
                if (
                  /node_modules[\\/](codemirror|@codemirror|@lezer|js-beautify|mathjax|markdown-it-mathjax3|juice|mhchemparser|cheerio|parse5|htmlparser2|dom-serializer|domelementtype|domhandler|domutils|css-select|cheerio-select|he)[\\/]/.test(
                    id,
                  )
                )
                  return 'editor-core_';
                // UI 组件库
                if (/node_modules[\\/](tdesign-vue-next|tdesign-icons-vue-next)/.test(id))
                  return 'tdesign_';
                // 框架与状态
                if (/node_modules[\\/](vue|@vue|@intlify|pinia|vue-demi)/.test(id))
                  return 'vue-core_';
                // XML 接口解析：首页拉 CMS 数据就要用，首屏必需（体积只有几百 KB）
                if (/node_modules[\\/](fast-xml-parser|xpath|@xmldom)[\\/]/.test(id))
                  return 'xml-parse_';
                // 其余第三方不设兜底组。manual chunk 是整块加载的：一旦有 'vendor_' 这样的
                // 大杂烩，首屏只要用到里面任意一个包（lodash / axios 必然用到），
                // 同组里那些只给异步页用的包（pako / jsonpath / parse5 相关）就全跟着下。
                // 实测兜底成 'vendor_' 时首屏 5.15MB，交给 Rollup 自动分组后降到 4.0MB 以内。
                return undefined;
              }
            },
          },
        },
      },
      css: {
        preprocessorOptions: {
          less: {
            modifyVars: {
              hack: `true; @import (reference) "${resolve('src/renderer/src/style/variables.less')}";`,
            },
            math: 'strict',
            javascriptEnabled: true,
          },
        },
      },
      plugins: [
        {
          // 需要看各包实际占了多少产物体积时：ANALYZE_BUNDLE=1 npx electron-vite build
          // 结果按「chunk -> 包名」聚合写到 bundle-report.txt
          name: 'bundle-report',
          apply: 'build',
          generateBundle(_options, bundle) {
            if (!process.env.ANALYZE_BUNDLE) return;
            const perChunk = new Map<string, Map<string, number>>();
            for (const [file, out] of Object.entries(bundle)) {
              if (out.type !== 'chunk') continue;
              const pkgs = new Map<string, number>();
              for (const [id, mod] of Object.entries(out.modules)) {
                const name =
                  (/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id) || [])[1] ||
                  (id.startsWith('\0') ? `<virtual:${id.slice(1, 40)}>` : '<app>');
                pkgs.set(name, (pkgs.get(name) || 0) + mod.renderedLength);
              }
              perChunk.set(file, pkgs);
            }
            const lines: string[] = [];
            for (const [file, pkgs] of [...perChunk].sort(
              (a, b) =>
                [...b[1].values()].reduce((s, v) => s + v, 0) -
                [...a[1].values()].reduce((s, v) => s + v, 0),
            )) {
              const total = [...pkgs.values()].reduce((s, v) => s + v, 0);
              lines.push(`\n## ${file}  ${(total / 1024).toFixed(0)} KB`);
              for (const [name, len] of [...pkgs].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
                if (len < 4096) continue;
                lines.push(`  ${(len / 1024).toFixed(0).padStart(7)} KB  ${name}`);
              }
            }
            writeFileSync(resolve('bundle-report.txt'), lines.join('\n') + '\n', 'utf8');
            console.log('[bundle-report] 已写入 bundle-report.txt');
          },
        },
        {
          name: 'inject-csp',
          apply: 'build',
          transformIndexHtml(html) {
            // script-src 必须保留 'unsafe-eval'：vue-i18n 运行时要 new Function 编译消息模板，
            // drpy/t3 源规则本身就是用 eval 执行的（src/renderer/src/utils/drpy/drpy3.ts）。去掉会白屏且 t3 源全废。
            // frame-src 必须放开：解析播放走 <iframe> 嵌入第三方站点（src/renderer/src/components/player/index.vue）。
            const csp =
              "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src * data: blob: file:; media-src * data: blob: file:; connect-src * ws: wss: file:; font-src * data:; worker-src 'self' blob:; frame-src * data: blob: file:; object-src 'none'; base-uri 'self'; form-action 'none'";
            return html.replace(
              '</head>',
              `  <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`,
            );
          },
        },
        vue({
          template: {
            compilerOptions: {
              isCustomElement: (tag) => tag === 'webview' || tag === 'title-bar',
            },
          },
        }),
        vueJsx(),
        vueDevTools(),
        svgLoader(),
        AutoImport({
          resolvers: [
            TDesignResolver({
              library: 'vue-next',
            }),
          ],
        }),
        Components({
          resolvers: [
            TDesignResolver({
              library: 'vue-next',
            }),
          ],
        }),
      ],
      server: {
        strictPort: true, // 端口冲突自动分配端口
        proxy: {
          [VITE_API_URL_PREFIX]: {
            target: VITE_API_URL, // 后台接口域名
            changeOrigin: true, //是否跨域
          },
        },
      },
    },
  };
});
