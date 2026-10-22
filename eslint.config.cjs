/* eslint-env node */
// ESLint 9 flat config — 原 .eslintrc.cjs 已迁移至此，用 FlatCompat 承载原规则集，基线不变
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const cfgs = compat.config({
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@electron-toolkit',
    '@electron-toolkit/eslint-config-ts/eslint-recommended',
    '@vue/eslint-config-typescript/recommended',
    '@vue/eslint-config-prettier',
  ],
  rules: {
    'vue/require-default-prop': 'off',
    'vue/multi-word-component-names': 'off',
  },
});

// eslintrc 的 parserOptions 是浅合并(ecmaFeatures 整体替换),flat 是深合并,
// FlatCompat 会残留 ecmaFeatures.globalReturn,破坏 vue-eslint-parser 的模板作用域分析,这里删除以对齐旧基线
for (const c of cfgs) {
  const po = c.languageOptions && c.languageOptions.parserOptions;
  if (!po) continue;
  if (po.ecmaFeatures && po.ecmaFeatures.globalReturn) delete po.ecmaFeatures.globalReturn;
  if (po.extraFileExtensions) po.extraFileExtensions = Array.from(po.extraFileExtensions);
}

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'release/**',
      '**/*.d.ts',
      'src/renderer/components.d.ts',
      'src/renderer/auto-imports.d.ts',
      // 第三方 drpy 框架(含压缩库/测试/脚本,规则在超长行上会超时)
      'src/renderer/src/utils/drpy/**',
      // 生成的编码表数据文件
      'src/renderer/src/utils/cloud/utils/encodings/**',
      // 压缩的 webtorrent bundle(单行 32K,规则会超时)
      'src/renderer/src/utils/common/player/playerModule/components/modules/webtorrent.ts',
    ],
  },
  ...cfgs,
];
