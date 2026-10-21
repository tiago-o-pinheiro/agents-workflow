# agents-workflow: authoring guide

This repo is the `dev` Claude Code plugin (and the `tiago-devkit` marketplace). This file guides anyone editing the repo; the plugin does not load it for users.

Contracts live in `docs/architecture.md` (scaffold, fragments, context keys, packages) and `skills/feature/references/protocol.md` (pipeline). Read the relevant one before writing code that touches it.

## Layout

```
.claude-plugin/        plugin.json, marketplace.json
agents/                planner, coder, architect, tester, qa, senior-reviewer, bug-hunter
skills/start/          /dev:start wizard, scaffold.mjs, templates/, recipes/
skills/feature/        /dev:feature orchestrator, run.mjs, check.mjs, protocol.md
skills/conventions/    coding constitution + references/
skills/adopt/          overlay onto existing repos
scripts/               repo tooling (validate-repo.mjs)
tests/                 node:test unit tests, smoke.sh
docs/architecture.md   contracts
```

## Writing rules

- Audience is Claude. Imperative, terse, specific. No filler, no marketing, no emojis.
- Assume the reader is smart: state the rule and the reason in one line, skip the explanation of what TypeScript or React is.
- Line budgets (hard, checked by `scripts/validate-repo.mjs`):

| File | Max lines |
|---|---|
| `skills/*/SKILL.md` | 250 (`conventions`: 160, `adopt`: 100) |
| `skills/*/references/*.md` | 200; files over 100 lines start with a `## Contents` list |
| `skills/start/recipes/*.md` | 150 |
| `agents/*.md` | 140 |

- References are one level deep: SKILL.md links to `references/x.md`; references do not link to other references.
- Frontmatter:
  - Skills: `name`, `description` (third person, what + when, ≤250 chars), optional `argument-hint`, `disable-model-invocation`, `allowed-tools`, `paths`, `effort`. User-only commands (`start`, `feature`, `adopt`) set `disable-model-invocation: true`.
  - `allowed-tools` Bash rules use the space form: `Bash(node *)`, `Bash(git *)`.
  - Agents: `name`, `description` (≤200 chars), `tools`, `model`, `effort`, `maxTurns`, `skills`, `color`. Plugin agents ignore `hooks`, `mcpServers`, `permissionMode`; never use them.
- Agent references inside skills and agents: `dev:<name>`, plus the rule "if `dev:<name>` is not listed, use `<name>`" (install.sh mode has bare names).
- Paths between skills: `${CLAUDE_SKILL_DIR}/../<skill>/...`. Never `${CLAUDE_PLUGIN_ROOT}` (absent in install.sh mode).
- Inter-agent reports follow the report block in `protocol.md` section 5.

## Code rules

- Scripts: Node 22+, ESM `.mjs`, built-ins only, zero dependencies. Small pure functions, early returns. Comments only where a reader would otherwise be misled.
- Templates under `skills/start/templates/` are the showcase of `skills/conventions/`: they must follow every rule there (arrow functions, named exports, `type` not `interface`, no enums, no comments, kebab-case files, hooks ≤4 return values) and pass the generated project's own typecheck, lint, test, and build.
- Template placeholders: `{{dot.path}}` keys listed in `docs/architecture.md` section 5 only.
- New npm dependency in a fragment or recipe: add it to `skills/start/templates/versions.json` (current version from `npm view <pkg> version`, caret range).

## Public repo hygiene

- No employer, client, or product names from private work. No emails, tokens, internal URLs, or business logic.
- `.private-words` (gitignored, one word per line) is grepped by `validate-repo.mjs`. Never commit that file.

## Verify before finishing any change

```
node scripts/validate-repo.mjs
node --test tests/*.test.mjs
claude plugin validate .   (only the two "no version" warnings are expected: versionless = every push is an update)
```

Fragment changes also need `tests/smoke.sh <combo>` green.
