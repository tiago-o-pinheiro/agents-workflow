# Architecture and contracts

Maintainer document. Not loaded by the plugin. Every writer of scripts, templates, skills or agents in this repo builds against these contracts. Change a contract here first, then the code.

## Contents
1. Components
2. Normalized answers (`.dev/config.json`)
3. Targets and path mapping
4. Fragments
5. Render context keys
6. Package generation
7. Generated files and post steps
8. Recipes
9. Generated project conventions (tooling)
10. Pipeline (see `skills/feature/references/protocol.md`)

## 1. Components

| Path | Role |
|---|---|
| `skills/start/SKILL.md` | `/dev:start` wizard: questions, then `scaffold.mjs`, then recipes via `coder`, then gates |
| `skills/start/scripts/scaffold.mjs` | Deterministic composer: answers + fragments + versions → files, package.json, install |
| `skills/start/templates/` | `fragments.json` registry, `versions.json`, `answers.schema.json`, fragment dirs |
| `skills/start/recipes/*.md` | Integration steps a `coder` agent executes (ORM, auth, shadcn, state libs) |
| `skills/feature/SKILL.md` | `/dev:feature` orchestrator |
| `skills/feature/scripts/run.mjs` | Run state, snapshots, diff, ledger, gates wrapper |
| `skills/feature/scripts/check.mjs` | Gate runner with filtered output; copied into each generated project as `scripts/check.mjs` |
| `skills/conventions/` | The coding constitution; references are copied into generated projects as `docs/conventions/` |
| `skills/adopt/SKILL.md` | Overlay conventions + gates onto an existing repo |
| `agents/*.md` | planner, coder, architect, tester, qa, senior-reviewer, bug-hunter |

All scripts: Node 22+, ESM `.mjs`, built-in modules only, no dependencies. Tests use `node:test`.

## 2. Normalized answers

Schema: `skills/start/templates/answers.schema.json`. scaffold.mjs accepts partial answers and normalizes:

Defaults: `layout: "auto"`, `validation: "typebox"`, `ui: "own"` (when frontend), `state: ["context"]` (when frontend), `orm: "none"`, `auth: "none"`, `extras: ["git-hooks","claude-hooks"]`, `pipeline.profile: "balanced"`, `maxFixLoops: {S:2,M:3,L:4}`, `planApproval: ["L"]`, `scope: "@" + name`.

Rules, applied in order, each auto-correction emits a one-line notice:
1. `frontend: none` and `backend: none` → error.
2. `backend: next` requires `frontend: next` → error otherwise.
3. Deployables = 1 if `backend` is `none` or `next`, or `frontend` is `none`; else 2.
4. `layout: auto` → `single` when deployables = 1, else `turbo`. `layout: single` with 2 deployables → `turbo` (notice).
5. `packageManager`: `bun` layout → `bun`; `turbo` → `pnpm`; `single` → `pnpm` unless the answers say `bun`.
6. `frontend: none` → `ui: none`, `state: []`. Frontend present and `ui: none` → `ui: own`.
7. `auth: authjs` requires `frontend: next` → error otherwise.
8. `auth: better-auth | google-jwt` requires `orm != none` → error with hint.
9. `backend: none` → `orm: none`, `auth: none`.
10. `recipes` derived: `orm-<orm>`, `auth-<auth>`, `ui-shadcn` if `ui: shadcn`, `state-tanstack-query`, `state-zustand` per `state`. Order: orm, auth, ui, state. All `pending`.

## 3. Targets and path mapping

A target is a logical package. Each has `root` (package dir), `src` (source dir), and flags.

Active targets: `@root`, `@config` always; `@web` if frontend; `@api` if backend; `@models` if backend; `@core` if frontend and backend in {fastify,hono,express}; `@tokens`, `@ui` if frontend; `@i18n` if extras has `i18n`.

Monorepo (`turbo`, `bun`):

| Target | root | src | package.json |
|---|---|---|---|
| `@root` | `.` | `src` | root (workspace) |
| `@web` | `apps/web` | `apps/web/src` | yes |
| `@api` (fastify/hono/express) | `apps/api` | `apps/api/src` | yes |
| `@api` (next) | `apps/web` | `apps/web/src/server` | shares `@web` |
| `@models` `@core` `@tokens` `@ui` `@i18n` | `packages/<n>` | `packages/<n>/src` | yes |
| `@config` | `packages/config` | `packages/config/src` | yes |

Single app:

| Target | root | src | package.json |
|---|---|---|---|
| `@root`, `@web` | `.` | `src` | root |
| `@api` (no frontend) | `.` | `src` | root |
| `@api` (next) | `.` | `src/server` | root |
| `@models` `@core` `@i18n` | virtual | `src/<n>` | none |
| `@tokens` `@ui` | virtual | `src/design-system/<n>` | none |
| `@config` | `config` | `config/src` | none (inline) |

Virtual root: files outside `src/` for that target are skipped.

## 4. Fragments

Registry: `skills/start/templates/fragments.json` (`fragments[]` in apply order, each `{id, dir, when}`).

`when`: every key must match. Scalar answer: value in list. Array answer (`state`, `extras`): non-empty intersection. `{}` always matches.

Fragment dir layout: `templates/<dir>/@<target>/<path>` plus optional `templates/<dir>/fragment.json`.

Output path rules:
- `<path>` starting with `src/` → `target.src + rest`; otherwise → `target.root + path`.
- Target inactive → file skipped. Virtual root and non-src path → skipped.
- A segment starting with `_` becomes `.` (`_gitignore` → `.gitignore`, `_github/` → `.github/`). `__x` becomes `_x`.
- `.tmpl` suffix: content rendered, suffix dropped. Other files copied byte for byte.
- Later fragment wins on identical output path.

Rendering: `{{dot.path}}` only, keys from section 5. Unknown key → hard error naming file and key. No conditionals, loops or escapes: variation lives in separate fragments or computed keys.

`fragment.json` (all keys optional):
```json
{
  "deps":     { "@api": ["fastify"] },
  "devDeps":  { "@web": ["@testing-library/react"] },
  "exports":  { "@ui": { ".": "./src/index.ts", "./*": "./src/*/index.ts" } },
  "scripts":  { "@api": { "db:studio": "prisma studio" } },
  "trusted":  ["esbuild"]
}
```
Every package name must exist in `versions.json` (`packages`) → hard error otherwise. Deps for `@api` with next backend, and every dep in single layout, land in the owning package (see 3).

## 5. Render context keys

| Key | Example (monorepo / single) |
|---|---|
| `project.name` `project.scope` `project.title` | `shop`, `@shop`, `Shop` |
| `pm.name` | `pnpm` / `bun` |
| `pm.run` `pm.exec` `pm.install` | `pnpm` / `bun run`; `pnpm exec` / `bunx`; `pnpm install` / `bun install` |
| `pm.packageManager` `pm.lockfile` | `pnpm@10.34.7`; `pnpm-lock.yaml` / `bun.lock` |
| `node.version` | `24` |
| `web.port` `api.port` `api.url` | `3000`, `3001`, `http://localhost:3001` |
| `imports.models` | `@shop/models` / `@/models` |
| `imports.core` | `@shop/core` / `@/core` |
| `imports.tokens` | `@shop/tokens` / `@/design-system/tokens` |
| `imports.ui` | `@shop/ui` / `@/design-system/ui` (deep: `{{imports.ui}}/button`) |
| `imports.i18n` | `@shop/i18n` / `@/i18n` |
| `imports.config` | `@shop/config` / `./config` (root-level files only) |
| `imports.api` | `@/server` for next backend, else empty |
| `imports.apiSrc` | alias root of the API source: `@/server` for next backend, else `@`. Every file under `@api` that imports another API module and is shared with the next backend (backend-common, validation, glue) uses `{{imports.apiSrc}}/...` |
| `paths.web` `paths.api` `paths.apiSrc` `paths.models` `paths.core` `paths.tokens` `paths.ui` `paths.i18n` `paths.config` | actual dirs relative to project root; empty string when inactive |
| `paths.envFile` | `apps/api/src/config/env.ts` / `src/server/config/env.ts`; empty when no backend |
| `paths.webCss` | `apps/web/src/app/globals.css` (next) / `src/styles.css` (vite); empty when no frontend |
| `css.theme` `css.contract` | `@shop/tokens/theme.css`, `@shop/tokens/tailwind.css` / relative from `paths.webCss` dir |
| `css.uiSource` | relative dir from `paths.webCss` dir to ui src (for `@source`) |
| `next.transpilePackages` | JSON array literal of active internal package names; `[]` in single |
| `tsconfig.preset` | `next` / `react` / `node` (single root tsconfig) |
| `docs.stack` `docs.layers` `docs.commands` `docs.conventions` | markdown blocks for CLAUDE.md/README |
| `answers.<key>` | normalized answers; arrays joined with `, ` |

Adding a key: edit scaffold.mjs `buildContext()` and this table in the same change.

## 6. Package generation

Generated in code, never templated.

- Name `{{scope}}/<packages[target].name>`; root package name is `project.name`. `private: true`, `type: "module"`, `version: "0.0.0"`.
- Scripts: `fragments.json.scripts[kind]` rendered, plus fragment `scripts`. Root: `root-turbo` | `root-bun` + `root-common`. Single: deployable kind + `root-common`.
- devDependencies: `fragments.json.kindDevDeps[kind]` + fragment `devDeps`. Root also gets `kindDevDeps.root` (+ `root-turbo` for turbo).
- Internal deps: `fragments.json.internalDeps` filtered to active targets, value `workspace:*`. Every monorepo package except `@config` and the root gets `@config` as devDependency; the root gets it too.
- `exports`: fragment `exports` or default `{ ".": "./src/index.ts" }` for libs. Libs are source-only (no build); apps compile them (`transpilePackages`, Vite, tsup `noExternal`).
- Root: `packageManager`, `engines.node: ">=22"`, `workspaces: ["apps/*","packages/*"]` (bun only), `trustedDependencies` (bun) from fragment `trusted`.
- `pnpm-workspace.yaml` (pnpm only, all layouts): `packages` (monorepo) + `onlyBuiltDependencies` from fragment `trusted`.
- Keys sorted: name, version, private, type, packageManager, engines, workspaces, exports, scripts, dependencies, devDependencies.

## 7. Generated files and post steps

Also generated in code: `AGENTS.md` symlink to `CLAUDE.md`; `docs/conventions/*.md` copied from `skills/conventions/references/` filtered (typescript, testing, git always; hooks, react, design-system if frontend; backend, validation if backend; monorepo if not single); `scripts/check.mjs` copied from `skills/feature/scripts/check.mjs`; `.dev/config.json` (normalized answers); `.dev/scaffold.json` (`{date, fragments[], files[]}`).

Post steps unless `--skip-install`: target must be empty except `.git` (or `--overlay`, which never overwrites); write; `git init -b main` when `git rev-parse --show-toplevel` is not the target; install (`pnpm install`, falling back to `corepack pnpm install`; `bun install`); `<pm exec> prettier --write .`. Output ≤15 lines: target, layout, file count, pending recipes, next command.

CLI: `node scaffold.mjs --answers <file|json> --target <dir> [--dry-run] [--overlay] [--only <fragment ids or groups: base,docs,check,claude-hooks>] [--skip-install]`. `--dry-run` prints the sorted output path list and the generated package.json files as JSON, writes nothing.

## 8. Recipes

`skills/start/recipes/<id>.md`, executed by a fresh `coder` in recipe mode. Sections: `Applies when` · `Steps by layer` (logical targets, resolved via `.dev/config.json` and section 3) · `Convention specifics` · `Verify` (commands) · `Done when`. Recipes add deps with the package manager (`pnpm add --filter <pkg>` / `bun add --cwd <dir>`), never by hand-editing versions.

## 9. Generated project conventions (tooling)

- Config package exports `{ "./*": "./*" }`. Every file that sits at a package root (or the single-app root) imports config by full file path through `{{imports.config}}`: `{{imports.config}}/eslint/index.mjs`, `{{imports.config}}/vitest/index.ts`, `"extends": "{{imports.config}}/tsconfig/next.json"`. This resolves to `@scope/config/...` in a monorepo and `./config/...` in a single app.
- ESLint: one root `eslint.config.mjs` (base fragment) calls `createEslintConfig({ rootDir, scope, frontend, webDir, apiDir, envFile })` with `import.meta.dirname`, `project.scope`, `answers.frontend` and `paths.*`; empty dir strings mean absent, `.` means the project root. Packages run `eslint .`; ESLint 10 resolves the root config by walking up. Type-aware rules (`projectService`, `tsconfigRootDir: rootDir`) apply to `*.ts`/`*.tsx`, so every ts file, including `*.config.ts`, must be inside a package `tsconfig.json` `include` (`["src", "*.config.ts"]`). `*.mjs` is never type-aware. React-hooks rules apply to `*.tsx`, `hooks/**` and `use-*.ts`; Next rules to `webDir`; the raw `process.env` ban to ts files except `envFile` and `*.config.*`; controllers (`<apiDir>/**/controllers/**`) cannot import an ORM. `scripts/check.mjs` is ignored. Import groups: builtin, external, workspace packages (`@scope/*` and, in single layout, `@/{models,core,i18n,design-system}`), `@/` alias, relative; so one template renders correctly in both layouts. Local plugin `dev` provides `dev/hook-shape`.
- Vitest: `{{imports.config}}/vitest/index.ts` exports `createVitestConfig({ root, environment, setupFiles, plugins })`. `root` is required and drives the `@` alias (`<root>/src`). Every package that has tests owns a `vitest.config.ts`. In a single app that is the deployable's config at the root. In a monorepo the root `vitest.config.ts` (layout-workspace) only lists `test.projects`. Tests import from `vitest` explicitly; there are no globals.
- TypeScript 6 (`~6.0`, capped by typescript-eslint): presets `{{imports.config}}/tsconfig/{base,node,react,next}.json`. No `baseUrl`, since TS 6 deprecated it. Set `types` explicitly, since TS 6 defaults it to `[]`. Every package owns its `tsconfig.json`. App tsconfigs add `paths: { "@/*": ["./src/*"] }`.
- Root files of a single app are owned by the deployable fragment, which writes them to its target root: frontend-next or frontend-vite (`@web/...`) and backend-<fw> (`@api/...` for API-only). backend-next never writes package-root files.
- Which fragment writes the per-package files (`tsconfig.json`, `vitest.config.ts`, `tsup.config.ts.tmpl`, `next.config.ts`, `vite.config.ts`, `.env.example`):

| Target | Owning fragment |
|---|---|
| `@models` | validation-* |
| `@core` | core |
| `@tokens`, `@ui` | design-system |
| `@web` | frontend-* |
| `@api` | backend-<fw> |
| `@i18n` | extras-i18n |
| `@config` | config |
| root | base, layout-* |

- Backend type glue (one set per framework and validation lib, in the `backend-<fw>+<lib>` fragment, all under `src/lib/`): `type-provider.ts` exports `applyTypeProvider(app)` (installs compilers, returns the typed instance), `TypedApp` and `Router` (the plugin type every router uses: `export const xRouter: Router = async (app) => { app.get('/', { schema }, controller.handler) }`); `handler.ts` exports `Handler<Schema>`; `codec.ts` exports `decode(schema, input)` (throws `ValidationError`) and `encode(schema, value)`. Controllers, api-schemas and routers stay library-agnostic and live in `backend-<fw>`. Models are read as `Models.X` (`export * as Models from './models'`).
- `isGlobalError` lives in `errors/global-error.ts`. The `@config` package has its own `tsconfig.json` and `vitest.config.ts` (it runs the `hook-shape` spec); in single layout those files sit in `config/` and are not run by the root.
- `layout-single` has no fragment: single-root files belong to the deployable fragments. The unrs-resolver build script is trusted by the config fragment.
- Every generated project must pass `typecheck`, `lint`, `test` and `build` right after scaffold, before any recipe runs.
- TypeBox means the `typebox` package (1.x): `import { Type, type Static } from 'typebox'`, `import { Value } from 'typebox/value'`.

## 10. Pipeline

State, ledger, statuses, escalation: `skills/feature/references/protocol.md`.
