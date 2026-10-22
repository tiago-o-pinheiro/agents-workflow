import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildContext, buildPackages, buildPnpmWorkspace, mapOutputPath, normalizeAnswers, planScaffold,
  render, resolveTargets, selectFragments,
} from '../skills/start/scripts/scaffold.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills/start/scripts/scaffold.mjs');
const REAL = join(ROOT, 'skills/start/templates');
const versions = JSON.parse(readFileSync(join(REAL, 'versions.json'), 'utf8'));
const real = JSON.parse(readFileSync(join(REAL, 'fragments.json'), 'utf8'));

const FIXTURE_FRAGMENTS = [
  { id: 'base', dir: 'base', when: {} },
  { id: 'config', dir: 'config', when: {} },
  { id: 'models', dir: 'models', when: { backend: ['next', 'fastify', 'hono', 'express'] } },
  { id: 'api', dir: 'api', when: { backend: ['next', 'fastify'] } },
  { id: 'i18n', dir: 'i18n', when: { extras: ['i18n'] } },
];
const BINARY = Buffer.from([0, 255, 1, 254, 128, 10, 13]);

const put = (root, file, content) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
};

const makeFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-fixture-'));
  writeFileSync(join(dir, 'fragments.json'), JSON.stringify({ ...real, fragments: FIXTURE_FRAGMENTS }));
  cpSync(join(REAL, 'versions.json'), join(dir, 'versions.json'));
  put(dir, 'base/@root/_gitignore', 'node_modules\n');
  put(dir, 'base/@root/__private.txt', 'x');
  put(dir, 'base/@root/CLAUDE.md.tmpl', '# {{project.title}}\n{{docs.commands}}\n');
  put(dir, 'base/@root/logo.bin', BINARY);
  put(dir, 'base/@root/notes.md', '{{not.rendered}}\n');
  put(dir, 'base/fragment.json', JSON.stringify({ trusted: ['sharp'], scripts: { '@root': { hello: 'echo {{project.name}}' } } }));
  put(dir, 'config/@config/src/index.ts', 'export const config = 1;\n');
  put(dir, 'config/fragment.json', JSON.stringify({ devDeps: { '@config': ['typescript-eslint'] } }));
  put(dir, 'models/@models/src/index.ts', 'export const models = 1;\n');
  put(dir, 'models/@models/README.md', 'models\n');
  put(dir, 'models/fragment.json', JSON.stringify({ deps: { '@models': ['typebox'] }, exports: { '@models': { '.': './src/index.ts', './*': './src/*.ts' } } }));
  put(dir, 'api/@api/src/server.ts.tmpl', 'export const port = {{api.port}};\n');
  put(dir, 'api/fragment.json', JSON.stringify({ deps: { '@api': ['next'] }, devDeps: { '@api': ['supertest'] } }));
  put(dir, 'i18n/@i18n/src/index.ts', 'export const i18n = 1;\n');
  return dir;
};

const norm = (raw) => normalizeAnswers({ name: 'acme', ...raw }).answers;
const FULLSTACK = { frontend: 'vite', backend: 'fastify' };
const NEXT = { frontend: 'next', backend: 'next' };

let templates;
before(() => {
  templates = makeFixture();
});

describe('normalizeAnswers', () => {
  it('applies defaults', () => {
    const { answers, notices } = normalizeAnswers({ name: 'acme', frontend: 'next', backend: 'none' });
    assert.equal(answers.layout, 'single');
    assert.equal(answers.packageManager, 'pnpm');
    assert.equal(answers.validation, 'typebox');
    assert.equal(answers.ui, 'own');
    assert.deepEqual(answers.state, ['context']);
    assert.deepEqual(answers.extras, ['git-hooks', 'claude-hooks']);
    assert.equal(answers.scope, '@acme');
    assert.deepEqual(answers.pipeline, { profile: 'balanced', maxFixLoops: { S: 2, M: 3, L: 4 }, planApproval: ['L'] });
    assert.deepEqual(notices, []);
  });

  it('errors on invalid combinations', () => {
    assert.throws(() => norm({ frontend: 'none', backend: 'none' }), /nothing to scaffold/);
    assert.throws(() => norm({ frontend: 'vite', backend: 'next' }), /backend next requires frontend next/);
    assert.throws(() => norm({ ...FULLSTACK, auth: 'authjs', orm: 'prisma' }), /authjs requires frontend next/);
    assert.throws(() => norm({ ...FULLSTACK, auth: 'better-auth' }), /requires an orm/);
    assert.throws(() => norm({ ...FULLSTACK, auth: 'google-jwt' }), /requires an orm/);
    assert.throws(() => norm({ ...FULLSTACK, orm: 'mongo' }), /invalid orm/);
    assert.throws(() => normalizeAnswers({ name: 'Bad Name', ...FULLSTACK }), /invalid name/);
  });

  it('derives layout and package manager', () => {
    assert.equal(norm(FULLSTACK).layout, 'turbo');
    assert.equal(norm(FULLSTACK).packageManager, 'pnpm');
    assert.equal(norm({ ...FULLSTACK, layout: 'bun' }).packageManager, 'bun');
    assert.equal(norm({ ...NEXT, packageManager: 'bun' }).packageManager, 'bun');
    assert.equal(norm({ frontend: 'none', backend: 'hono' }).layout, 'single');
  });

  it('auto-corrects with notices', () => {
    const forced = normalizeAnswers({ name: 'acme', ...FULLSTACK, layout: 'single' });
    assert.equal(forced.answers.layout, 'turbo');
    assert.match(forced.notices[0], /single.*turbo/);
    const turboBun = normalizeAnswers({ name: 'acme', ...FULLSTACK, packageManager: 'bun' });
    assert.equal(turboBun.answers.packageManager, 'pnpm');
    assert.equal(turboBun.notices.length, 1);
    const noFront = normalizeAnswers({ name: 'acme', frontend: 'none', backend: 'fastify', ui: 'shadcn', state: ['zustand'] });
    assert.equal(noFront.answers.ui, 'none');
    assert.deepEqual(noFront.answers.state, []);
    assert.equal(noFront.notices.length, 1);
    const uiNone = normalizeAnswers({ name: 'acme', ...FULLSTACK, ui: 'none' });
    assert.equal(uiNone.answers.ui, 'own');
    const noBack = normalizeAnswers({ name: 'acme', frontend: 'next', backend: 'none', orm: 'prisma', auth: 'authjs' });
    assert.equal(noBack.answers.orm, 'none');
    assert.equal(noBack.answers.auth, 'none');
    assert.equal(noBack.notices.length, 1);
  });

  it('derives recipes in order and keeps known statuses', () => {
    const raw = { name: 'acme', ...FULLSTACK, orm: 'prisma', auth: 'better-auth', ui: 'shadcn', state: ['zustand', 'tanstack-query'], recipes: [{ id: 'orm-prisma', status: 'done' }] };
    const { answers } = normalizeAnswers(raw);
    assert.deepEqual(answers.recipes, [
      { id: 'orm-prisma', status: 'done' },
      { id: 'auth-better-auth', status: 'pending' },
      { id: 'ui-shadcn', status: 'pending' },
      { id: 'state-tanstack-query', status: 'pending' },
      { id: 'state-zustand', status: 'pending' },
    ]);
  });

  it('is idempotent', () => {
    const first = normalizeAnswers({ name: 'acme', ...FULLSTACK, orm: 'drizzle' });
    const second = normalizeAnswers(first.answers);
    assert.deepEqual(second.answers, first.answers);
    assert.deepEqual(second.notices, []);
  });
});

describe('targets and path mapping', () => {
  it('maps monorepo paths', () => {
    const targets = resolveTargets(norm(FULLSTACK));
    assert.equal(mapOutputPath('@web', 'src/main.tsx', targets), 'apps/web/src/main.tsx');
    assert.equal(mapOutputPath('@api', 'package.tmpl', targets), 'apps/api/package');
    assert.equal(mapOutputPath('@models', 'README.md', targets), 'packages/models/README.md');
    assert.equal(mapOutputPath('@root', '_github/workflows/ci.yml.tmpl', targets), '.github/workflows/ci.yml');
    assert.equal(mapOutputPath('@root', '__x/_gitignore', targets), '_x/.gitignore');
    assert.equal(mapOutputPath('@core', 'src/a.ts', targets), 'packages/core/src/a.ts');
    assert.equal(mapOutputPath('@i18n', 'src/a.ts', targets), null);
  });

  it('maps single layout and virtual targets', () => {
    const targets = resolveTargets(norm({ ...NEXT, extras: ['i18n'] }));
    assert.equal(mapOutputPath('@web', 'src/app/page.tsx', targets), 'src/app/page.tsx');
    assert.equal(mapOutputPath('@root', 'next.config.ts', targets), 'next.config.ts');
    assert.equal(mapOutputPath('@models', 'src/index.ts', targets), 'src/models/index.ts');
    assert.equal(mapOutputPath('@models', 'README.md', targets), null);
    assert.equal(mapOutputPath('@ui', 'src/button/index.ts', targets), 'src/design-system/ui/button/index.ts');
    assert.equal(mapOutputPath('@i18n', 'src/index.ts', targets), 'src/i18n/index.ts');
    assert.equal(mapOutputPath('@config', 'src/index.ts', targets), 'config/src/index.ts');
    assert.equal(mapOutputPath('@config', 'eslint.tmpl', targets), 'config/eslint');
  });

  it('maps next backend into the web app', () => {
    const mono = resolveTargets(norm({ ...NEXT, layout: 'turbo' }));
    assert.equal(mapOutputPath('@api', 'src/route.ts', mono), 'apps/web/src/server/route.ts');
    assert.equal(mono.get('@api').owner, '@web');
    const single = resolveTargets(norm(NEXT));
    assert.equal(mapOutputPath('@api', 'src/route.ts', single), 'src/server/route.ts');
    assert.equal(single.get('@core').active, false);
  });

  it('activates core only with a node api', () => {
    assert.equal(resolveTargets(norm(FULLSTACK)).get('@core').active, true);
    assert.equal(resolveTargets(norm(NEXT)).get('@core').active, false);
    assert.equal(resolveTargets(norm({ frontend: 'next', backend: 'none' })).get('@models').active, false);
  });
});

describe('selectFragments', () => {
  it('matches scalars and arrays', () => {
    const registry = { fragments: [
      { id: 'all', when: {} },
      { id: 'i18n', when: { extras: ['i18n'] } },
      { id: 'ci-or-hooks', when: { extras: ['ci', 'git-hooks'] } },
      { id: 'zod', when: { validation: ['zod'] } },
      { id: 'both', when: { frontend: ['vite'], backend: ['fastify', 'hono'] } },
      { id: 'tq', when: { state: ['tanstack-query'] } },
    ] };
    const ids = (raw) => selectFragments(registry, norm(raw)).map((f) => f.id);
    assert.deepEqual(ids(FULLSTACK), ['all', 'ci-or-hooks', 'both']);
    assert.deepEqual(ids({ ...FULLSTACK, extras: ['i18n', 'ci'], validation: 'zod', state: ['context', 'tanstack-query'] }), ['all', 'i18n', 'ci-or-hooks', 'zod', 'both', 'tq']);
    assert.deepEqual(ids({ ...FULLSTACK, extras: [] }), ['all', 'both']);
  });
});

describe('render', () => {
  it('replaces dot paths', () => {
    assert.equal(render('a {{ x.y }} b {{z}}', { 'x.y': '1', z: '2' }, 'f'), 'a 1 b 2');
  });

  it('throws naming file and key', () => {
    assert.throws(() => render('{{missing.key}}', {}, 'frag/file.tmpl'), /frag\/file\.tmpl.*missing\.key/);
  });
});

describe('buildContext', () => {
  it('computes monorepo and single keys', () => {
    const mono = norm(FULLSTACK);
    const ctx = buildContext(mono, resolveTargets(mono), versions, ['git.md']);
    assert.equal(ctx['project.title'], 'Acme');
    assert.equal(ctx['pm.packageManager'], `pnpm@${versions.tooling.pnpm}`);
    assert.equal(ctx['imports.models'], '@acme/models');
    assert.equal(ctx['css.theme'], '@acme/tokens/theme.css');
    assert.equal(ctx['css.uiSource'], '../../../packages/ui/src');
    assert.equal(ctx['paths.webCss'], 'apps/web/src/styles.css');
    assert.equal(ctx['api.url'], 'http://localhost:3001');
    assert.equal(ctx['next.transpilePackages'], '["@acme/models","@acme/core","@acme/tokens","@acme/ui"]');
    assert.equal(ctx['tsconfig.preset'], 'react');
    assert.equal(ctx['docs.conventions'], '- docs/conventions/git.md');

    const single = norm(NEXT);
    const sctx = buildContext(single, resolveTargets(single), versions);
    assert.equal(sctx['imports.models'], '@/models');
    assert.equal(sctx['imports.api'], '@/server');
    assert.equal(sctx['css.theme'], '../design-system/tokens/theme.css');
    assert.equal(sctx['css.uiSource'], '../design-system/ui');
    assert.equal(sctx['next.transpilePackages'], '[]');
    assert.equal(sctx['paths.envFile'], 'src/server/config/env.ts');
    assert.equal(sctx['paths.core'], '');
    assert.equal(sctx['answers.state'], 'context');
    assert.equal(sctx['docs.commands'].split('\n')[0], '- `pnpm dev`');
  });
});

describe('buildPackages', () => {
  const build = (raw, metas = []) => {
    const a = norm(raw);
    const targets = resolveTargets(a);
    const ctx = buildContext(a, targets, versions);
    return buildPackages(a, targets, real, metas, versions, ctx);
  };

  it('wires workspace deps and config devDeps in a monorepo', () => {
    const pkgs = build(FULLSTACK);
    assert.deepEqual(Object.keys(pkgs), ['apps/api/package.json', 'apps/web/package.json', 'package.json', 'packages/config/package.json', 'packages/core/package.json', 'packages/models/package.json', 'packages/tokens/package.json', 'packages/ui/package.json']);
    const web = pkgs['apps/web/package.json'];
    assert.equal(web.name, '@acme/web');
    assert.equal(web.dependencies['@acme/ui'], 'workspace:*');
    assert.equal(web.dependencies['@acme/core'], 'workspace:*');
    assert.equal(web.dependencies['@acme/i18n'], undefined);
    assert.equal(web.devDependencies['@acme/config'], 'workspace:*');
    assert.equal(pkgs['packages/config/package.json'].devDependencies['@acme/config'], undefined);
    assert.deepEqual(pkgs['packages/ui/package.json'].exports, { '.': './src/index.ts' });
    assert.equal(pkgs['apps/api/package.json'].exports, undefined);
    const root = pkgs['package.json'];
    assert.equal(root.name, 'acme');
    assert.equal(root.devDependencies.turbo, versions.packages.turbo);
    assert.equal(root.devDependencies['@acme/config'], 'workspace:*');
    assert.equal(root.scripts.dev, 'turbo run dev');
    assert.equal(root.scripts.check, 'node scripts/check.mjs');
    assert.deepEqual(root.engines, { node: '>=22' });
  });

  it('orders package.json keys', () => {
    const root = build({ ...FULLSTACK, layout: 'bun' }, [{ trusted: ['sharp'] }])['package.json'];
    assert.deepEqual(Object.keys(root), ['name', 'version', 'private', 'type', 'packageManager', 'engines', 'workspaces', 'scripts', 'devDependencies', 'trustedDependencies']);
    assert.equal(root.packageManager, `bun@${versions.tooling.bun}`);
    assert.deepEqual(root.trustedDependencies, ['sharp']);
    assert.equal(root.devDependencies.turbo, undefined);
    assert.match(root.scripts.dev, /bun run --filter/);
  });

  it('merges everything into the root in single layout', () => {
    const metas = [{ deps: { '@models': ['typebox'], '@api': ['next'] }, devDeps: { '@config': ['typescript-eslint'] }, scripts: { '@api': { 'db:studio': 'prisma studio' } } }];
    const pkgs = build(NEXT, metas);
    assert.deepEqual(Object.keys(pkgs), ['package.json']);
    const root = pkgs['package.json'];
    assert.equal(root.dependencies.typebox, versions.packages.typebox);
    assert.equal(root.dependencies.next, versions.packages.next);
    assert.equal(root.devDependencies['typescript-eslint'], versions.packages['typescript-eslint']);
    assert.equal(root.scripts['db:studio'], 'prisma studio');
    assert.equal(root.scripts.dev, 'next dev --port 3000');
    assert.equal(root.devDependencies.turbo, undefined);
    assert.equal(Object.keys(root.devDependencies).some((k) => k.startsWith('@acme/')), false);
  });

  it('merges next backend deps into the web package', () => {
    const pkgs = build({ ...NEXT, layout: 'turbo' }, [{ deps: { '@api': ['next'] }, exports: { '@models': { '.': './x.ts' } } }]);
    assert.equal(pkgs['apps/web/package.json'].dependencies.next, versions.packages.next);
    assert.equal(pkgs['apps/web/package.json'].dependencies['@acme/models'], 'workspace:*');
    assert.deepEqual(pkgs['packages/models/package.json'].exports, { '.': './x.ts' });
    assert.equal(pkgs['apps/api/package.json'], undefined);
  });

  it('throws listing missing versions', () => {
    assert.throws(() => build(NEXT, [{ deps: { '@web': ['left-pad', 'react'] }, devDeps: { '@web': ['nope-pkg'] } }]), /left-pad, nope-pkg/);
  });

  it('writes pnpm workspace yaml', () => {
    assert.equal(buildPnpmWorkspace(norm(FULLSTACK), ['sharp']), 'packages:\n  - "apps/*"\n  - "packages/*"\n\nonlyBuiltDependencies:\n  - esbuild\n  - sharp\n');
    assert.equal(buildPnpmWorkspace(norm(NEXT), []), 'onlyBuiltDependencies:\n  - esbuild\n');
  });
});

describe('planScaffold', () => {
  const noDocs = { conventionsDir: join(tmpdir(), 'missing-conventions'), checkFile: join(tmpdir(), 'missing-check.mjs') };

  it('plans fragment files, later wins, binary copy, skipped virtual files', () => {
    const plan = planScaffold({ answers: { name: 'acme', ...NEXT }, templatesDir: templates, ...noDocs });
    const paths = plan.files.map((f) => f.path);
    assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b)));
    assert.ok(paths.includes('.gitignore'));
    assert.ok(paths.includes('_private.txt'));
    assert.ok(paths.includes('src/models/index.ts'));
    assert.ok(!paths.includes('models/README.md') && !paths.some((p) => p.endsWith('README.md')));
    assert.ok(paths.includes('src/server/server.ts'));
    const claude = plan.files.find((f) => f.path === 'CLAUDE.md');
    assert.match(claude.content, /^# Acme\n- `pnpm dev`/);
    assert.equal(plan.files.find((f) => f.path === 'notes.md').copyFrom.endsWith('notes.md'), true);
    assert.equal(plan.files.find((f) => f.path === 'src/server/server.ts').content, 'export const port = 3000;\n');
    assert.equal(plan.files.find((f) => f.path === 'AGENTS.md').symlinkTo, 'CLAUDE.md');
    assert.ok(plan.notices.some((n) => /conventions docs not found/.test(n)));
    assert.equal(plan.packages['package.json'].scripts.hello, 'echo acme');
    assert.deepEqual(JSON.parse(plan.files.find((f) => f.path === '.dev/scaffold.json').content).fragments, ['base', 'config', 'models', 'api']);
  });

  it('--only limits fragments and skips packages', () => {
    const plan = planScaffold({ answers: { name: 'acme', ...NEXT }, templatesDir: templates, only: ['base'], ...noDocs });
    const paths = plan.files.map((f) => f.path);
    assert.ok(!paths.includes('package.json') && !paths.includes('pnpm-workspace.yaml'));
    assert.ok(!paths.includes('src/models/index.ts'));
    assert.ok(paths.includes('.dev/config.json'));
  });

  it('throws for a missing fragment dir and unknown template key', () => {
    const dir = makeFixture();
    writeFileSync(join(dir, 'fragments.json'), JSON.stringify({ ...real, fragments: [{ id: 'ghost', dir: 'ghost', when: {} }] }));
    assert.throws(() => planScaffold({ answers: { name: 'acme', ...NEXT }, templatesDir: dir, ...noDocs }), /ghost/);
    writeFileSync(join(dir, 'fragments.json'), JSON.stringify({ ...real, fragments: FIXTURE_FRAGMENTS }));
    put(dir, 'base/@root/bad.txt.tmpl', '{{nope.key}}');
    assert.throws(() => planScaffold({ answers: { name: 'acme', ...NEXT }, templatesDir: dir, ...noDocs }), /bad\.txt\.tmpl.*nope\.key/);
  });
});

describe('cli', () => {
  const cli = (...args) => execFileSync('node', [SCRIPT, '--templates', templates, ...args], { encoding: 'utf8' });
  const sets = [
    { name: 'acme', ...FULLSTACK },
    { name: 'acme', ...NEXT, extras: ['i18n'] },
    { name: 'api-only', frontend: 'none', backend: 'fastify', packageManager: 'bun' },
  ];

  it('dry-run prints json and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dry-'));
    for (const answers of sets) {
      const out = JSON.parse(cli('--answers', JSON.stringify(answers), '--target', dir, '--dry-run'));
      assert.ok(out.files.includes('.dev/config.json'));
      assert.ok(Object.hasOwn(out.packages, 'package.json'));
      assert.deepEqual(out.files, [...out.files].sort((a, b) => a.localeCompare(b)));
    }
    assert.deepEqual(readdirSync(dir), []);
  });

  it('accepts an answers file path', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'scaffold-ans-')), 'a.json');
    writeFileSync(file, JSON.stringify(sets[0]));
    assert.ok(JSON.parse(cli('--answers', file, '--dry-run')).files.length > 0);
  });

  it('full run with --skip-install', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'scaffold-run-')), 'out');
    const out = cli('--answers', JSON.stringify(sets[0]), '--target', dir, '--skip-install');
    assert.ok(out.trim().split('\n').length <= 15);
    const config = JSON.parse(readFileSync(join(dir, '.dev/config.json'), 'utf8'));
    assert.equal(config.layout, 'turbo');
    assert.equal(lstatSync(join(dir, 'AGENTS.md')).isSymbolicLink(), true);
    assert.equal(readlinkSync(join(dir, 'AGENTS.md')), 'CLAUDE.md');
    assert.match(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'), /packages:\n {2}- "apps\/\*"/);
    assert.deepEqual(readFileSync(join(dir, 'logo.bin')), BINARY);
    assert.ok(existsSync(join(dir, 'apps/web/package.json')));
    assert.throws(() => cli('--answers', JSON.stringify(sets[0]), '--target', dir, '--skip-install'), /not empty/);
  });

  it('overlay never overwrites', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-overlay-'));
    writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
    cli('--answers', JSON.stringify(sets[0]), '--target', dir, '--overlay', '--skip-install');
    assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'mine\n');
    assert.ok(existsSync(join(dir, '.dev/config.json')));
  });
});


it('render leaves GitHub Actions expressions untouched', () => {
  const output = render('${{ runner.os }}-{{project.name}}', { 'project.name': 'acme' }, 'ci.yml.tmpl');
  assert.equal(output, '${{ runner.os }}-acme');
});
