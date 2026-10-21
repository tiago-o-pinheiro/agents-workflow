---
name: start
description: Scaffolds a new TypeScript project (Next.js, Vite React, Node API; single app or monorepo) with layered architecture, a token-based design system, conventions docs and the /dev:feature pipeline config.
argument-hint: "[name] [preset words...] [--defaults]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Agent, Bash(node *), Bash(git *), Bash(pnpm *), Bash(bun *), Bash(ls *), Bash(mkdir *), Bash(corepack *), Bash(docker *), Bash(cd *)
---

# /dev:start

Scaffold a project from a short wizard, verify it, then let coders apply the recipes. You orchestrate; you never write project files.

## Preflight

- node: !`node -v`
- pnpm: !`pnpm -v 2>/dev/null || echo missing`
- bun: !`bun -v 2>/dev/null || echo missing`
- git root: !`git rev-parse --show-toplevel 2>/dev/null || echo none`
- cwd: !`pwd`
- entries: !`ls -A | head -20`

Arguments: `$ARGUMENTS`

## Rules

- Never edit generated files yourself; delegate to `dev:coder`. The only file you edit is `.dev/config.json` (recipe status).
- Keep your context small: do not read generated source. Read only command output, `.dev/config.json` and agent reports.
- Subagents never talk to the user. You relay their questions and answers.
- Agent names: use `dev:<name>`; if `dev:<name>` is not listed, use `<name>`.
- Never push.

## 1. Preflight

1. Node below 22: stop and tell the user to install Node 22+ (nvm, fnm or nodejs.org).
2. Target directory:
   - cwd is empty (only `.git` allowed): target = cwd.
   - Otherwise target = new subfolder `<cwd>/<name>`. Ask for the name if none was given.
3. Keep `pnpm`, `bun`, git root and cwd from the output above for later steps.

## 2. Prefill from arguments

- First token that is not a keyword = project name. Kebab-case it (`^[a-z][a-z0-9-]{1,40}$`).
- Keywords map to answers:

| Keyword | Answer |
|---|---|
| `next`, `vite`, `api` | shape (`next`: fullstack Next.js; `vite`: Vite SPA + Node API; `api`: Node API only) |
| `fastify`, `hono`, `express` | `backend` |
| `typebox`, `zod` | `validation` |
| `single`, `turbo`, `bun` | `layout` |
| `prisma`, `drizzle`, `nodb` | `orm` (`nodb` = none) |
| `shadcn` | `ui: shadcn` |
| `query`, `tanstack` | `state` + `tanstack-query` |
| `zustand` | `state` + `zustand` |
| `better-auth`, `google`, `authjs` | `auth` (`google` = `google-jwt`) |
| `i18n`, `ci` | `extras` += `i18n` / `ci` |
| `quality`, `budget` | `pipeline.profile` |
| `--defaults` | skip every question not answered by keywords; defaults: layout `auto`, validation `typebox`, ui `own`, state `[context]`, orm `none`, auth `none`, extras `[git-hooks, claude-hooks]`, profile `balanced` |

- Ask only what is still unknown.

## 3. Wizard

Use AskUserQuestion: 1 to 4 questions per call, 2 to 4 options each, recommended option first and labelled "(Recommended)". The user can always type Other. Skip a question whose answer is known or not applicable.

**Call 1**
- Shape: Fullstack Next.js (built-in API) | Next.js + separate Node API | Vite SPA + Node API | Node API only. Frontend-only Vite or Next comes via Other.
- Validation: TypeBox | Zod.
- Layout: Auto | Single app | pnpm + Turborepo | Bun workspaces.

**Call 2** (only the applicable questions)
- API framework: Fastify | Hono | Express (separate API only).
- Database: Prisma + Postgres | Drizzle + Postgres | None (if backend).
- UI: Tailwind + own components | Tailwind + shadcn/ui (if frontend).
- Data/state, multiSelect: Context + hooks | TanStack Query | Zustand (if frontend).

**Call 3**
- Auth: None | Better Auth | Google OAuth -> JWT | Auth.js. Ask only if backend and database exist; hide Auth.js unless the frontend is Next.
- Extras, multiSelect: Git hooks (husky, lint-staged, commitlint) | GitHub Actions CI | Claude lint-on-edit hook | i18n.
- Pipeline profile: Balanced | Quality | Budget.

**Mapping to answers keys**

| Choice | Keys |
|---|---|
| Fullstack Next.js | `frontend: next`, `backend: next` |
| Next.js + Node API | `frontend: next`, `backend: <framework>` |
| Vite SPA + Node API | `frontend: vite`, `backend: <framework>` |
| Node API only | `frontend: none`, `backend: <framework>` |
| TypeBox / Zod | `validation: typebox / zod` |
| Auto / Single / Turborepo / Bun | `layout: auto / single / turbo / bun` |
| Prisma / Drizzle / None | `orm: prisma / drizzle / none` |
| Own / shadcn | `ui: own / shadcn` |
| Context / TanStack Query / Zustand | `state: [context, tanstack-query, zustand]` subset |
| Better Auth / Google / Auth.js | `auth: better-auth / google-jwt / authjs` |
| Git hooks / CI / Claude hook / i18n | `extras: [git-hooks, ci, claude-hooks, i18n]` subset |
| Profile | `pipeline.profile: balanced / quality / budget` |

Include `name`. Leave `scope`, `packageManager` and `recipes` to scaffold.mjs. scaffold.mjs applies the auto-corrections and prints a notice for each (Auth.js needs Next, Better Auth and Google need a database, single app with two deployables becomes turbo, no backend drops ORM and auth). Apply the same rules while asking so the user never picks an impossible combination.

**Call 4**: show a compact table of the answers and the derived recipes (`orm-*`, `auth-*`, `ui-shadcn`, `state-*`), then ask: Create | Change answers | Cancel. Change answers: re-ask only what the user names. Cancel: stop.

## 4. Environment

- `pnpm` needed (layout `single` or `turbo` without bun) and missing: ask before running `corepack enable pnpm`. Declined: stop with the manual hint.
- Recipes `orm-*` need Docker for the local Postgres: run `docker info`; on failure warn that migrations and dev DB will not run until Docker starts. Non-blocking.

## 5. Scaffold

```
node "${CLAUDE_SKILL_DIR}/scripts/scaffold.mjs" --answers '<json>' --target "<dir>"
```

Relay its output (15 lines at most). On error, show the message, fix the answers with the user, retry. Never retry into a non-empty target.

## 6. Gate

Run `cd "<dir>" && node scripts/check.mjs --full` (every later command also runs inside the target). On PASS go to step 7.

On FAIL, repair (max 2 attempts): spawn `dev:coder` with exactly:

```
MODE: recipe
SCOPE: recipe:repair
NOTE: recipe=${CLAUDE_SKILL_DIR}/recipes/repair.md
```

Re-run the gate after each attempt. Still failing after 2: report the remaining failures to the user and stop.

## 7. Recipes

Skip this step and step 8 when `.dev/config.json` has no recipes.

1. In the target run `node "${CLAUDE_SKILL_DIR}/../feature/scripts/run.mjs" init "scaffold recipes" --tier S`. It snapshots the clean scaffold as base. Note the printed run folder as `<RUN>`.
2. Read `.dev/config.json` `recipes`. For each `pending` recipe, in order, spawn a fresh `dev:coder`:

```
MODE: recipe
SCOPE: recipe:<id>
NOTE: recipe=${CLAUDE_SKILL_DIR}/recipes/<id>.md
```

3. Handle the report:
   - `DONE`: set the recipe `status` to `done` with Edit. Run `node scripts/check.mjs`.
   - `BLOCKED`: ask the user the `QUESTION` with AskUserQuestion, then resume the coder with SendMessage, or re-spawn with the answer in `NOTE`.
   - `NEEDS_CONSULT`: spawn `dev:architect` with `MODE: consult` and the `QUESTION`; pass its answer back to the coder the same way.
4. Check FAIL: one repair attempt as in step 6 (`SCOPE: recipe:repair`). Still red: set the recipe `failed` with Edit and continue with the next recipe.
5. Coder cannot finish or reports FAIL: set `failed`, continue.

## 8. Recipe review

Only if at least one recipe ran.

1. `run.mjs check --full`, then `run.mjs snapshot` (same `run.mjs` path as step 7).
2. Write `<RUN>/task.md`: one section per recipe that ran, listing its "Done when" bullets as acceptance criteria (AC-1, AC-2, ...). Read the bullets from `${CLAUDE_SKILL_DIR}/recipes/<id>.md`.
3. Spawn `dev:qa`:

```
MODE: review
RUN: <RUN>
```

4. Open blocker or major findings (`run.mjs findings --open`): up to 2 fix rounds. Each round: spawn `dev:coder` with `MODE: fix`, `RUN: <RUN>`, `SCOPE: <open ids>`; then `run.mjs check`, `run.mjs snapshot`, and `dev:qa` with `MODE: verify`, `RUN: <RUN>`.
5. Run `run.mjs finish`. Findings still open after 2 rounds go in the summary.

## 9. Finish

Print a summary:

- Stack: frontend, backend, validation, ORM, auth, UI, state.
- Layout, package manager, packages.
- Recipes with status (done, failed, skipped).
- Gate result.
- Next commands: `cd <dir>`, `<pm> dev`, `/dev:feature <request>`.
- For each `failed` recipe: the one-line cause and how to retry (`/dev:feature` with the recipe goal).

Ask with AskUserQuestion: Commit | Leave uncommitted. On Commit run `git add -A && git commit -m "chore: scaffold <name>"` in the target. Never push.
