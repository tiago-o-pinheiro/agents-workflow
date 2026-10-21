import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectPm, filterOutput, stripAnsi } from '../skills/feature/scripts/check.mjs';
import { applyGates, parseFindings, slugify } from '../skills/feature/scripts/run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(ROOT, 'skills/feature/scripts/check.mjs');
const RUN = join(ROOT, 'skills/feature/scripts/run.mjs');
const VALIDATE = join(ROOT, 'scripts/validate-repo.mjs');

const tmp = () => mkdtempSync(join(tmpdir(), 'dev-test-'));
const write = (dir, rel, content) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
};
const node = (script, args, cwd) => spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const gitRepo = () => {
  const dir = tmp();
  git(dir, 'init', '-q');
  return dir;
};

test('check: package manager detection', () => {
  const dir = tmp();
  assert.equal(detectPm(dir), 'npm');
  write(dir, 'pnpm-lock.yaml', '');
  assert.equal(detectPm(dir), 'pnpm');
  const bun = tmp();
  write(bun, 'bun.lock', '');
  assert.equal(detectPm(bun), 'bun');
  const yarn = tmp();
  write(yarn, 'yarn.lock', '');
  assert.equal(detectPm(yarn), 'yarn');
  write(yarn, '.dev/config.json', '{"packageManager":"bun"}');
  assert.equal(detectPm(yarn), 'bun');
});

test('check: ANSI strip and error filtering', () => {
  assert.equal(stripAnsi('\u001b[31mred\u001b[0m'), 'red');
  const sample = [
    '> app@1.0.0 typecheck',
    '',
    '\u001b[31msrc/a.ts(3,5): error TS2322: Type string is not assignable\u001b[0m',
    'src/a.ts(3,5): error TS2322: Type string is not assignable',
    '/p/src/b.tsx:10:4  error  Unexpected any  no-explicit-any',
    ' FAIL  src/c.test.ts > adds',
    'AssertionError: expected 1 to be 2',
    '  Expected: 2',
    '  Received: 1',
    'Test Files  1 failed',
    'compiling...',
  ].join('\n');
  const lines = filterOutput(sample).split('\n');
  assert.equal(lines.filter((l) => l.includes('TS2322')).length, 1);
  assert.ok(lines.some((l) => l.includes('b.tsx:10:4')));
  assert.ok(lines.some((l) => l.includes('Received')));
  assert.ok(!lines.some((l) => l.includes('compiling')));
  const many = Array.from({ length: 50 }, (_, i) => `f.ts:${i + 1}:1 error x${i}`).join('\n');
  assert.equal(filterOutput(many).split('\n').length, 30);
});

test('check: json shape and exit code', () => {
  const dir = tmp();
  write(dir, 'package.json', JSON.stringify({
    scripts: { typecheck: 'node -e "process.exit(0)"', lint: 'node -e "console.error(\'a.ts:1:1 error boom\');process.exit(1)"' },
  }));
  const res = node(CHECK, ['--json'], dir);
  assert.equal(res.status, 1);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, false);
  const byName = Object.fromEntries(report.gates.map((g) => [g.name, g]));
  assert.equal(byName.typecheck.status, 'PASS');
  assert.equal(byName.lint.status, 'FAIL');
  assert.match(byName.lint.output, /a\.ts:1:1 error boom/);
  assert.equal(byName.test.status, 'SKIP');
  assert.equal(typeof byName.lint.ms, 'number');
  const human = node(CHECK, ['--only', 'typecheck'], dir);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /typecheck PASS/);
  assert.match(human.stdout, /check: PASS/);
});

test('run: helpers', () => {
  assert.equal(slugify('Add a Notes list, with Create form! extra words'), 'add-a-notes-list-with');
  const ledger = '# Findings\n\n## QA-2 · major · open\nwhere: a.ts:3\nproblem: p\nfix: f\n\n## GATE-1 · blocker · verified\nwhere: lint\n';
  const entries = parseFindings(ledger);
  assert.deepEqual(entries.map((e) => e.id), ['QA-2', 'GATE-1']);
  assert.equal(entries[0].where, 'a.ts:3');
  const next = applyGates(ledger, [{ name: 'lint', status: 'FAIL', output: 'x.ts:1:1 error z' }]);
  assert.match(next, /## GATE-1 · blocker · reopened/);
});

test('run: init, snapshot, fix.patch, set, log, findings, finish', () => {
  const dir = gitRepo();
  write(dir, 'src/a.ts', 'export const a = 1;\n');
  const init = node(RUN, ['init', 'Add Notes list', '--tier', 'S'], dir);
  assert.equal(init.status, 0, init.stderr);
  const id = /run: (\S+)/.exec(init.stdout)[1];
  assert.match(id, /^\d{8}-\d{4}-add-notes-list$/);
  const state = () => JSON.parse(readFileSync(join(dir, `.dev/runs/${id}/state.json`), 'utf8'));
  assert.equal(state().maxRounds, 2);
  assert.equal(state().profile, 'balanced');
  assert.equal(readFileSync(join(dir, `.dev/runs/${id}/findings.md`), 'utf8'), '# Findings\n');
  const ignore = readFileSync(join(dir, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.dev\/runs\/$/m);
  assert.match(ignore, /^\.dev\/map\.md$/m);

  write(dir, 'src/new.ts', 'export const fresh = 1;\n');
  const snap = node(RUN, ['snapshot'], dir);
  assert.equal(snap.status, 0, snap.stderr);
  assert.match(readFileSync(join(dir, `.dev/runs/${id}/diff.patch`), 'utf8'), /src\/new\.ts/);
  assert.equal(git(dir, 'diff', '--cached', '--name-only').stdout.trim(), '');

  write(dir, 'src/second.ts', 'export const second = 2;\n');
  node(RUN, ['snapshot'], dir);
  const fix = readFileSync(join(dir, `.dev/runs/${id}/fix.patch`), 'utf8');
  assert.match(fix, /second\.ts/);
  assert.doesNotMatch(fix, /new\.ts/);
  assert.match(readFileSync(join(dir, `.dev/runs/${id}/diff.patch`), 'utf8'), /new\.ts/);

  assert.equal(node(RUN, ['set', 'phase=code', 'round=1'], dir).status, 0);
  assert.equal(state().phase, 'code');
  assert.equal(state().round, 1);
  node(RUN, ['log', 'coder', 'DONE', 'did it'], dir);
  assert.equal(state().history[0].agent, 'coder');

  write(dir, `.dev/runs/${id}/findings.md`, '# Findings\n\n## QA-1 · major · open\nwhere: src/a.ts:1\nproblem: p\nfix: f\n\n## SR-1 · minor · verified\nwhere: src/b.ts\n');
  const all = node(RUN, ['findings'], dir).stdout.trim().split('\n');
  assert.equal(all.length, 2);
  const open = node(RUN, ['findings', '--open'], dir).stdout.trim().split('\n');
  assert.deepEqual(open, ['QA-1 · major · open · src/a.ts:1']);
  assert.match(node(RUN, ['context'], dir).stdout, /phase code/);

  const refs = () => git(dir, 'for-each-ref', 'refs/dev/').stdout.trim();
  assert.ok(refs().includes(`refs/dev/${id}/head`));
  const fin = node(RUN, ['finish'], dir);
  assert.equal(fin.status, 0, fin.stderr);
  assert.match(fin.stdout, /scope: src/);
  assert.equal(refs(), '');
  assert.equal(state().phase, 'done');
});

test('run: check adds then verifies GATE entries', () => {
  const dir = gitRepo();
  write(dir, 'a.txt', 'x');
  const id = /run: (\S+)/.exec(node(RUN, ['init', 'gate test'], dir).stdout)[1];
  const stub = (status) => write(dir, 'scripts/check.mjs',
    `console.log(JSON.stringify({ok:${status === 'PASS'},gates:[{name:'lint',status:'${status}',ms:5,output:'a.ts:1:1 error bad'}]}));`);
  const ledger = () => readFileSync(join(dir, `.dev/runs/${id}/findings.md`), 'utf8');

  stub('FAIL');
  assert.equal(node(RUN, ['check'], dir).status, 1);
  assert.match(ledger(), /## GATE-1 · blocker · open\nwhere: lint\nproblem: a\.ts:1:1 error bad/);
  node(RUN, ['check'], dir);
  assert.equal(parseFindings(ledger()).length, 1);
  assert.ok(existsSync(join(dir, `.dev/runs/${id}/gates.log`)));

  stub('PASS');
  assert.equal(node(RUN, ['check'], dir).status, 0);
  assert.match(ledger(), /## GATE-1 · blocker · verified/);

  stub('FAIL');
  node(RUN, ['check'], dir);
  assert.match(ledger(), /## GATE-1 · blocker · reopened/);
});

test('run: map and unknown command', () => {
  const dir = gitRepo();
  write(dir, 'src/a.ts', 'export const a = 1;\nexport function b() {}\nexport type T = {};\nexport { c, d as e };\n');
  write(dir, 'src/a.test.ts', 'export const hidden = 1;\n');
  node(RUN, ['map'], dir);
  const map = readFileSync(join(dir, '.dev/map.md'), 'utf8');
  assert.match(map, /^<!-- head: none -->/);
  assert.match(map, /src\/a\.ts: a, b, T, c, e/);
  assert.doesNotMatch(map, /hidden/);
  assert.equal(node(RUN, ['bogus'], dir).status, 2);
});

test('validate-repo: reports budget and link violations', () => {
  const dir = gitRepo();
  write(dir, 'skills/adopt/SKILL.md',
    `---\nname: adopt\ndescription: Adopt things.\n---\n[gone](references/missing.md)\n${'line\n'.repeat(120)}`);
  write(dir, 'agents/coder.md', '---\nname: coder\ndescription: d\ntools: Read\nmodel: opus\n---\nok\n');
  const res = node(VALIDATE, [], dir);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /ERROR skills\/adopt\/SKILL\.md: \d+ lines \(max 100\)/);
  assert.match(res.stdout, /broken link: references\/missing\.md/);
  assert.doesNotMatch(res.stdout, /agents\/coder\.md/);
});

test('validate-repo: frontmatter and fragment deps', () => {
  const dir = gitRepo();
  write(dir, 'agents/bad.md', '---\nname: other\ndescription: d\ntools: Read\nmodel: gpt\nhooks: x\n---\n');
  write(dir, 'skills/start/templates/fragments.json', '{"fragments":[{"id":"x","dir":"x","when":{}},{"id":"y","dir":"y","when":{}}]}');
  write(dir, 'skills/start/templates/versions.json', '{"packages":{"known":"^1"}}');
  write(dir, 'skills/start/templates/x/fragment.json', '{"deps":{"@api":["known","unknown"]}}');
  const res = node(VALIDATE, [], dir);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /forbidden agent key: hooks/);
  assert.match(res.stdout, /invalid model: gpt/);
  assert.match(res.stdout, /does not match "bad"/);
  assert.match(res.stdout, /deps "unknown" not in versions\.json/);
  assert.match(res.stdout, /WARN .*dir missing: y/);
  assert.doesNotMatch(res.stdout, /"known"/);
});
