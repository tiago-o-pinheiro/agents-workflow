import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const turbo = resolve(process.argv[2]);
const config = process.argv[3] ?? join(ROOT, 'skills/start/templates/layout/turbo/@root/turbo.json');
const versions = JSON.parse(readFileSync(join(ROOT, 'skills/start/templates/versions.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'turbo-cache-'));
const gates = ['typecheck', 'lint', 'test', 'test:ci', 'build'];
const write = (path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const run = (command, args) => spawnSync(command, args, {
  cwd: dir,
  encoding: 'utf8',
  env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', CI: '1' },
});
const output = (result) => `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ?? ''}`;
const check = (...tasks) => run(turbo, ['run', ...tasks, '--filter=@cache/app', '--no-daemon']);

try {
  write('package.json', JSON.stringify({ name: 'cache-regression', private: true, packageManager: `pnpm@${versions.tooling.pnpm}` }));
  write('.gitignore', 'node_modules/\n.turbo/\n');
  write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
  write('pnpm-lock.yaml', [
    "lockfileVersion: '9.0'",
    'importers:',
    '  .: {}',
    '  packages/app:',
    '    dependencies:',
    "      '@cache/bridge':",
    '        specifier: workspace:*',
    '        version: link:../bridge',
    '  packages/bridge:',
    '    dependencies:',
    "      '@cache/source':",
    '        specifier: workspace:*',
    '        version: link:../source',
    '  packages/source: {}',
    '',
  ].join('\n'));
  copyFileSync(config, join(dir, 'turbo.json'));
  write('packages/source/package.json', JSON.stringify({ name: '@cache/source', type: 'module' }));
  write('packages/source/index.mjs', 'export const value = 1;\n');
  write('packages/bridge/package.json', JSON.stringify({ name: '@cache/bridge', type: 'module', dependencies: { '@cache/source': 'workspace:*' } }));
  write('packages/bridge/index.mjs', "export { value } from '../source/index.mjs';\n");
  write('packages/app/package.json', JSON.stringify({
    name: '@cache/app',
    type: 'module',
    dependencies: { '@cache/bridge': 'workspace:*' },
    scripts: Object.fromEntries(gates.map((gate) => [gate, 'node check.mjs'])),
  }));
  write('packages/app/check.mjs', "import assert from 'node:assert/strict';\nimport { value } from '../bridge/index.mjs';\nassert.equal(value, 1);\n");
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['add', '.'],
    ['-c', 'user.name=cache-test', '-c', 'user.email=cache-test@example.test', 'commit', '-qm', 'fixture'],
  ]) {
    const result = run('git', args);
    assert.equal(result.status, 0, output(result));
  }
  const baseline = check(...gates);
  assert.equal(baseline.status, 0, output(baseline));
  const cached = check(...gates);
  assert.equal(cached.status, 0, output(cached));
  assert.match(output(cached), /cache hit/);
  write('packages/source/index.mjs', 'export const value = 2;\n');
  for (const gate of gates) {
    const result = check(gate);
    assert.equal(result.status, 1, `${gate} reused stale success:\n${output(result)}`);
    assert.match(output(result), /AssertionError/);
  }
  console.log('turbo cache: all gates invalidate after a transitive source-only dependency changes');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
