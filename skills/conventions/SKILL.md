---
name: conventions
description: TypeScript, React, hooks, layered backend, validation, design-system, monorepo, testing and git conventions. Use when writing, reviewing, or planning .ts or .tsx code.
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Conventions

## Precedence

If the project has `docs/conventions/*.md` or a `CLAUDE.md`, those override this skill. Otherwise this skill applies. Read existing code and match it before applying anything here.

Tags: `[lint]` is enforced by the generated ESLint config (fails `check`). `[review]` is not machine-checked; qa and senior-reviewer verify it.

## Core checklist

TypeScript
1. Strict mode plus `noUncheckedIndexedAccess`; no `any`, no `!`, no `@ts-ignore`/`@ts-expect-error` directives. [lint]
2. No `as` casts; narrow with guards or decode with the schema. [review]
3. `type`, not `interface`; no enums, use `as const` arrays with derived unions. [lint for enums, review for interface]
4. Arrow functions only; no function declarations. [lint]
5. Named exports; default exports only where the framework requires them (Next pages, layouts, route files). [lint]
6. `import type` for type-only imports; imports in the 5-group order. [lint]
7. kebab-case filenames with a type suffix (`.router.ts`, `.service.ts`, `.schema.ts`, `.spec.ts`). [lint]
8. No `console`, no `==`, braces on every block. [lint]
9. No comments that restate code; throw early, keep the happy path unindented. [review]
10. Names: functions are verbs, variables are nouns, booleans `is/has/can/should`; SCREAMING_SNAKE constants; no vague names (`created`, `existing`). [review]
11. Three similar lines beat a premature helper; no new dependency without checking first. [review]

Hooks
12. A hook returns at most 4 values; over that, split it or delete it. [lint]
13. Hooks are free: calling the same hook from two components is not duplication and never justifies wrapping it. [review]
14. Never write a hook whose body is other hook calls re-exported; call them directly where the values are used. [lint]
15. One responsibility per hook (fetching, UI state, submission are separate); a hook used by one component stays private in its file. [review]
16. `react-hooks` rules: dependencies exhaustive, hooks at top level. [lint]

React
17. Routes and pages are thin; logic lives in `features/<domain>/{components,hooks}`. [review]
18. Context = provider (value in `useMemo`) plus a consumer hook that throws outside the provider. [review]
19. Handle loading (skeleton), empty, error and disabled states. `handleX` internal, `onX` props, props type `XProps`. [review]

Backend and validation
20. Layers only: router, controller, service, ORM; no ORM calls in controllers. [review]
21. Decode inputs and encode outputs with the schema; schema exported as value plus `typeof` type. [review]
22. Throw `GlobalError` subclasses; one error handler maps them to the response shape. [review]
23. Read env through the typed env module only; no raw `process.env` elsewhere. [lint]

Design, testing, git
24. Tokens only: no hex, no px, no arbitrary Tailwind values; ui components use token utilities. [review]
25. One primary action per screen; 44px touch targets; WCAG AA; feedback on every interaction. [review]
26. Specs colocated, `it('Given X, should Y')`; query by role, label, testId, then text; `userEvent`, never `fireEvent`; do not `vi.mock` your own modules. [review]
27. Every acceptance criterion has a test; backend tests go through the real HTTP flow. [review]
28. Conventional Commits `type(scope): subject`; never commit secrets or generated files; never push unless asked. [review]

## Layer map

Frontend: route/page, then feature component, then feature hook, then core/api client.

```
app|routes  ->  features/<domain>/components  ->  features/<domain>/hooks  ->  core (api client)
```

Backend: router, then controller, then service, then ORM.

```
router (mount + prefix)  ->  controller (decode/encode)  ->  service (rules)  ->  ORM
```

Package direction (monorepo or folders in single layout):

```
config <- models <- core <- ui / tokens <- apps
```

Apps never import each other; libs never import apps; test-only code never in production dependencies.

## Load this reference when

Load only what the task needs (token budget). Paths are relative to this file; in a generated project the same files are in `docs/conventions/`.

| Reference | Load when |
|---|---|
| [references/typescript.md](references/typescript.md) | Writing or reviewing any TypeScript: types, naming, imports, file layout |
| [references/hooks.md](references/hooks.md) | Writing, splitting, or reviewing a React hook |
| [references/react.md](references/react.md) | Components, context, props, page and feature structure, UI states |
| [references/backend.md](references/backend.md) | Routers, controllers, services, errors, env, ORM, pagination |
| [references/validation.md](references/validation.md) | Schemas, decode/encode, shared models, request and response types |
| [references/design-system.md](references/design-system.md) | Tokens, Tailwind contract, ui components, visual and motion rules |
| [references/monorepo.md](references/monorepo.md) | Placing code, adding a package, dependency direction, scripts |
| [references/testing.md](references/testing.md) | Writing or reviewing tests, mocks, test data, backend HTTP tests |
| [references/git.md](references/git.md) | Commits, branches, hooks, pull requests |
