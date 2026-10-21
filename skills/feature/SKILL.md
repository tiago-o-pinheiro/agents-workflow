---
name: feature
description: Runs the tiered agent pipeline for a feature or fix - plan (Opus), implement (Sonnet), test, QA, senior review (Opus), bug hunt (Fable) - with on-disk run state and capped fix loops.
argument-hint: "<request> [--tier S|M|L] [--profile quality|balanced|budget] [--resume [id]]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Agent, SendMessage, Bash(node *), Bash(git *)
---

# /dev:feature

Pipeline state: !`node "${CLAUDE_SKILL_DIR}/scripts/run.mjs" context`

`RUN_JS = node "${CLAUDE_SKILL_DIR}/scripts/run.mjs"`. Use it for every pipeline command below. Full contract (run folder, state, ledger, report block, tiers, fix rounds): [references/protocol.md](references/protocol.md).

## Role

You orchestrate. You never read, write, or edit source code. Your context stays small.

- Read only: `RUN_JS` output, `<RUN>/plan.md` (approval and task groups), `<RUN>/summary.md`, `.dev/config.json`, agent report blocks.
- Write only: `<RUN>/task.md` (tier S), `<RUN>/summary.md`, `.dev/learnings.md`.
- Never ask agents for code. Never paste plans, diffs, or findings back to agents: they read the run folder.
- Agents are stateless and never ask the user. A `BLOCKED` report carries a `QUESTION`; you ask.

## Agent names

Spawn `dev:<agent>` (planner, coder, architect, tester, qa, senior-reviewer, bug-hunter). If `dev:<agent>` is not in your agent list, use `<agent>`.

## Arguments

`$ARGUMENTS`: request text, plus optional `--tier S|M|L`, `--profile quality|balanced|budget`, `--resume [id]`.

- No `.dev/config.json` in the project: tell the user `/dev:adopt` gives the best results, then proceed with defaults (`run.mjs` handles them). No `scripts/check.mjs`: `run.mjs check` falls back to its own copy.
- `--resume [id]`: take the active run (or `id`) from the context line, read `RUN_JS findings --open`, and continue at the run's `phase` using the matching sequence below. Do not re-run finished phases.
- Empty request and no `--resume`: ask the user for the request.
- Otherwise start a new run: triage, then `RUN_JS init "<request>" --tier <T> [--profile <p>]`. It prints the run id and folder; `RUN` = `.dev/runs/<id>`.

## Triage

Decide from the request and the project CLAUDE.md only (do not explore code). Unsure: M. `--tier` overrides.

| Tier | When |
|---|---|
| S | 3 files or fewer, one layer, no contract, schema, or dependency change |
| M | One domain or feature: endpoint + UI, new component set, refactor in one area |
| L | Crosses packages, data model, auth or security, public contracts, anything risky |

The planner names a recommended tier in plan.md (`Tier:` line). If it differs, apply it: `RUN_JS set tier=X maxRounds=N` (N from the context loops line: S/M/L).

## Spawning

Use the Agent tool with `subagent_type`. The prompt is exactly these lines and nothing else (omit lines that do not apply):

```
MODE: plan | task | fix | recipe | test | review | verify | hunt | consult
RUN: .dev/runs/<id>
SCOPE: T-1,T-3 | QA-2,SR-1
PARALLEL: yes
MODEL_NOTE: last round
QUESTION: ...
NOTE: one optional line
```

Model by profile. Pass `model` only when the profile's value differs from the agent's default (planner opus, coder sonnet, tester sonnet, qa sonnet, senior-reviewer opus, bug-hunter fable, architect opus).

| Agent | quality | balanced | budget |
|---|---|---|---|
| planner | opus | opus | sonnet |
| coder | sonnet | sonnet | sonnet |
| tester, qa | sonnet | sonnet | haiku |
| senior-reviewer | opus | opus | sonnet |
| bug-hunter | fable | fable | opus |
| architect | opus | opus | opus |

Quality profile coder: same model, add `NOTE: be thorough`.

After every agent returns: `RUN_JS log <agent> <STATUS> "<NOTE, 1 line>"`, then `RUN_JS set phase=<next>`.

## Status handling

- `BLOCKED`: AskUserQuestion with the agent's `QUESTION`, offering its options. Re-run the agent with the answer in `NOTE` (or SendMessage to resume it).
- `NEEDS_CONSULT`: spawn architect (`MODE: consult`, `QUESTION: <coder's question>`, no RUN). SendMessage the answer to the waiting coder; fallback: fresh coder with `NOTE: architect: <answer>`. Then `RUN_JS set consults=<n+1>`.
- `FAIL`, `CHANGES_REQUESTED`, `BUGS_FOUND`: fix round (below).
- `DONE`, `PASS`, `APPROVE`, `CLEAN`: next step.

## Plan approval

Required for tier L always, and for tier M when `.dev/config.json` has `pipeline.planApproval` containing `M`. Read plan.md and show: Goal, acceptance criteria, task titles with groups. AskUserQuestion: `Approve` | `Request changes` | `Cancel`.

- Request changes: ask what to change, re-spawn the planner (`MODE: plan`, `NOTE: <changes>`), show again.
- Cancel: `RUN_JS abort`, stop.

## Coder groups

Read the `### T-n` headers and `group:` lines from plan.md. For each group in ascending order:

1. Spawn up to 3 coders of that group in one message (multiple Agent calls). Each: `MODE: task`, `SCOPE: <its task ids>`, and `PARALLEL: yes` when the group runs more than one coder. More than 3 tasks in a group: batch them into 3 coders by listing several ids per SCOPE; keep each file with one coder.
2. Wait for all reports. Handle statuses.
3. `RUN_JS check`. A failure adds a GATE finding: run a fix round before starting the next group.
4. Next group.

## Sequences

Gates always run before qa, senior-reviewer, or bug-hunter. An open GATE finding fails qa immediately: go to a fix round without spawning qa.

### Tier S

1. `RUN_JS init`. Write `<RUN>/task.md`: the request, acceptance criteria you derive (`AC-n: Given ..., should ...`, 2-5), constraints (project conventions, no new dependencies). Do not guess files; the coder finds them.
2. `RUN_JS set phase=code`; spawn coder (`MODE: task`, `SCOPE: all`, it writes its own specs).
3. `RUN_JS check`; `RUN_JS snapshot`.
4. `set phase=qa`; spawn qa (`MODE: review`).
5. Fix rounds (cap `maxRounds`, normally 2).
6. Finish.

### Tier M

1. `RUN_JS init`; `RUN_JS map`.
2. `set phase=plan`; spawn planner (`MODE: plan`). Apply a recommended tier change. Plan approval if required.
3. `set phase=code`; coders per group; `RUN_JS check` after each group.
4. `set phase=test`; spawn tester (`MODE: test`); `RUN_JS check`.
5. `RUN_JS snapshot`; `set phase=qa`; spawn qa (`MODE: review`).
6. `set phase=review`; spawn senior-reviewer (`MODE: review`).
7. Fix rounds (cap `maxRounds`, normally 3).
8. `RUN_JS check --full`; finish.

### Tier L

Same as M, with plan approval always (the planner may use Explore; nothing for you to do). After senior APPROVE and no open blocker/major:

1. `set phase=hunt`; spawn bug-hunter (`MODE: hunt`).
2. `BUGS_FOUND`: standard fix round (below). The coder makes the BH repro specs pass (they stay as regression tests); the raiser verify is bug-hunter (`MODE: verify`, `SCOPE` BH ids; it reads only `fix.patch`).
3. Hunt rounds share the `maxFixLoops.L` budget with review rounds.
4. `RUN_JS check --full`; finish.

## Fix round

1. `RUN_JS findings --open`. Collect the open or reopened blocker/major ids. None: the phase passes. Minors never trigger a round.
2. Round number n = `round + 1`. If n > `maxRounds`: escalate (below). Else `RUN_JS set round=n phase=fix`.
3. Spawn coder `MODE: fix`, `SCOPE: <ids>`. Split across up to 3 coders (with `PARALLEL: yes`) only when the findings' files are disjoint. On the last allowed round (n == `maxRounds`): `model: opus`, `MODEL_NOTE: last round`.
4. `RUN_JS check`, then `RUN_JS snapshot`.
5. Verify only the raisers, each with `MODE: verify` and `SCOPE` their ids: `TEST` tester, `QA` qa, `SR` senior-reviewer, `BH` bug-hunter. `GATE` ids are handled by `check`. Raisers run in parallel when several. Run a full senior re-review (`MODE: review`) only if the fix touched contracts listed in plan.md.
6. `RUN_JS findings --open` again. Open blocker/major remain: repeat from step 1.

Escalation (cap reached, blocker/major still open): AskUserQuestion `2 more rounds` | `Accept with known issues` | `Stop and keep changes`.

- 2 more rounds: `RUN_JS set maxRounds=<max+2>`, continue.
- Accept: mark them in the summary as known issues, continue to finish.
- Stop: write the summary, `RUN_JS finish`, no commit proposal.

## Finish

1. M and L: `RUN_JS check --full`. It must pass, or the user accepted known issues.
2. Write `<RUN>/summary.md` (40 lines max): request, tier, profile, rounds, consults, files changed, findings by status, open minors, learnings added.
3. Learnings: only if `round` > 0 or `consults` > 0. Append at most 3 bullets to `.dev/learnings.md`, format `- [area] lesson (run id)`. Reusable lessons only, no run-specific detail.
4. `RUN_JS finish`. It prints scope, task titles, and changed file count.
5. Propose a Conventional Commit: `type(scope): subject`. Type from the request (feat, fix, refactor, chore, ...), scope from the finish output, subject at most 72 chars, imperative. Body: the task titles (tier S: the request).
6. AskUserQuestion: `Commit` | `Commit on new branch feat/<slug>` | `Leave uncommitted`. Execute with git (`git add -A`, `git commit`; new branch: `git switch -c feat/<slug>` first). Never push.

## Final message

At most 10 lines: tier, fix rounds, files changed, open minors, commit result (hash and branch, or left uncommitted). No recap of the plan.
