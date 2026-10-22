---
name: adopt
description: Adds the conventions docs, gate script and pipeline config to an existing TypeScript repo without overwriting files, so /agents:feature works there.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Bash(node *), Bash(git *), Bash(ls *)
---

# adopt

Overlay the workflow onto the current repo. Never overwrite an existing file. Never touch application code.

## 1. Detect the stack

Read only: root `package.json`, workspace `package.json` files (`apps/*`, `packages/*`), and lockfile names (`ls`). Do not read source files.

| Signal | Value |
|---|---|
| `pnpm-lock.yaml` / `bun.lock` / `bun.lockb` | `packageManager` pnpm / bun (none: ask) |
| `pnpm-workspace.yaml` or `turbo.json` | layout `turbo` |
| `workspaces` in package.json with bun | layout `bun` |
| otherwise | layout `single` |
| deps `next`, `vite` | `frontend` (else `none`) |
| deps `next`, `fastify`, `hono`, `express` | `backend` (else `none`) |
| deps `typebox` or `@sinclair/typebox`, `zod` | `validation` (neither: `typebox`) |
| deps `prisma`/`@prisma/client`, `drizzle-orm` | `orm` (else `none`) |
| `@shadcn` / `components.json`, `tailwindcss` | `ui` `shadcn` (else `own`/`none`) |

Unknown fields: use the safe default from the schema. Neither frontend nor backend detected (library or tooling repo): ask which shape is closest; the answers need at least one. Name: root package.json `name` without scope, kebab-case.

## 2. Confirm

Build the answers JSON per `${CLAUDE_SKILL_DIR}/../start/templates/answers.schema.json` (read it once). Set `pipeline` to `{"profile":"balanced","maxFixLoops":{"S":2,"M":3,"L":4},"planApproval":["L"]}`, `recipes` to `[]`, `auth` to `none` unless obvious.

Show a summary table of detected values. AskUserQuestion: Apply | Change | Cancel. On Change, ask only which fields are wrong, then re-show. On Cancel, stop.

## 3. Scaffold

```
node "${CLAUDE_SKILL_DIR}/../start/scripts/scaffold.mjs" --answers '<json>' --target . --overlay --only docs,check
```

Writes `docs/conventions/`, `scripts/check.mjs`, `.dev/config.json`, `.dev/scaffold.json`. Existing files are skipped. Report which were skipped.

If ESLint is a dependency, ask whether to add the lint-on-edit hook (runs eslint `--fix` on each edited file). If yes, run the same command with `--only claude-hooks`. If `.claude/settings.json` already exists, it is skipped: tell the user to merge by hand.

## 4. CLAUDE.md

- Missing: write one under 100 lines: stack, commands (from package.json scripts), the `docs/conventions` file list, and "Pipeline: `/agents:feature <request>`; state in `.dev/`".
- Present: draft a `## Dev pipeline` section (conventions location, gate command `node scripts/check.mjs`, `/agents:feature` usage, `.dev/config.json`). Show it, AskUserQuestion Append | Skip, then Edit to append. Change nothing else.

Add `.dev/runs/` and `.dev/map.md` to `.gitignore` if absent (append; ask only if the file is unusual).

## 5. Scripts check

`scripts/check.mjs` runs root scripts `typecheck`, `lint`, `test`, and `build`. List the missing ones. Offer sensible additions for the detected stack (for example `typecheck`: `tsc --noEmit`; `lint`: `eslint .`; `test`: `vitest run`; turbo: `turbo run <name>`). Ask first, then Edit package.json. Skip any the user declines.

## 6. Run the gate

```
node scripts/check.mjs
```

Report pass/fail per gate. Failures that already existed are information: do not fix them.

## 7. Final message

At most 8 lines: what was written, what was skipped, gate result, missing scripts if any, and:

`Next: /agents:feature <request>`
