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
            manualChunks(id) {
              if (id.includes('monaco-editor'))
                return 'monaco-editor_'; //代码分割为编辑器
              else if (id.includes('node_modules'))
                return 'vendor_'; //代码分割为第三方包
              else if (id.includes('src/renderer/src/utils/drpy')) return 'worker_t3_'; //代码分割为worker进程
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
