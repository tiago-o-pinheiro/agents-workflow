#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 30;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ERROR_LINE =
  /(\S+:\d+:\d+)|\berror\b|Error:|\bFAIL\b|✗|×|TS\d{4}|AssertionError|\bExpected\b|\bReceived\b/;
const NOISE = /^\s*(>|✓|√|Duration|Start at|Test Files|Tests\s)/;

export const stripAnsi = (text) => text.replace(ANSI, '');

export const filterOutput = (text, max = MAX_LINES) => {
  const seen = new Set();
  const kept = [];
  for (const raw of stripAnsi(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim() || NOISE.test(line) || !ERROR_LINE.test(line)) continue;
    if (seen.has(line.trim())) continue;
    seen.add(line.trim());
    kept.push(line);
  }
  return kept.slice(0, max).join('\n');
};

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

export const detectPm = (cwd) => {
  const configured = readJson(join(cwd, '.dev', 'config.json'))?.packageManager;
  if (['pnpm', 'bun', 'yarn', 'npm'].includes(configured)) return configured;
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
};

const EXEC = {
  pnpm: ['pnpm', 'exec'],
  bun: ['bunx'],
  yarn: ['yarn', 'exec'],
  npm: ['npx', '--no-install'],
};

export const parseArgs = (argv) => {
  const opts = { full: false, json: false, only: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') opts.full = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--only') opts.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (arg === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.files.push(argv[++i]);
    }
  }
  return opts;
};

export const planGates = (opts, scripts, cwd, pm) => {
  const exec = EXEC[pm];
  const filesMode = opts.files.length > 0;
  let names = filesMode ? ['lint', 'test'] : ['typecheck', 'lint', 'test'];
  if (opts.full && !filesMode) names.push('build');
  if (opts.only) names = names.filter((n) => opts.only.includes(n));
  return names.map((name) => {
    if (filesMode && name === 'lint') return { name, cmd: [...exec, 'eslint', ...opts.files] };
    if (filesMode && name === 'test') {
      if (!existsSync(join(cwd, 'node_modules', '.bin', 'vitest'))) return { name, cmd: null };
      return { name, cmd: [...exec, 'vitest', 'related', '--run', ...opts.files] };
    }
    return { name, cmd: scripts[name] ? [pm, 'run', name] : null };
  });
};

const runGate = ({ name, cmd }, cwd) => {
  if (!cmd) return { name, status: 'SKIP', ms: 0, output: '' };
  const start = Date.now();
  const res = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
  });
  const ms = Date.now() - start;
  const ok = res.status === 0 && !res.error;
  const raw = `${res.stdout ?? ''}\n${res.stderr ?? ''}\n${res.error ? `error: ${res.error.message}` : ''}`;
  return { name, status: ok ? 'PASS' : 'FAIL', ms, output: ok ? '' : filterOutput(raw) };
};

export const formatHuman = (gates) => {
  const lines = [];
  for (const g of gates) {
    lines.push(`${g.name} ${g.status}${g.status === 'SKIP' ? '' : ` ${(g.ms / 1000).toFixed(1)}s`}`);
    if (g.status === 'FAIL') for (const l of g.output.split('\n').filter(Boolean)) lines.push(`  ${l}`);
  }
  lines.push(`check: ${gates.some((g) => g.status === 'FAIL') ? 'FAIL' : 'PASS'}`);
  return lines.join('\n');
};

export const main = (argv = process.argv.slice(2), cwd = process.cwd()) => {
  const opts = parseArgs(argv);
  const scripts = readJson(join(cwd, 'package.json'))?.scripts ?? {};
  const pm = detectPm(cwd);
  const gates = planGates(opts, scripts, cwd, pm).map((g) => runGate(g, cwd));
  const ok = !gates.some((g) => g.status === 'FAIL');
  console.log(opts.json ? JSON.stringify({ ok, gates }) : formatHuman(gates));
  return ok ? 0 : 1;
};

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) process.exit(main());
