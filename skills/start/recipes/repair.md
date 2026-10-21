# Recipe: repair

## Applies when

The scaffold or a recipe left `node scripts/check.mjs` failing in the generated project.

## Steps by layer

1. Run `node scripts/check.mjs` from the project root. Read only the failing gate output.
2. Find the root cause and fix it in the generated files (source, config, package.json) for every affected package.
3. Never weaken lint or TypeScript rules, add `eslint-disable`, `@ts-ignore`, or `any`, or loosen `tsconfig` strictness to get green.
4. Never delete or skip tests. Fix the code, or the test only when the test itself is wrong.
5. Dependency version conflicts: align to the versions already in `package.json`; add missing deps with the package manager (`pnpm add --filter <pkg>` / `bun add --cwd <dir>`), never by hand-editing versions.
6. Re-run `node scripts/check.mjs` until green. Max 2 passes of fix then check; if still red, report BLOCKED with the failing gate and the suspected cause.

## Convention specifics

- Follow `docs/conventions/*.md`: arrow functions, named exports, `type` not `interface`, no enums, kebab-case files, hooks return at most 4 values.
- Respect layer boundaries (`.dev/config.json` and CLAUDE.md); do not move code across layers to silence an import rule.
- Change the smallest surface that fixes the cause.

## Verify

`node scripts/check.mjs --full`

## Done when

- `node scripts/check.mjs --full` exits 0.
- No lint or TypeScript rule was weakened and no test was removed or skipped.
