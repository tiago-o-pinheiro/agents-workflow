# Git

## Commits

Conventional Commits: `type(scope): subject`.

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`, `style`.
- Scope = package or domain (`feat(api): ...`, `fix(checkout): ...`). Omit when the change spans everything.
- Subject: imperative, lowercase start, no trailing period, at most 72 chars.
- Body (optional) explains why, not what; wrap at 100.
- Breaking change: `!` after scope and a `BREAKING CHANGE:` footer.
- Small focused commits: one logical change each, tests with the code they cover.

```
fix(auth): reject expired refresh tokens

The refresh route accepted tokens past expiry because the check ran
before decoding. Decode first, then compare.
```

## Branches

`type/short-slug`: `feat/cart-totals`, `fix/login-redirect`. Branch from `main`.

## Never commit

- Secrets, `.env*` (except `.env.example`), keys, tokens.
- Generated artifacts: `dist/`, `.next/`, `coverage/`, `node_modules/`, `.turbo/`.
- Unrelated reformatting or drive-by changes.

If a secret was committed, rotate it; removing it from history is not enough.

## Hooks

- husky `pre-commit` runs lint-staged: `eslint --fix` and `prettier --write` on staged files, then related tests.
- husky `commit-msg` runs commitlint (Conventional Commits).
- Never bypass with `--no-verify`. Fix the failure.

## Pull requests

Checklist before opening:

- `check` passes.
- Every acceptance criterion has a test.
- No unrelated changes.
- Screenshots for UI changes.
- Description says what and why; links the issue.

## Safety

- Never force-push shared branches (`main`, release branches). On your own branch use `--force-with-lease`.
- Agents never push, open PRs, or amend published commits unless asked.
- Never rewrite history others have pulled.
- Prefer new commits over amending once reviewed.
