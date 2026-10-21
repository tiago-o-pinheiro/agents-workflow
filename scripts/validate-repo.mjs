#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_BUDGET = { conventions: 160, adopt: 100 };
const SKILL_KEYS = ['name', 'description', 'argument-hint', 'disable-model-invocation', 'allowed-tools', 'paths', 'effort'];
const AGENT_KEYS = ['name', 'description', 'tools', 'model', 'effort', 'maxTurns', 'skills', 'color'];
const AGENT_FORBIDDEN = ['hooks', 'mcpServers', 'permissionMode'];
const AGENT_REQUIRED = ['name', 'description', 'tools', 'model'];
const MODELS = ['opus', 'sonnet', 'haiku', 'fable', 'inherit'];
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|zip|gz|lockb)$/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

export const parseFrontmatter = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    if (value === '' || value === '>' || value === '|') {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      const isList = block.length > 0 && block.every((l) => l.startsWith('- '));
      data[key] = isList ? block.map((l) => unquote(l.slice(2))) : block.join(' ');
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else data[key] = unquote(value);
  }
  return data;
};

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');

export const checkFrontmatter = (path, text, kind) => {
  const errors = [];
  const data = parseFrontmatter(text);
  if (!data) return [`missing frontmatter`];
  const isAgent = kind === 'agent';
  const allowed = isAgent ? AGENT_KEYS : SKILL_KEYS;
  const required = isAgent ? AGENT_REQUIRED : ['name', 'description'];
  for (const key of required) if (!data[key] || data[key].length === 0) errors.push(`missing required key: ${key}`);
  for (const key of Object.keys(data)) {
    if (isAgent && AGENT_FORBIDDEN.includes(key)) errors.push(`forbidden agent key: ${key}`);
    else if (!allowed.includes(key)) errors.push(`unknown key: ${key}`);
  }
  const limit = isAgent ? 200 : 250;
  if (typeof data.description === 'string' && data.description.length > limit) {
    errors.push(`description is ${data.description.length} chars (max ${limit})`);
  }
  const expected = isAgent ? posix.basename(path, '.md') : posix.basename(posix.dirname(path));
  if (data.name && data.name !== expected) errors.push(`name "${data.name}" does not match "${expected}"`);
  if (isAgent && data.model && !MODELS.includes(data.model)) errors.push(`invalid model: ${data.model}`);
  return errors;
};

export const budgetFor = (path) => {
  let m = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
  if (m) return SKILL_BUDGET[m[1]] ?? 250;
  if (/^skills\/[^/]+\/references\/[^/]+\.md$/.test(path)) return 200;
  if (/^skills\/start\/recipes\/[^/]+\.md$/.test(path)) return 150;
  if (/^agents\/[^/]+\.md$/.test(path)) return 140;
  return null;
};

export const checkLinks = (path, text, exists) => {
  const errors = [];
  const body = text.replace(/```[\s\S]*?```/g, '');
  for (const m of body.matchAll(LINK)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target) || /[${}<]/.test(target)) continue;
    const file = target.split('#')[0];
    if (file && !exists(posix.join(posix.dirname(path), file))) errors.push(`broken link: ${target}`);
  }
  return errors;
};

const listFiles = (root) => {
  const res = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  if (res.status !== 0) return [];
  return res.stdout.split('\n').filter((f) => f && existsSync(join(root, f)));
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const validate = (root, { strict = false } = {}) => {
  const issues = [];
  const add = (level, path, msg) => issues.push({ level, path, msg });
  const files = listFiles(root);
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const fileSet = new Set(files);
  const exists = (rel) => fileSet.has(rel) || existsSync(join(root, rel));
  const texts = files.filter((f) => !BINARY.test(f)).map((f) => [f, read(f)]).filter(([, t]) => !t.includes('\0'));

  for (const [file, text] of texts) {
    const max = budgetFor(file);
    if (max) {
      const count = lineCount(text);
      if (count > max) add('ERROR', file, `${count} lines (max ${max})`);
      if (/references\/[^/]+\.md$/.test(file) && count > 100 && !/^## Contents$/m.test(text)) {
        add('ERROR', file, 'over 100 lines without "## Contents"');
      }
    }
    const kind = /^skills\/[^/]+\/SKILL\.md$/.test(file) ? 'skill' : /^agents\/[^/]+\.md$/.test(file) ? 'agent' : null;
    if (kind) for (const msg of checkFrontmatter(file, text, kind)) add('ERROR', file, msg);
    if (file.endsWith('.md')) for (const msg of checkLinks(file, text, exists)) add('ERROR', file, msg);
    text.split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) add('ERROR', `${file}:${i + 1}`, 'emoji character');
    });
    if (file.endsWith('.json')) {
      try {
        JSON.parse(text);
      } catch (error) {
        add('ERROR', file, `invalid JSON: ${error.message}`);
      }
    }
  }

  const wordsFile = join(root, '.private-words');
  if (existsSync(wordsFile)) {
    const words = readFileSync(wordsFile, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean);
    const patterns = words.map((w) => new RegExp(`(?<![\\w])${escapeRe(w)}(?![\\w])`, 'i'));
    for (const [file, text] of texts) {
      if (file === '.private-words') continue;
      text.split('\n').forEach((line, i) => {
        if (patterns.some((re) => re.test(line))) add('ERROR', `${file}:${i + 1}`, 'private word');
      });
    }
  }

  checkFragments(root, strict, add);
  return issues;
};

const checkFragments = (root, strict, add) => {
  const base = 'skills/start/templates';
  const registry = join(root, base, 'fragments.json');
  if (!existsSync(registry)) return;
  let fragments;
  let packages = {};
  try {
    fragments = JSON.parse(readFileSync(registry, 'utf8')).fragments ?? [];
    const versions = join(root, base, 'versions.json');
    if (existsSync(versions)) packages = JSON.parse(readFileSync(versions, 'utf8')).packages ?? {};
  } catch {
    return;
  }
  for (const { id, dir } of fragments) {
    const full = join(root, base, dir);
    if (!existsSync(full)) {
      add(strict ? 'ERROR' : 'WARN', `${base}/fragments.json`, `fragment "${id}": dir missing: ${dir}`);
      continue;
    }
    const meta = join(full, 'fragment.json');
    if (!existsSync(meta)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(meta, 'utf8'));
    } catch {
      continue;
    }
    for (const field of ['deps', 'devDeps']) {
      for (const names of Object.values(parsed[field] ?? {})) {
        for (const name of names) {
          if (!(name in packages)) add('ERROR', `${base}/${dir}/fragment.json`, `${field} "${name}" not in versions.json`);
        }
      }
    }
  }
};

export const main = (argv = process.argv.slice(2), root = process.cwd()) => {
  const issues = validate(root, { strict: argv.includes('--strict') });
  for (const { level, path, msg } of issues) console.log(`${level} ${path}: ${msg}`);
  const errors = issues.filter((i) => i.level === 'ERROR').length;
  console.log(`validate: ${errors} errors, ${issues.length - errors} warnings`);
  return errors ? 1 : 0;
};

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) process.exit(main());
