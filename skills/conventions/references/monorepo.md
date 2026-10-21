# Monorepo and layers

## Contents
- Layouts
- Packages
- Dependency direction
- Source-only packages
- Naming and scripts
- Where does X go
- Adding a package
- Single to monorepo
- Turbo basics

## Layouts

Single app: layers are folders under `src/`.

```
src/
  app/ or routes/        thin pages, route handlers
  features/<domain>/     components/, hooks/
  components/            shared UI used by 2+ features
  design-system/{tokens,ui}/
  models/  core/  i18n/
  server/ or modules/    backend (modules/<domain>/{routers,controllers,services,schemas})
  config/                env module
```

pnpm + Turborepo, and Bun workspaces (same shape, different runner):

```
apps/
  web/    api/
packages/
  config/ models/ core/ tokens/ ui/ i18n/
```

A Next backend lives in `apps/web/src/server`; there is no `apps/api` then.

## Packages

| Package | Responsibility |
|---|---|
| `config` | ESLint, Vitest and tsconfig presets. Nothing else. |
| `models` | Shared schemas and inferred types. No I/O. |
| `core` | Platform-agnostic api client and context definitions. No DOM, no React DOM APIs. |
| `tokens` | CSS variables and TS motion tokens. |
| `ui` | Token-based components. No data fetching. |
| `i18n` | Flat dotted-key `en.json` and typed `t()`. |

## Dependency direction

`config` <- `models` <- `core` <- `ui`/`tokens` <- `apps`

- Apps never import each other. [review]
- Libs never import apps. [review]
- Test-only code (fixtures, test utils, testing-library) never in production `dependencies`. [review]
- Reason: one direction keeps builds cacheable and cycles impossible.

## Source-only packages

Internal packages ship source, no build step. `exports` point at `src/*.ts`:

```json
{ "exports": { ".": "./src/index.ts" } }
```

Apps compile them: Next `transpilePackages`, Vite natively, API bundled with tsup `noExternal` for the scope. A new internal package that an app consumes must be added to `transpilePackages` / `noExternal`.

## Naming and scripts

- Names `@scope/<name>`; internal versions `workspace:*`.
- Every package has the same scripts: `typecheck`, `lint`, `lint:fix`, `test`, `test:ci`. Apps add `dev`, `build`, `start`.
- Root scripts run them across packages (`turbo run <task>` or `bun run --filter '*' <task>`), plus `check` (`node scripts/check.mjs`) and `format`.
- Each package declares its own dependencies. The root holds only shared tooling (turbo, prettier, husky, lint-staged, commitlint, eslint).

## Where does X go

| Thing | Location |
|---|---|
| Zod/TypeBox schema shared by web and api | `models` |
| Fetch wrapper, endpoint functions | `core` |
| React context definition (no values) | `core` |
| Context provider with app values | app (bridge component) |
| Design value (color, radius, easing) | `tokens` |
| Button, Input, Dialog | `ui` |
| Component used by one feature | `features/<domain>/components` |
| Hook used by one component | same file, private |
| Env parsing | `config/env.ts` in the app |
| Translations | `i18n` |
| Lint/test/ts presets | `config` |

## Adding a package

1. Create `packages/<name>` with `package.json` (`@scope/<name>`, `private`, `type: module`, `exports` to `src`).
2. Add `tsconfig.json` extending a `config` preset and `vitest.config.ts` if it has tests.
3. Add the standard scripts.
4. Add `@scope/config` as devDependency and consumers as `workspace:*`.
5. Add to `transpilePackages` / `noExternal` if an app consumes it.
6. Run install, then `check`.

## Single to monorepo

Graduate only when one of these is true: a second deployable exists, code is shared between apps, or parts need a separate release cadence. Otherwise stay single; folders already follow the package boundaries, so the move is mechanical (`src/models` becomes `packages/models/src`).

## Turbo basics

- `turbo.json` `tasks`: `build` with `dependsOn: ["^build"]` (build dependencies first) and `outputs` (`.next/**`, `dist/**`).
- `typecheck`, `lint`, `test` have no outputs and run in parallel.
- `dev` is `cache: false`, `persistent: true`.
- Cache keys use inputs and env; declare env vars a task reads in `env`, or caching goes stale.
