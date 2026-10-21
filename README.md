# dev

A Claude Code plugin that scaffolds TypeScript projects and ships features through a tiered, token-conscious agent pipeline. One wizard creates the project with its coding rules built in; one command takes a request from plan to reviewed, gated diff.

## Features

- **Wizard.** `/dev:start` asks a few questions (layout, frontend, backend, validation, ORM, auth, UI) and composes the project deterministically from templates, then hands the rest to recipes.
- **Tiered pipeline.** `/dev:feature` triages every request into S, M or L and runs only as much process as the change deserves.
- **Conventions constitution.** One `conventions` skill and a generated `docs/conventions` folder encode the rules once; lint enforces what it can, reviewers check the rest.
- **Design-system split.** UI primitives live in their own package or folder, apart from feature code.
- **Monorepo or single app.** Turborepo with pnpm, Bun workspaces, or a single app.
- **Token-saving design.** Cheap models for cheap work, state on disk, paths instead of content, capped reports.

## Install

### A. Plugin (recommended)

```
/plugin marketplace add tiago-o-pinheiro/agents-workflow
/plugin install dev@tiago-devkit
```

Update with `/plugin marketplace update tiago-devkit`. Commands are namespaced: `/dev:start`, `/dev:feature`, `/dev:adopt`. The bare form (`/start`) also works while no other skill uses the same name. The plugin adds about 500 tokens to every session; the rest loads only when a command or agent runs.

### B. Script

For machines without access to the plugin marketplace:

```
git clone https://github.com/tiago-o-pinheiro/agents-workflow ~/agents-workflow && ~/agents-workflow/install.sh
```

This symlinks skills and agents into `~/.claude` and gives bare command names: `/start`, `/feature`, `/adopt`. Flags: `--dry-run`, `--force` (backs up conflicts), `--uninstall`. Do not use both A and B, or you get duplicates.

### New machine checklist

- Node 22 or newer
- `corepack enable pnpm`
- Bun (optional, for Bun workspaces)
- Docker (for the database recipes)
- Claude Code

## Usage

### `/dev:start`

```
/dev:start shop turbo next fastify zod
/dev:start blog --defaults
```

Words after the name prefill the wizard. `--defaults` skips the questions.

### `/dev:feature`

```
/dev:feature add a notes list with a create form
/dev:feature add rate limiting to the API --tier L
/dev:feature fix the date formatting in the header --tier S --profile budget
/dev:feature --resume
```

`--tier` overrides triage, `--profile` overrides the configured model profile, `--resume [id]` continues an interrupted run from `.dev/runs/`.

### `/dev:adopt`

Run inside an existing TypeScript repo. It detects the stack, then adds the conventions docs, the gate script and `.dev/config.json` without overwriting anything, so `/dev:feature` works there.

## How the pipeline works

```
S  request -> coder (writes own tests) -> gates -> qa ----------------------> finish
M  request -> map -> planner -> coders (parallel groups) -> gates -> tester
              -> gates -> qa -> senior-reviewer -> full gates ---------------> finish
L  as M, plan approval required, then:
              senior APPROVE -> bug-hunter -> coder (BH specs) -> gates
              -> qa verify -> bug-hunter verify ----------------------------> finish

Fix loop:   open findings -> fresh coder (only those IDs) -> gates -> snapshot
            -> only the agents that raised them re-run in verify mode
Escalation: last round runs the coder on opus; still open -> ask:
            2 more rounds | accept with known issues | stop and keep changes
```

Deterministic gates (typecheck, lint, test, build) always run before any model reviews. The full contract is in [skills/feature/references/protocol.md](skills/feature/references/protocol.md); scaffold and context contracts are in [docs/architecture.md](docs/architecture.md).

### Agents

| Agent | Model | Role |
|---|---|---|
| planner | opus | Writes `plan.md`: acceptance criteria, contracts, tasks |
| coder | sonnet | Implements tasks and fixes with colocated specs |
| architect | opus | Consultant for hard decisions, never edits |
| tester | sonnet | At least one test per acceptance criterion |
| qa | sonnet | Checks the diff against the checklist and criteria |
| senior-reviewer | opus | Design fit, layering, security, data integrity |
| bug-hunter | fable | Adversarial; every finding comes with a failing spec or repro |

### Model profiles

| Agent | quality | balanced (default) | budget |
|---|---|---|---|
| planner | opus | opus | sonnet |
| coder | sonnet (high effort) | sonnet | sonnet |
| tester, qa | sonnet | sonnet | haiku |
| senior-reviewer | opus | opus | sonnet |
| bug-hunter | fable | fable | opus |
| architect | opus | opus | opus |

## What gets generated

Single app:

```
shop/
  src/                  app code by layer
  docs/conventions/     the rules, read on demand
  scripts/check.mjs     gate runner
  .dev/config.json      pipeline config
  CLAUDE.md             under 100 lines, points to docs
```

Monorepo:

```
shop/
  apps/web  apps/api
  packages/{models,ui,config,...}
  docs/conventions/  scripts/check.mjs  .dev/config.json  CLAUDE.md
  turbo.json  pnpm-workspace.yaml
```

## Token-saving design

- Model tiering: Opus plans and reviews design, Sonnet writes code, Haiku is available for budget runs.
- State on disk: run state lives in `.dev/runs/`, so `--resume` survives `/clear`.
- Paths, not content: agents pass file paths to each other.
- Reports are capped at 150 words.
- Gates run before any LLM review, with filtered output.
- Reviewers read only the diff, and fix rounds only the fix diff.
- The hooks rule is enforced by a custom lint rule, so no review tokens are spent on it.
- Progressive disclosure: conventions load on demand, and the generated CLAUDE.md points to docs instead of repeating them.

## Cost per tier

| Tier | Typical flow | Tokens | Cost |
|---|---|---|---|
| S | coder, qa | to be measured | to be measured |
| M | planner, coders, tester, qa, senior | to be measured | to be measured |
| L | M plus bug-hunter | to be measured | to be measured |

## Repo layout

```
.claude-plugin/   plugin and marketplace manifests
agents/           the seven agents
skills/start/     wizard, scaffold.mjs, templates, recipes
skills/feature/   orchestrator, run.mjs, check.mjs, protocol
skills/conventions/  the coding constitution (see skills/conventions/SKILL.md)
skills/adopt/     overlay for existing repos
scripts/          validate-repo.mjs
tests/            unit tests and smoke.sh
docs/             architecture.md
install.sh        symlink installer
```

## Development

```
node scripts/validate-repo.mjs     # line budgets, frontmatter, links, emojis
node --test tests/*.test.mjs       # unit tests
bash tests/smoke.sh                # scaffold and build generated projects
claude --plugin-dir .              # try the plugin from a checkout
```

## Credits

- [obra/superpowers](https://github.com/obra/superpowers): fresh implementer per task, capped fix rounds, escalation, rulings ledger.
- [anthropics/claude-code](https://github.com/anthropics/claude-code) `feature-dev`: explorers that return key files, confidence-filtered read-only review.
- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `pr-review-toolkit`: silent-failure and type-design hunters as models for the bug-hunter.
- [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done): model profiles and plan/state files on disk.
- [github/spec-kit](https://github.com/github/spec-kit): the constitution idea, rules encoded once.
- [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin): learnings captured after runs and read by the planner.
- [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files): run state on disk that survives `/clear`.
- [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman): terse inter-agent reports and filtered output.
- [yamadashy/repomix](https://github.com/yamadashy/repomix): compact repo map for the planner.
- [AmanVarshney01/create-better-t-stack](https://github.com/AmanVarshney01/create-better-t-stack): the wizard's option matrix.
- [shadcn-ui/ui](https://github.com/shadcn-ui/ui): monorepo template layout.
- [vercel/turborepo](https://github.com/vercel/turborepo): design-system package layout.

## License

MIT. See [LICENSE](LICENSE).
