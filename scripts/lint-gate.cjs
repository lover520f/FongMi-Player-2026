/* eslint-env node */
// Lint 门禁：全仓问题基线冻结（口径1）。
// errors/warnings 不得超过基线；修掉历史问题后请同步调低下方 BASELINE（只降不升）。
const { execSync } = require('child_process');
const path = require('path');

const BASELINE = { errors: 1233, warnings: 7248 };

function runEslintJson() {
  const env = { ...process.env };
  delete env.ESLINT_USE_FLAT_CONFIG;
  try {
    return execSync('npx eslint ./ --format json', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
      env,
    });
  } catch (e) {
    // eslint 有 error 时 exit code 为 1，结果仍在 stdout
    if (e.stdout) return e.stdout;
    throw e;
  }
}

const raw = runEslintJson().replace(/^\uFEFF/, '');
const results = JSON.parse(raw.slice(raw.indexOf('[')));

let errors = 0;
let warnings = 0;
for (const f of results) {
  errors += f.errorCount;
  warnings += f.warningCount;
}

const line = `errors ${errors} / baseline ${BASELINE.errors}, warnings ${warnings} / baseline ${BASELINE.warnings}`;

if (errors <= BASELINE.errors && warnings <= BASELINE.warnings) {
  console.log(`[lint-gate] PASS — ${line}`);
  process.exit(0);
}

console.error(`[lint-gate] FAIL — ${line}`);
console.error('超出基线：禁止新增 lint 问题。修复后调低 scripts/lint-gate.cjs 中的 BASELINE。');

const byFile = results
  .filter((f) => f.errorCount + f.warningCount > 0)
  .map((f) => ({
    file: f.filePath.replace(/^.*?FengMi[\\/]Player[\\/]/, ''),
    count: f.errorCount + f.warningCount,
    errors: f.errorCount,
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

for (const f of byFile) {
  console.error(`  ${String(f.count).padStart(5)} (${String(f.errors).padStart(4)} E) ${f.file}`);
}
process.exit(1);
