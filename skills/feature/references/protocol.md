# Pipeline protocol

Shared contract for the `feature` orchestrator, `run.mjs`, and every agent.

## Contents
1. Run folder
2. state.json
3. run.mjs commands
4. Findings ledger
5. Report block
6. Tiers and sequences
7. Fix rounds and escalation
8. Resume
9. Learnings
10. Finish and commit

## 1. Run folder

`.dev/runs/<yyyymmdd-hhmm>-<slug>/` (slug: kebab-case, at most 5 words from the request). Reserve folders atomically; on a collision append `-2`, `-3`, etc. Never reuse a run folder.
The active run is the newest unfinished run by `createdAt` (millisecond precision), independent of its slug or collision suffix.

| File | Writer | Content |
|---|---|---|
| `state.json` | `run.mjs` only | Run state (section 2) |
| `task.md` | orchestrator (tier S) | Request, files in scope, acceptance criteria |
| `plan.md` | planner (tiers M, L) | Plan (template in `agents/planner.md`) |
| `findings.md` | gate, tester, qa, senior-reviewer, bug-hunter add; coder marks fixed | Ledger (section 4) |
| `diff.patch` | `run.mjs snapshot` | Change since run start, lockfiles excluded |
| `fix.patch` | `run.mjs snapshot` | Change since the previous snapshot (what the last fix round did); verify mode reads this |
| `gates.log` | `run.mjs check` | Last filtered gate output |
| `summary.md` | orchestrator at finish | ≤40 lines |

`.dev/runs/` is gitignored. `.dev/config.json`, `.dev/learnings.md` are committed. `.dev/map.md` is gitignored (cache).

## 2. state.json

```json
{
  "id": "20261021-1530-notes-list",
  "request": "Add a notes list with create form",
  "tier": "M",
  "profile": "balanced",
  "phase": "plan",
  "round": 0,
  "maxRounds": 3,
  "base": "<sha of run start snapshot>",
  "head": "<sha of latest snapshot>",
  "consults": 0,
  "history": [{ "at": "2026-10-21T15:31:02Z", "agent": "planner", "status": "DONE", "note": "6 tasks, 2 groups" }],
  "createdAt": "2026-10-21T15:30:00Z",
  "updatedAt": "2026-10-21T15:31:02Z"
}
```

`phase`: `plan | code | test | gate | qa | review | hunt | fix | finish | done | aborted`.

## 3. run.mjs commands

Invoked as `node <skill dir>/scripts/run.mjs <cmd>` from the project root. Every command prints at most 20 lines.

| Command | Effect |
|---|---|
| `context` | Config summary (profile, loops), active run (id, tier, phase, round, open blocker/major count), learnings line count, `git status --short` count |
| `init "<request>" [--tier S\|M\|L] [--profile p]` | Create the run folder, `state.json`, empty ledger, base snapshot. Prints the run id and folder |
| `snapshot [--run id]` | Move the old head ref to `refs/dev/<id>/prev`, snapshot the working tree into `refs/dev/<id>/head`, write `diff.patch` (base..head) and `fix.patch` (prev..head), print the diffstat |
| `check [--run id] [--full] [--files a b]` | Run `scripts/check.mjs` (falls back to the plugin copy). On failure add or reopen one `GATE-n` per failing gate; on success mark open GATE findings `verified`. Writes `gates.log` |
| `set key=value ...` | Update `phase`, `tier`, `round`, `maxRounds`, `profile`, `consults` |
| `log <agent> <STATUS> "<note>"` | Append to `history` |
| `findings [--open]` | One line per finding: `ID · severity · status · where` |
| `map` | Write `.dev/map.md` (exported symbols per source file, keyed by HEAD and source paths/content), print its path |
| `finish` | Set `phase: done`, delete `refs/dev/<id>/*`, print scope, task titles, and changed file count for the commit message |
| `abort` | Set `phase: aborted`, delete refs |

Snapshots never touch the user's index: temporary `GIT_INDEX_FILE`, `git add -A`, `write-tree`, `commit-tree`, `update-ref`. Works in a repo with no commits.
Diffs exclude only known package-manager lockfile names and `.dev/`; source names containing `lock` remain visible.

## 4. Findings ledger

```markdown
# Findings

## QA-2 · major · open
where: src/features/notes/components/notes-list.tsx:31
problem: Empty array renders nothing; no empty state.
fix: Render the empty state before mapping.
```

- Header regex: `^## (GATE|TEST|QA|SR|BH)-(\d+) · (blocker|major|minor) · (.+)$`.
- Prefix by source: GATE (run.mjs), TEST (tester), QA (qa), SR (senior-reviewer), BH (bug-hunter). Number = max existing number for that prefix + 1.
- Status: `open` → `fixed: <how, ≤12 words>` (coder) → `verified` or `reopened` (the agent that raised it, in verify mode). `wontfix: <reason>` only by orchestrator ruling. GATE status is managed by `run.mjs check`.
- Agents edit only the header line of entries they own or were assigned. Never delete entries.
- Severity: `blocker` (broken build, data loss, security, crash), `major` (wrong behavior, missing AC, convention violation lint cannot catch with real impact), `minor` (polish). Only open or reopened `blocker`/`major` trigger a fix round. Minors go to the summary.

## 5. Report block

Every agent ends with this block and nothing after it. At most 150 words.

```
STATUS: DONE|BLOCKED|NEEDS_CONSULT|PASS|FAIL|APPROVE|CHANGES_REQUESTED|CLEAN|BUGS_FOUND
SCOPE: T-1,T-3 | QA-2,SR-1
FILES: a.ts, b.tsx (+2 specs)
CHECKS: typecheck PASS · lint PASS · test 14/14
FINDINGS: 0 blocker · 2 major · 1 minor
NOTE: ≤2 lines
QUESTION: only with BLOCKED or NEEDS_CONSULT
```

Subagents never ask the user. They return `BLOCKED` with `QUESTION:`; the orchestrator asks.

### Spawn prompt

The orchestrator's prompt to an agent is only these lines (agents know the rest from their own definition):

```
MODE: plan | task | fix | recipe | test | review | verify | hunt | consult
RUN: .dev/runs/<id>            (absent in recipe and consult mode)
SCOPE: T-1,T-3 | QA-2,SR-1 | recipe:orm-prisma
PARALLEL: yes                  (coder only: other coders are editing; use file-scoped checks)
MODEL_NOTE: last round         (optional)
QUESTION: ...                  (consult mode)
NOTE: one optional line
```

### Gates inside agents

`node scripts/check.mjs` in the project root (generated and adopted projects have it):
- no flags: typecheck, lint, test. `--full`: + build. `--only lint,test`: subset.
- `--files a.ts b.tsx`: eslint on those files + `vitest related --run`; no typecheck. Coders with `PARALLEL: yes` use this; otherwise the full default run.
- `--json`: `{"ok":bool,"gates":[{"name","status":"PASS|FAIL|SKIP","ms","output"}]}` for run.mjs.
- Human output: one line per gate plus at most 30 filtered error lines per failing gate. Exit 1 on any FAIL.
If `scripts/check.mjs` is missing, run the commands listed in the project's CLAUDE.md.

## 6. Tiers and sequences

Triage from the request and CLAUDE.md only. Unsure → M. The planner may recommend a different tier; the orchestrator applies it.

| Tier | When |
|---|---|
| S | ≤3 files, one layer, no contract, schema, or dependency change |
| M | One domain or feature: endpoint + UI, new component set, refactor in one area |
| L | Crosses packages, data model, auth or security, public contracts, or anything risky |

- **S**: `init` → write `task.md` → coder (task mode, writes its own specs) → `check` → qa → fix rounds (max `maxFixLoops.S`) → finish.
- **M**: `init` → `map` → planner → approval if `M` in `planApproval` → coders per group (≤3 in parallel, disjoint files, file-scoped checks) → `check` → tester → `check` → `snapshot` → qa → senior-reviewer → fix rounds (max `maxFixLoops.M`) → `check --full` → finish.
- **L**: as M, but plan approval always, planner may use Explore (≤3), then after senior APPROVE: bug-hunter → if BUGS_FOUND: coder (fix mode, makes BH specs pass; they stay as regression tests) → `check` → `snapshot` → qa (verify) → bug-hunter (verify, reads only the fix diff). Rounds share `maxFixLoops.L`.

Gates always run before qa, senior-reviewer, or bug-hunter. An open GATE finding fails qa immediately.

## 7. Fix rounds and escalation

- A round: fresh coder in fix mode with only the open blocker/major IDs → `check` → `snapshot` → only the agents that raised those IDs re-run in verify mode, reading `fix.patch`. Full senior re-review only if the fix touched contracts in `plan.md`.
- `round` increments per round. On the last allowed round the coder runs with `model: opus`.
- Still open after the last round → ask the user: `2 more rounds` | `Accept with known issues` | `Stop and keep changes`.
- Coder consults: the coder may spawn `architect` (≤2 per task). If it cannot spawn, it returns `NEEDS_CONSULT`; the orchestrator runs `architect` with the question and resumes the coder with SendMessage (or a fresh coder with the answer). Count in `consults`.

## 8. Resume

`/agents:feature --resume [id]`: `run.mjs context` shows the active run; continue at `phase`. Agents are stateless; everything needed is in the run folder.

## 9. Learnings

`.dev/learnings.md`: bullets `- [area] lesson (run id)`. At finish, add up to 3 only if the run had fix rounds or consults. Planner reads it. Over 80 lines → the planner condenses it to the 40 most useful.

## 10. Finish and commit

1. `check --full` (M, L) must pass, or the user accepted known issues.
2. Write `summary.md`: request, tier, rounds, files changed, findings by status, open minors, learnings added.
3. `run.mjs finish`, then propose a Conventional Commit: `type(scope): subject` (≤72 chars), body = task titles.
4. Ask: `Commit` | `Commit on new branch feat/<slug>` | `Leave uncommitted`. Never push.
