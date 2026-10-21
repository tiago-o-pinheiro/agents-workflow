#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_OUT = 20;
const DEFAULT_LOOPS = { S: 2, M: 3, L: 4 };
const HEADER = /^## (GATE|TEST|QA|SR|BH)-(\d+) · (blocker|major|minor) · (.+)$/;
const PATHSPEC = ['--', '.', ':(exclude)*lock*', ':(exclude)*.lock', ':(exclude).dev/**'];
const SET_KEYS = ['phase', 'tier', 'round', 'maxRounds', 'profile', 'consults'];
const NUMERIC = ['round', 'maxRounds', 'consults'];
const USAGE = [
  'usage: run.mjs <cmd> [args]',
  '  context | map | finish | abort',
  '  init "<request>" [--tier S|M|L] [--profile p]',
  '  snapshot [--run id]',
  '  check [--run id] [--full] [--files a b]',
  '  set key=value ...',
  '  log <agent> <STATUS> "<note>"',
  '  findings [--open]',
];

class CliError extends Error {}

const out = (lines) => console.log(lines.slice(0, MAX_OUT).join('\n'));
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const git = (args, { env = {}, input, allowFail = false } = {}) => {
  const res = spawnSync('git', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) {
    if (allowFail) return null;
    throw new CliError(`git ${args[0]} failed: ${(res.stderr || '').trim().split('\n')[0]}`);
  }
  return res.stdout.trim();
};

const identityEnv = () => {
  const has = (key) => Boolean(git(['config', key], { allowFail: true }));
  const env = {};
  if (!has('user.name')) Object.assign(env, { GIT_AUTHOR_NAME: 'dev', GIT_COMMITTER_NAME: 'dev' });
  if (!has('user.email')) {
    Object.assign(env, { GIT_AUTHOR_EMAIL: 'dev@localhost', GIT_COMMITTER_EMAIL: 'dev@localhost' });
  }
  return env;
};

export const takeSnapshot = (id, name) => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index'), ...identityEnv() };
    git(['add', '-A'], { env });
    const tree = git(['write-tree'], { env });
    const parent = git(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
    const args = ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'dev snapshot'];
    const sha = git(args, { env });
    git(['update-ref', `refs/dev/${id}/${name}`, sha]);
    return sha;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

export const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-') || 'run';

export const runId = (request, date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
  return `${stamp}-${slugify(request)}`;
};

export const parseFindings = (text) => {
  const entries = [];
  let current = null;
  for (const line of text.split('\n')) {
    const m = HEADER.exec(line);
    if (m) {
      current = { id: `${m[1]}-${m[2]}`, prefix: m[1], n: Number(m[2]), severity: m[3], status: m[4] };
      entries.push(current);
      continue;
    }
    const field = current && /^(where|problem|fix): ?(.*)$/.exec(line);
    if (field) current[field[1]] = field[2];
  }
  return entries;
};

export const isOpen = (entry) => entry.status === 'open' || entry.status === 'reopened';

const nextId = (entries, prefix) =>
  `${prefix}-${Math.max(0, ...entries.filter((e) => e.prefix === prefix).map((e) => e.n)) + 1}`;

const setStatus = (text, id, status) =>
  text
    .split('\n')
    .map((line) => {
      const m = HEADER.exec(line);
      return m && `${m[1]}-${m[2]}` === id ? `## ${id} · ${m[3]} · ${status}` : line;
    })
    .join('\n');

export const applyGates = (ledger, gates) => {
  let text = ledger;
  for (const gate of gates) {
    if (gate.status === 'SKIP') continue;
    const mine = parseFindings(text).filter((e) => e.prefix === 'GATE' && e.where === gate.name);
    if (gate.status === 'PASS') {
      for (const e of mine.filter((x) => isOpen(x) || x.status.startsWith('fixed'))) {
        text = setStatus(text, e.id, 'verified');
      }
      continue;
    }
    if (mine.some(isOpen)) continue;
    const last = mine.at(-1);
    if (last) {
      text = setStatus(text, last.id, 'reopened');
      continue;
    }
    const id = nextId(parseFindings(text), 'GATE');
    const problem = gate.output.split('\n').find((l) => l.trim())?.trim() ?? `${gate.name} failed`;
    text = `${text.trimEnd()}\n\n## ${id} · blocker · open\nwhere: ${gate.name}\nproblem: ${problem}\nfix: make the gate pass\n`;
  }
  return text;
};

export const extractExports = (source) => {
  const names = [];
  const decl = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+function\*?|function\*?|const|let|var|class|type|interface|enum)\s+(\w+)/gm;
  for (const m of source.matchAll(decl)) names.push(m[1]);
  for (const m of source.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  if (/^export\s+default\b/m.test(source)) names.push('default');
  return [...new Set(names)];
};

export const topScope = (files) => {
  const counts = new Map();
  for (const file of files) {
    const parts = file.split('/');
    if (parts.length < 2) continue;
    const key = ['packages', 'apps'].includes(parts[0]) && parts.length > 2 ? parts[1] : parts[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

const runsDir = () => join('.dev', 'runs');

const loadRun = (id) => {
  const state = readJson(join(runsDir(), id, 'state.json'));
  if (!state) throw new CliError(`run not found: ${id}`);
  return state;
};

const flagValue = (args, flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const resolveRun = (args) => {
  const explicit = flagValue(args, '--run');
  if (explicit) return loadRun(explicit);
  const active = activeRun();
  if (!active) throw new CliError('no active run (use init or --run <id>)');
  return active;
};

const activeRun = () => {
  if (!existsSync(runsDir())) return null;
  const ids = readdirSync(runsDir()).sort().reverse();
  for (const id of ids) {
    const state = readJson(join(runsDir(), id, 'state.json'));
    if (state && !['done', 'aborted'].includes(state.phase)) return state;
  }
  return null;
};

const saveState = (state) => {
  state.updatedAt = now();
  writeFileSync(join(runsDir(), state.id, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
};

const runPath = (state, file) => join(runsDir(), state.id, file);
const readLedger = (state) => {
  const path = runPath(state, 'findings.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : '# Findings\n';
};

const ensureGitignore = (entries) => {
  const text = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
  const have = new Set(text.split('\n').map((l) => l.trim().replace(/\/$/, '')));
  const missing = entries.filter((e) => !have.has(e.replace(/\/$/, '')));
  if (!missing.length) return;
  const prefix = text && !text.endsWith('\n') ? '\n' : '';
  appendFileSync('.gitignore', `${prefix}${missing.join('\n')}\n`);
};

const diffStat = (state) => {
  const lines = git(['diff', '--stat', state.base, state.head, ...PATHSPEC]).split('\n').filter(Boolean);
  return lines.length > MAX_OUT ? [...lines.slice(0, MAX_OUT - 1), lines.at(-1)] : lines;
};

const cmdInit = (args) => {
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--tier', '--profile'].includes(args[i - 1]));
  const request = positional.join(' ').trim();
  if (!request) throw new CliError('init needs a request');
  const config = readJson(join('.dev', 'config.json')) ?? {};
  const tier = flagValue(args, '--tier') ?? 'M';
  if (!DEFAULT_LOOPS[tier]) throw new CliError(`invalid tier: ${tier}`);
  const id = runId(request);
  mkdirSync(join(runsDir(), id), { recursive: true });
  writeFileSync(join(runsDir(), id, 'findings.md'), '# Findings\n');
  ensureGitignore(['.dev/runs/', '.dev/map.md']);
  const base = takeSnapshot(id, 'base');
  git(['update-ref', `refs/dev/${id}/head`, base]);
  const stamp = now();
  const state = {
    id, request, tier,
    profile: flagValue(args, '--profile') ?? config.pipeline?.profile ?? 'balanced',
    phase: 'plan', round: 0,
    maxRounds: config.pipeline?.maxFixLoops?.[tier] ?? DEFAULT_LOOPS[tier],
    base, head: base, consults: 0, history: [], createdAt: stamp, updatedAt: stamp,
  };
  saveState(state);
  out([`run: ${id}`, `folder: ${join(runsDir(), id)}`, `tier ${tier} · profile ${state.profile} · maxRounds ${state.maxRounds}`]);
};

const rotateHead = (id) => {
  const prev = git(['rev-parse', '--verify', '-q', `refs/dev/${id}/head`], { allowFail: true });
  if (prev) git(['update-ref', `refs/dev/${id}/prev`, prev]);
  return prev;
};

const writePatch = (state, file, from) => {
  const patch = git(['diff', from, state.head, ...PATHSPEC]);
  writeFileSync(runPath(state, file), patch ? `${patch}\n` : '');
};

const cmdSnapshot = (args) => {
  const state = resolveRun(args);
  const prev = rotateHead(state.id);
  state.head = takeSnapshot(state.id, 'head');
  writePatch(state, 'diff.patch', state.base);
  if (prev) writePatch(state, 'fix.patch', prev);
  saveState(state);
  const stat = diffStat(state);
  out(stat.length ? stat : ['no changes since run start']);
};

const checkScript = () => (existsSync(join('scripts', 'check.mjs')) ? join('scripts', 'check.mjs') : join(HERE, 'check.mjs'));

const checkArgs = (args) => {
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run') i++;
    else rest.push(args[i]);
  }
  return rest;
};

const cmdCheck = (args) => {
  const state = resolveRun(args);
  const res = spawnSync('node', [checkScript(), '--json', ...checkArgs(args)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    throw new CliError(`check.mjs produced no JSON: ${(res.stderr || res.stdout).trim().split('\n')[0]}`);
  }
  const summary = report.gates.map((g) => `${g.name} ${g.status}${g.status === 'SKIP' ? '' : ` ${(g.ms / 1000).toFixed(1)}s`}`);
  const log = [...summary, `check: ${report.ok ? 'PASS' : 'FAIL'}`];
  const details = report.gates.filter((g) => g.output).map((g) => `\n--- ${g.name}\n${g.output}`);
  writeFileSync(runPath(state, 'gates.log'), `${log.join('\n')}\n${details.join('\n')}\n`);
  writeFileSync(runPath(state, 'findings.md'), applyGates(readLedger(state), report.gates));
  saveState(state);
  const open = parseFindings(readLedger(state)).filter((e) => e.prefix === 'GATE' && isOpen(e));
  out([...log, `open GATE findings: ${open.length}`]);
  process.exitCode = report.ok ? 0 : 1;
};

const cmdSet = (args) => {
  const state = resolveRun([]);
  for (const pair of args) {
    const [key, ...rest] = pair.split('=');
    if (!SET_KEYS.includes(key) || !rest.length) throw new CliError(`bad pair: ${pair} (keys: ${SET_KEYS.join(', ')})`);
    const value = rest.join('=');
    state[key] = NUMERIC.includes(key) ? Number(value) : value;
    if (NUMERIC.includes(key) && Number.isNaN(state[key])) throw new CliError(`not a number: ${pair}`);
  }
  saveState(state);
  out([`${state.id}: ${SET_KEYS.map((k) => `${k}=${state[k]}`).join(' ')}`]);
};

const cmdLog = (args) => {
  const [agent, status, ...note] = args;
  if (!agent || !status) throw new CliError('usage: log <agent> <STATUS> "<note>"');
  const state = resolveRun([]);
  state.history.push({ at: now(), agent, status, note: note.join(' ') });
  saveState(state);
  out([`logged ${agent} ${status} (${state.history.length} entries)`]);
};

const cmdFindings = (args) => {
  const state = resolveRun(args);
  let entries = parseFindings(readLedger(state));
  if (args.includes('--open')) entries = entries.filter(isOpen);
  out(entries.length ? entries.map((e) => `${e.id} · ${e.severity} · ${e.status} · ${e.where ?? '?'}`) : ['no findings']);
};

const cmdContext = () => {
  const config = readJson(join('.dev', 'config.json'));
  const lines = [];
  if (!config) lines.push('config: none (.dev/config.json missing)');
  else {
    const loops = config.pipeline?.maxFixLoops ?? DEFAULT_LOOPS;
    lines.push(`profile: ${config.pipeline?.profile ?? 'balanced'} · loops S${loops.S} M${loops.M} L${loops.L}`);
  }
  const state = activeRun();
  if (!state) lines.push('run: none active');
  else {
    const open = parseFindings(readLedger(state)).filter((e) => isOpen(e) && e.severity !== 'minor');
    lines.push(`run: ${state.id}`, `tier ${state.tier} · phase ${state.phase} · round ${state.round}/${state.maxRounds}`);
    lines.push(`open blocker/major: ${open.length}`);
  }
  const learnings = join('.dev', 'learnings.md');
  const count = existsSync(learnings) ? readFileSync(learnings, 'utf8').split('\n').length : 0;
  lines.push(`learnings: ${count} lines`);
  const status = git(['status', '--short'], { allowFail: true });
  lines.push(`git status: ${status ? status.split('\n').length : 0} changed`);
  out(lines);
};

const SKIP_PATH = /(^|\/)(node_modules|dist|\.next|build)\//;
const SKIP_FILE = /\.(spec|test)\.[^/]+$|\.d\.ts$/;

const listSources = () =>
  git(['ls-files', '-co', '--exclude-standard']).split('\n')
    .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !SKIP_PATH.test(f) && !SKIP_FILE.test(f) && existsSync(f))
    .sort();

const cmdMap = (args) => {
  const target = join('.dev', 'map.md');
  const head = git(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true }) ?? 'none';
  const marker = `<!-- head: ${head} -->`;
  if (!args.includes('--force') && existsSync(target) && readFileSync(target, 'utf8').startsWith(marker)) {
    out([`${target} (cached, ${readFileSync(target, 'utf8').split('\n').length - 1} lines)`]);
    return;
  }
  const lines = [marker];
  for (const file of listSources()) {
    const names = extractExports(readFileSync(file, 'utf8'));
    if (names.length) lines.push(`${file}: ${names.join(', ')}`);
  }
  mkdirSync('.dev', { recursive: true });
  writeFileSync(target, `${lines.slice(0, 400).join('\n')}\n`);
  out([target, `${Math.min(lines.length, 400)} lines`]);
};

const taskTitles = (state) => {
  const plan = join(runsDir(), state.id, 'plan.md');
  if (existsSync(plan)) {
    const titles = [...readFileSync(plan, 'utf8').matchAll(/^### (T-\d+\s.+)$/gm)].map((m) => m[1].trim());
    if (titles.length) return titles;
  }
  const task = join(runsDir(), state.id, 'task.md');
  const first = existsSync(task) ? readFileSync(task, 'utf8').split('\n').find((l) => l.trim()) : null;
  return [first ? first.replace(/^#+\s*/, '').trim() : state.request];
};

const dropRefs = (id) => {
  const refs = git(['for-each-ref', '--format=%(refname)', `refs/dev/${id}/`]).split('\n').filter(Boolean);
  for (const ref of refs) git(['update-ref', '-d', ref]);
};

const cmdFinish = (args) => {
  const state = resolveRun(args);
  state.head = takeSnapshot(state.id, 'head');
  const files = git(['diff', '--name-only', state.base, state.head, ...PATHSPEC]).split('\n').filter(Boolean);
  const titles = taskTitles(state);
  state.phase = 'done';
  saveState(state);
  dropRefs(state.id);
  out([`done: ${state.id}`, `scope: ${topScope(files) || '(none)'}`, `files changed: ${files.length}`, 'tasks:', ...titles.slice(0, 14).map((t) => `- ${t}`)]);
};

const cmdAbort = (args) => {
  const state = resolveRun(args);
  state.phase = 'aborted';
  saveState(state);
  dropRefs(state.id);
  out([`aborted: ${state.id}`]);
};

const COMMANDS = {
  context: cmdContext, init: cmdInit, snapshot: cmdSnapshot, check: cmdCheck, set: cmdSet,
  log: cmdLog, findings: cmdFindings, map: cmdMap, finish: cmdFinish, abort: cmdAbort,
};

export const main = (argv = process.argv.slice(2)) => {
  const [cmd, ...args] = argv;
  const handler = COMMANDS[cmd];
  if (!handler) {
    out(USAGE);
    return 2;
  }
  try {
    handler(args);
    return process.exitCode ?? 0;
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    console.error(error.message);
    return 1;
  }
};

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) process.exit(main());
