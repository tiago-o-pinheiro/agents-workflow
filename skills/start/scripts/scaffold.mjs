#!/usr/bin/env node
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  realpathSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(realpathSync(fileURLToPath(import.meta.url)));
const DEFAULTS = {
  templatesDir: join(HERE, '../templates'),
  conventionsDir: join(HERE, '../../conventions/references'),
  checkFile: join(HERE, '../../feature/scripts/check.mjs'),
};

const ENUMS = {
  layout: ['auto', 'single', 'turbo', 'bun'],
  packageManager: ['pnpm', 'bun'],
  frontend: ['next', 'vite', 'none'],
  backend: ['next', 'fastify', 'hono', 'express', 'none'],
  validation: ['typebox', 'zod'],
  ui: ['own', 'shadcn', 'none'],
  state: ['context', 'tanstack-query', 'zustand'],
  orm: ['prisma', 'drizzle', 'none'],
  auth: ['none', 'better-auth', 'google-jwt', 'authjs'],
  extras: ['git-hooks', 'ci', 'claude-hooks', 'i18n'],
};
const LIBS = ['@models', '@core', '@tokens', '@ui', '@i18n'];
const NODE_APIS = ['fastify', 'hono', 'express'];

const fail = (message) => {
  throw new Error(message);
};

const asList = (value) => (Array.isArray(value) ? value : [value]);

const checkEnums = (raw) => {
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const bad = asList(raw[key] ?? []).filter((value) => !allowed.includes(value));
    if (bad.length > 0) fail(`invalid ${key}: ${bad.join(', ')} (allowed: ${allowed.join(', ')})`);
  }
};

const buildRecipes = (a, previous) => {
  const ids = [
    a.orm !== 'none' && `orm-${a.orm}`,
    a.auth !== 'none' && `auth-${a.auth}`,
    a.ui === 'shadcn' && 'ui-shadcn',
    a.state.includes('tanstack-query') && 'state-tanstack-query',
    a.state.includes('zustand') && 'state-zustand',
  ].filter(Boolean);
  const known = new Map((previous ?? []).map((recipe) => [recipe.id, recipe.status]));
  return ids.map((id) => ({ id, status: known.get(id) ?? 'pending' }));
};

const buildPipeline = (raw = {}) => ({
  profile: raw.profile ?? 'balanced',
  maxFixLoops: { S: 2, M: 3, L: 4, ...raw.maxFixLoops },
  planApproval: raw.planApproval ?? ['L'],
});

export const normalizeAnswers = (raw) => {
  const notices = [];
  const notice = (message) => notices.push(message);
  checkEnums(raw);
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(raw.name ?? '')) fail(`invalid name: ${raw.name} (kebab-case, 2-41 chars)`);
  const frontend = raw.frontend ?? 'none';
  const backend = raw.backend ?? 'none';
  if (frontend === 'none' && backend === 'none') fail('frontend and backend are both none: nothing to scaffold');
  if (backend === 'next' && frontend !== 'next') fail('backend next requires frontend next');

  let orm = raw.orm ?? 'none';
  let auth = raw.auth ?? 'none';
  if (backend === 'none' && (orm !== 'none' || auth !== 'none')) {
    notice('backend none: orm and auth reset to none');
    orm = 'none';
    auth = 'none';
  }
  if (auth === 'authjs' && frontend !== 'next') fail('auth authjs requires frontend next');
  if ((auth === 'better-auth' || auth === 'google-jwt') && orm === 'none') {
    fail(`auth ${auth} requires an orm: pick prisma or drizzle`);
  }

  let ui = raw.ui ?? 'own';
  let state = [...new Set(raw.state ?? ['context'])];
  if (frontend === 'none') {
    if (ui !== 'none' || state.length > 0) notice('frontend none: ui none, state empty');
    ui = 'none';
    state = [];
  } else if (ui === 'none') {
    notice('frontend present: ui none changed to own');
    ui = 'own';
  }

  const deployables = backend === 'none' || backend === 'next' || frontend === 'none' ? 1 : 2;
  let layout = raw.layout ?? 'auto';
  if (layout === 'auto') layout = deployables === 1 ? 'single' : 'turbo';
  else if (layout === 'single' && deployables === 2) {
    notice('layout single with two deployables changed to turbo');
    layout = 'turbo';
  }
  const packageManager = layout === 'bun' ? 'bun' : layout === 'turbo' ? 'pnpm' : raw.packageManager === 'bun' ? 'bun' : 'pnpm';
  if (raw.packageManager && raw.packageManager !== packageManager) {
    notice(`packageManager ${raw.packageManager} changed to ${packageManager} for layout ${layout}`);
  }

  const answers = {
    version: 1,
    name: raw.name,
    scope: raw.scope?.startsWith('@') ? raw.scope : `@${raw.scope ?? raw.name}`,
    layout,
    packageManager,
    frontend,
    backend,
    validation: raw.validation ?? 'typebox',
    ui,
    state,
    orm,
    auth,
    extras: [...new Set(raw.extras ?? ['git-hooks', 'claude-hooks'])],
    pipeline: buildPipeline(raw.pipeline),
  };
  answers.recipes = buildRecipes(answers, raw.recipes);
  return { answers, notices };
};

const entry = (root, src, owner, virtual = false) => ({ active: true, root, src, virtual, owner });
const INACTIVE = { active: false, root: '', src: '', virtual: false, owner: null };

export const resolveTargets = (a) => {
  const mono = a.layout !== 'single';
  const hasFrontend = a.frontend !== 'none';
  const active = {
    '@root': true,
    '@config': true,
    '@web': hasFrontend,
    '@api': a.backend !== 'none',
    '@models': a.backend !== 'none',
    '@core': hasFrontend && NODE_APIS.includes(a.backend),
    '@tokens': hasFrontend,
    '@ui': hasFrontend,
    '@i18n': a.extras.includes('i18n'),
  };
  const place = (target) => {
    const name = target.slice(1);
    if (target === '@root') return entry('.', 'src', '@root');
    if (target === '@config') return mono ? entry('packages/config', 'packages/config/src', '@config') : entry('config', 'config/src', '@root');
    if (target === '@web') return mono ? entry('apps/web', 'apps/web/src', '@web') : entry('.', 'src', '@root');
    if (target === '@api') {
      if (a.backend === 'next') return mono ? entry('apps/web', 'apps/web/src/server', '@web') : entry('.', 'src/server', '@root');
      return mono ? entry('apps/api', 'apps/api/src', '@api') : entry('.', 'src', '@root');
    }
    if (mono) return entry(`packages/${name}`, `packages/${name}/src`, target);
    const src = target === '@tokens' || target === '@ui' ? `src/design-system/${name}` : `src/${name}`;
    return entry(src, src, '@root', true);
  };
  return new Map(Object.entries(active).map(([target, on]) => [target, on ? place(target) : INACTIVE]));
};

const matches = (when, answers) =>
  Object.entries(when).every(([key, allowed]) => {
    const value = answers[key];
    return Array.isArray(value) ? value.some((item) => allowed.includes(item)) : allowed.includes(value);
  });

export const selectFragments = (registry, answers) => registry.fragments.filter((fragment) => matches(fragment.when, answers));

const toOutputSegment = (segment) => {
  if (segment.startsWith('__')) return segment.slice(1);
  return segment.startsWith('_') ? `.${segment.slice(1)}` : segment;
};

export const mapOutputPath = (target, relPath, targets) => {
  const info = targets.get(target);
  if (!info?.active) return null;
  const parts = relPath.split('/');
  const underSrc = parts[0] === 'src' && parts.length > 1;
  if (info.virtual && !underSrc) return null;
  const rest = (underSrc ? parts.slice(1) : parts).map(toOutputSegment).join('/').replace(/\.tmpl$/, '');
  return posix.join(underSrc ? info.src : info.root, rest);
};

const BASE_DOCS = ['typescript', 'testing', 'git'];

const conventionDocs = (a) => [
  ...BASE_DOCS,
  ...(a.frontend !== 'none' ? ['hooks', 'react', 'design-system'] : []),
  ...(a.backend !== 'none' ? ['backend', 'validation'] : []),
  ...(a.layout !== 'single' ? ['monorepo'] : []),
].map((name) => `${name}.md`);

const PM = {
  pnpm: { run: 'pnpm', exec: 'pnpm exec', install: 'pnpm install', lockfile: 'pnpm-lock.yaml' },
  bun: { run: 'bun run', exec: 'bunx', install: 'bun install', lockfile: 'bun.lock' },
};

const titleCase = (name) => name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

const rel = (from, to) => {
  const path = posix.relative(from, to);
  return path.startsWith('.') ? path : `./${path}`;
};

const buildImports = (a, mono) => {
  const spec = (name, single) => (mono ? `${a.scope}/${name}` : single);
  return {
    models: spec('models', '@/models'),
    core: spec('core', '@/core'),
    tokens: spec('tokens', '@/design-system/tokens'),
    ui: spec('ui', '@/design-system/ui'),
    i18n: spec('i18n', '@/i18n'),
    config: spec('config', './config'),
    api: a.backend === 'next' ? '@/server' : '',
  };
};

const buildPaths = (a, targets) => {
  const dir = (target) => {
    const info = targets.get(target);
    return info.virtual ? info.src : info.root;
  };
  const webSrc = targets.get('@web').src;
  const webCss = a.frontend === 'none' ? '' : posix.join(webSrc, a.frontend === 'next' ? 'app/globals.css' : 'styles.css');
  const apiSrc = targets.get('@api').src;
  return {
    web: dir('@web'), api: dir('@api'), apiSrc, models: dir('@models'), core: dir('@core'),
    tokens: dir('@tokens'), ui: dir('@ui'), i18n: dir('@i18n'), config: dir('@config'),
    envFile: a.backend === 'none' ? '' : `${apiSrc}/config/env.ts`,
    webCss,
  };
};

const buildCss = (a, targets, paths) => {
  if (a.frontend === 'none') return { theme: '', contract: '', uiSource: '' };
  const cssDir = posix.dirname(paths.webCss);
  const uiSource = posix.relative(cssDir, targets.get('@ui').src);
  if (a.layout !== 'single') {
    return { theme: `${a.scope}/tokens/theme.css`, contract: `${a.scope}/tokens/tailwind.css`, uiSource };
  }
  const tokens = targets.get('@tokens').src;
  return {
    theme: rel(cssDir, `${tokens}/theme.css`),
    contract: rel(cssDir, `${tokens}/tailwind.css`),
    uiSource,
  };
};

const buildDocs = (a, targets, paths, pm, docFiles) => {
  const stack = [
    ['Layout', a.layout], ['Package manager', a.packageManager], ['Frontend', a.frontend], ['Backend', a.backend],
    ['Validation', a.validation], ['UI', a.ui], ['State', a.state.join(', ')], ['ORM', a.orm], ['Auth', a.auth],
  ].filter(([, value]) => value && value !== 'none');
  const layers = ['@web', '@api', '@models', '@core', '@tokens', '@ui', '@i18n', '@config']
    .filter((target) => targets.get(target).active)
    .map((target) => `| ${target.slice(1)} | ${paths[target.slice(1)]} |`);
  return {
    stack: stack.map(([label, value]) => `- ${label}: ${value}`).join('\n'),
    layers: ['| Layer | Path |', '| --- | --- |', ...layers].join('\n'),
    commands: ['dev', 'check', 'test', 'lint', 'build'].map((name) => `- \`${pm.run} ${name}\``).join('\n'),
    conventions: docFiles.map((file) => `- docs/conventions/${file}`).join('\n'),
  };
};

export const buildContext = (answers, targets, versions, docFiles = []) => {
  const a = answers;
  const mono = a.layout !== 'single';
  const pm = PM[a.packageManager];
  const paths = buildPaths(a, targets);
  const nested = {
    project: { name: a.name, scope: a.scope, title: titleCase(a.name) },
    pm: { name: a.packageManager, ...pm, packageManager: `${a.packageManager}@${versions.tooling[a.packageManager]}` },
    node: { version: versions.tooling.node },
    web: { port: '3000' },
    api: { port: a.backend === 'next' ? '3000' : '3001' },
    imports: buildImports(a, mono),
    paths,
    css: buildCss(a, targets, paths),
    next: {
      transpilePackages: JSON.stringify(mono ? LIBS.filter((t) => targets.get(t).active).map((t) => `${a.scope}/${t.slice(1)}`) : []),
    },
    tsconfig: { preset: a.frontend === 'next' ? 'next' : a.frontend === 'vite' ? 'react' : 'node' },
    docs: buildDocs(a, targets, paths, pm, docFiles),
    answers: Object.fromEntries(
      Object.entries(a).filter(([, value]) => typeof value !== 'object' || Array.isArray(value)).map(([key, value]) => [key, String(value)]),
    ),
  };
  nested.api.url = `http://localhost:${nested.api.port}`;
  return flatten(nested);
};

const flatten = (object, prefix = '') =>
  Object.entries(object).reduce((flat, [key, value]) => {
    const path = prefix + key;
    return typeof value === 'object' ? { ...flat, ...flatten(value, `${path}.`) } : { ...flat, [path]: value };
  }, {});

export const render = (text, context, fileLabel) =>
  text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!Object.hasOwn(context, key)) fail(`${fileLabel}: unknown template key "${key}"`);
    return context[key];
  });

const sortObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

const KEY_ORDER = ['name', 'version', 'private', 'type', 'packageManager', 'engines', 'workspaces', 'exports', 'scripts', 'dependencies', 'devDependencies', 'trustedDependencies'];

const orderKeys = (pkg) => Object.fromEntries(KEY_ORDER.filter((key) => pkg[key] !== undefined).map((key) => [key, pkg[key]]));

const missingPackages = (metas, versions) => {
  const names = metas.flatMap((meta) => [meta.deps, meta.devDeps].flatMap((group) => Object.values(group ?? {}).flat()));
  return [...new Set(names)].filter((name) => !versions.packages[name]).sort();
};

const kindOf = (registry, target, context) => render(registry.packages[target].kind, context, `fragments.json packages.${target}.kind`);

export const buildPackages = (answers, targets, registry, metas, versions, context) => {
  const a = answers;
  const mono = a.layout !== 'single';
  const missing = missingPackages(metas, versions);
  if (missing.length > 0) fail(`dependencies missing from versions.json: ${missing.join(', ')}`);

  const pkgTargets = [...targets].filter(([target, info]) => info.active && info.owner === target && (mono || target === '@root')).map(([target]) => target);
  const rootKind = a.frontend !== 'none' ? kindOf(registry, '@web', context) : kindOf(registry, '@api', context);
  const packages = {};
  for (const target of pkgTargets) {
    const isRoot = target === '@root';
    const kind = isRoot ? (mono ? null : rootKind) : kindOf(registry, target, context);
    const scripts = isRoot
      ? { ...(mono ? registry.scripts[a.layout === 'bun' ? 'root-bun' : 'root-turbo'] : registry.scripts[kind]), ...registry.scripts['root-common'] }
      : { ...registry.scripts[kind] };
    const devKinds = isRoot ? [kind, 'root', a.layout === 'turbo' && 'root-turbo'] : [kind];
    packages[target] = {
      name: isRoot ? a.name : `${a.scope}/${registry.packages[target].name}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: Object.fromEntries(Object.entries(scripts).map(([key, value]) => [key, render(value, context, `fragments.json scripts.${key}`)])),
      dependencies: {},
      devDependencies: Object.fromEntries(devKinds.filter(Boolean).flatMap((k) => registry.kindDevDeps[k]).map((name) => [name, versions.packages[name]])),
    };
    if (mono && !isRoot && LIBS.includes(target)) packages[target].exports = { '.': './src/index.ts' };
  }

  const workspace = `workspace:*`;
  for (const [target, info] of targets) {
    if (!info.active || !mono || !packages[info.owner] || target === '@root') continue;
    for (const internal of registry.internalDeps[target] ?? []) {
      if (targets.get(internal).active) packages[info.owner].dependencies[`${a.scope}/${registry.packages[internal].name}`] = workspace;
    }
  }
  if (mono) {
    for (const [target, pkg] of Object.entries(packages)) {
      if (target !== '@config') pkg.devDependencies[`${a.scope}/config`] = workspace;
    }
  }

  const trusted = [];
  for (const meta of metas) {
    for (const group of ['deps', 'devDeps']) {
      for (const [target, names] of Object.entries(meta[group] ?? {})) {
        const owner = targets.get(target)?.owner;
        if (!packages[owner]) continue;
        const field = group === 'deps' ? 'dependencies' : 'devDependencies';
        for (const name of names) packages[owner][field][name] = versions.packages[name];
      }
    }
    for (const [target, scripts] of Object.entries(meta.scripts ?? {})) {
      const owner = targets.get(target)?.owner;
      if (!packages[owner]) continue;
      for (const [key, value] of Object.entries(scripts)) packages[owner].scripts[key] = render(value, context, `fragment scripts.${key}`);
    }
    for (const [target, map] of Object.entries(meta.exports ?? {})) {
      const owner = targets.get(target)?.owner;
      if (packages[owner]) packages[owner].exports = map;
    }
    trusted.push(...(meta.trusted ?? []));
  }

  const root = packages['@root'];
  root.packageManager = context['pm.packageManager'];
  root.engines = { node: '>=22' };
  if (a.layout === 'bun') root.workspaces = ['apps/*', 'packages/*'];
  if (a.packageManager === 'bun') root.trustedDependencies = [...new Set(trusted)].sort();

  const out = {};
  for (const [target, pkg] of Object.entries(packages)) {
    pkg.dependencies = sortObject(pkg.dependencies);
    pkg.devDependencies = sortObject(pkg.devDependencies);
    if (Object.keys(pkg.dependencies).length === 0) delete pkg.dependencies;
    out[posix.join(targets.get(target).root, 'package.json')] = orderKeys(pkg);
  }
  return sortObject(out);
};

export const collectTrusted = (metas) => [...new Set(metas.flatMap((meta) => meta.trusted ?? []))].sort();

export const buildPnpmWorkspace = (answers, trusted) => {
  const lines = answers.layout === 'single' ? [] : ['packages:', '  - "apps/*"', '  - "packages/*"', ''];
  const built = [...new Set([...trusted, 'esbuild'])].sort();
  return [...lines, 'onlyBuiltDependencies:', ...built.map((name) => `  - ${name}`), ''].join('\n');
};

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .sort((x, y) => x.name.localeCompare(y.name))
    .flatMap((item) => {
      if (item.name === '.DS_Store') return [];
      const full = join(dir, item.name);
      return item.isDirectory() ? walk(full) : [full];
    });

const fileEntry = (path, source, context, label) => {
  const mode = statSync(source).mode & 0o777;
  if (!source.endsWith('.tmpl')) return { path, copyFrom: source, mode };
  return { path, content: render(readFileSync(source, 'utf8'), context, label), mode };
};

const collectFragmentFiles = (fragment, templatesDir, targets, context) => {
  const dir = join(templatesDir, fragment.dir);
  if (!existsSync(dir)) fail(`fragment ${fragment.id}: directory not found: ${dir}`);
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || !item.name.startsWith('@')) continue;
    const base = join(dir, item.name);
    for (const source of walk(base)) {
      const relPath = source.slice(base.length + 1).split(/[\\/]/).join('/');
      const path = mapOutputPath(item.name, relPath, targets);
      if (path) files.push(fileEntry(path, source, context, `${fragment.id}/${item.name}/${relPath}`));
    }
  }
  return files;
};

const readFragmentMeta = (fragment, templatesDir) => {
  const file = join(templatesDir, fragment.dir, 'fragment.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const planScaffold = ({ answers: rawAnswers, templatesDir = DEFAULTS.templatesDir, conventionsDir = DEFAULTS.conventionsDir, checkFile = DEFAULTS.checkFile, only = null, date = new Date().toISOString().slice(0, 10) }) => {
  const { answers, notices } = normalizeAnswers(rawAnswers);
  const targets = resolveTargets(answers);
  const registry = readJson(join(templatesDir, 'fragments.json'));
  const versions = readJson(join(templatesDir, 'versions.json'));
  const wants = (id) => !only || only.includes(id);
  const fragments = selectFragments(registry, answers).filter((fragment) => wants(fragment.id));

  const docNames = wants('docs') ? conventionDocs(answers).filter((name) => existsSync(join(conventionsDir, name))) : [];
  if (wants('docs') && docNames.length === 0) notices.push('conventions docs not found: docs/conventions skipped');
  const withCheck = wants('check') && existsSync(checkFile);
  if (wants('check') && !withCheck) notices.push('check.mjs source not found: scripts/check.mjs skipped');

  const context = buildContext(answers, targets, versions, docNames);
  const metas = fragments.map((fragment) => readFragmentMeta(fragment, templatesDir));
  const files = new Map();
  const add = (file) => files.set(file.path, file);
  fragments.forEach((fragment) => collectFragmentFiles(fragment, templatesDir, targets, context).forEach(add));

  const packages = only ? {} : buildPackages(answers, targets, registry, metas, versions, context);
  for (const [path, pkg] of Object.entries(packages)) add({ path, content: json(pkg), mode: 0o644 });
  if (!only && answers.packageManager === 'pnpm') {
    add({ path: 'pnpm-workspace.yaml', content: buildPnpmWorkspace(answers, collectTrusted(metas)), mode: 0o644 });
  }
  docNames.forEach((name) => add({ path: `docs/conventions/${name}`, copyFrom: join(conventionsDir, name), mode: 0o644 }));
  if (withCheck) add({ path: 'scripts/check.mjs', copyFrom: checkFile, mode: 0o755 });
  if (files.has('CLAUDE.md')) add({ path: 'AGENTS.md', symlinkTo: 'CLAUDE.md', mode: 0o644 });
  add({ path: '.dev/config.json', content: json(answers), mode: 0o644 });
  const scaffold = { date, fragments: fragments.map((fragment) => fragment.id), files: [...files.keys(), '.dev/scaffold.json'].sort() };
  add({ path: '.dev/scaffold.json', content: json(scaffold), mode: 0o644 });

  const sorted = [...files.values()].sort((x, y) => x.path.localeCompare(y.path));
  return { files: sorted, packages, notices, recipes: answers.recipes, answers, context };
};

const isEmptyTarget = (dir) => !existsSync(dir) || readdirSync(dir).every((name) => name === '.git');

export const writePlan = (plan, target, overlay) => {
  let written = 0;
  for (const file of plan.files) {
    const full = join(target, file.path);
    if (overlay && existsSync(full)) continue;
    mkdirSync(dirname(full), { recursive: true });
    if (file.symlinkTo) symlinkSync(file.symlinkTo, full);
    else if (file.copyFrom) copyFileSync(file.copyFrom, full);
    else writeFileSync(full, file.content);
    if (!file.symlinkTo) chmodSync(full, file.mode);
    written += 1;
  }
  return written;
};

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: result.status === 0, status: result.status ?? result.error?.code ?? 'unknown', text: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-5).join('\n'), command: [command, ...args].join(' ') };
};

const mustRun = (command, args, cwd) => {
  const result = run(command, args, cwd);
  if (!result.ok) fail(`command failed (exit ${result.status}): ${result.command}\n${result.text}`);
};

const gitRoot = (dir) => {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : null;
};

const postSteps = (answers, target) => {
  if (gitRoot(target) !== realpathSync(target)) mustRun('git', ['init', '-q', '-b', 'main'], target);
  let runner = [answers.packageManager];
  if (answers.packageManager === 'pnpm') {
    if (!run('pnpm', ['install'], target).ok) {
      runner = ['corepack', 'pnpm'];
      mustRun('corepack', ['pnpm', 'install'], target);
    }
  } else {
    mustRun('bun', ['install'], target);
  }
  const prettier = answers.packageManager === 'pnpm' ? [...runner, 'exec', 'prettier'] : ['bunx', 'prettier'];
  mustRun(prettier[0], [...prettier.slice(1), '--write', '.', '--log-level', 'warn'], target);
};

const loadAnswers = (arg) => (existsSync(arg) ? readJson(arg) : JSON.parse(arg));

const parseOnly = (value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : null);

const summary = (plan, target, written, installed) => {
  const { answers } = plan;
  const pending = plan.recipes.filter((recipe) => recipe.status === 'pending').map((recipe) => recipe.id);
  const pmRun = PM[answers.packageManager].run;
  return [
    ...plan.notices.slice(0, 6).map((message) => `notice: ${message}`),
    `target: ${target}`,
    `layout: ${answers.layout} (${answers.packageManager})`,
    `files: ${written}`,
    `recipes pending: ${pending.length > 0 ? pending.join(', ') : 'none'}`,
    installed ? 'install and format: done' : 'install skipped',
    `next: cd ${target} && ${pmRun} check`,
  ];
};

export const main = (argv = process.argv.slice(2)) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      answers: { type: 'string' },
      target: { type: 'string' },
      only: { type: 'string' },
      templates: { type: 'string' },
      'dry-run': { type: 'boolean' },
      overlay: { type: 'boolean' },
      'skip-install': { type: 'boolean' },
    },
  });
  if (!values.answers) fail('missing --answers <file|json>');
  const only = parseOnly(values.only);
  const plan = planScaffold({
    answers: loadAnswers(values.answers),
    templatesDir: values.templates ? resolve(values.templates) : DEFAULTS.templatesDir,
    only,
  });
  if (values['dry-run']) {
    console.log(JSON.stringify({ notices: plan.notices, files: plan.files.map((file) => file.path), packages: plan.packages }, null, 2));
    return;
  }
  if (!values.target) fail('missing --target <dir>');
  const target = resolve(values.target);
  if (!values.overlay && !isEmptyTarget(target)) fail(`target is not empty: ${target}`);
  mkdirSync(target, { recursive: true });
  const written = writePlan(plan, target, values.overlay);
  const install = !values['skip-install'] && !only;
  if (install) postSteps(plan.answers, target);
  console.log(summary(plan, target, written, install).join('\n'));
};

const invokedDirectly = () => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};

if (invokedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(`scaffold: ${error.message}`);
    process.exit(1);
  }
}
