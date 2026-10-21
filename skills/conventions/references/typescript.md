# TypeScript conventions

Tags: `[lint]` = enforced by the generated ESLint config, `[review]` = enforced by reviewers. Read existing code first and match it.

## Contents

- Compiler and types
- Constants and enums
- Functions and exports
- Files and imports
- Style
- Naming
- Errors
- Immutability and exhaustiveness
- Scope discipline

## Compiler and types

- `strict` and `noUncheckedIndexedAccess` stay on. Never loosen tsconfig to make code pass. Indexed access returns `T | undefined`; narrow it.
- No `any`. Use `unknown` and narrow. `[lint]`
- No `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`. Fix the type. `[lint]`
- No `as` casts except `as const`. Narrow with guards or parse with a schema. `[review]`
- No non-null assertion `!`. Check and throw, or restructure. `[lint]`
- `type`, not `interface`. One construct, composable with unions. `[review]`

```ts
// bad
const note = notes[0]!;
const id = (raw as Note).id;

// good
const note = notes[0];
if (!note) {
  throw new NotFoundError("note");
}
const parsed = noteSchema.parse(raw);
```

## Constants and enums

- No TS `enum`. Use an `as const` array, a derived union, and an `isX` guard. `[lint]`
- Constants are SCREAMING_SNAKE. `[review]`

```ts
export const NOTE_STATUSES = ["draft", "published", "archived"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export const isNoteStatus = (value: unknown): value is NoteStatus =>
  NOTE_STATUSES.some((status) => status === value);
```

## Functions and exports

- Arrow functions only; no `function` declarations. `[lint]`
- Named exports only. Default exports are allowed solely for framework files (Next page/layout/route) and config files. `[lint]`
- Raw `process.env` only inside the env module; everywhere else import the parsed env object. `[lint]`

```ts
// bad
export default function formatTitle(note: Note) { ... }

// good
export const formatTitle = (note: Note): string => note.title.trim();
```

## Files and imports

- kebab-case file names with a type suffix: `.router.ts`, `.controller.ts`, `.service.ts`, `.schema.ts`, `.api-schema.ts`, `.spec.ts`, `.types.ts`. `[lint]` for casing, `[review]` for suffix.
- Inline `type` imports: `import { type Note } from "./note.types"`. `[lint]`
- Five import groups in this order, blank line between groups. `[lint]`
  1. node built-ins (`node:path`)
  2. external packages
  3. internal workspace packages (`@scope/*`)
  4. app alias (`@/`)
  5. relative (`./`, `../`)

```ts
import { readFile } from "node:fs/promises";

import { z } from "zod";

import { type Note } from "@scope/models/note";

import { env } from "@/env";

import { formatTitle } from "./format-title";
```

## Style

- No comments. Name things so the code reads itself; delete commented-out code. `[review]`
- No `console.*`; use the project logger. `[lint]`
- `===` always (`eqeqeq`) and braces on every `if`/`else`/loop (`curly`). `[lint]`
- Throw early, keep the happy path unindented. Reason: flat code is scannable. `[review]`

```ts
// bad
const getNote = async (id: string) => {
  const note = await repo.find(id);
  if (note) {
    return toDto(note);
  }
  throw new NotFoundError("note");
};

// good
const getNote = async (id: string) => {
  const note = await repo.find(id);
  if (!note) {
    throw new NotFoundError("note");
  }
  return toDto(note);
};
```

## Naming

- Functions are verbs (`fetchNotes`, `parseDraft`); variables are nouns (`notes`, `draft`). `[review]`
- Booleans start with `is`, `has`, `can`, `should`. `[review]`
- Banned vague names: `created`, `updated`, `existing`, `data2`, `tmp`, `result`, `obj`. Use the entity name; `current<X>` for the stored state, `raw<X>` for unparsed input. `[review]`

```ts
// bad
const existing = await repo.find(id);
const updated = { ...existing, title };

// good
const currentNote = await repo.find(id);
const renamedNote = { ...currentNote, title };
```

## Errors

- Throw typed errors from the project errors module (`NotFoundError`, `ConflictError`, `ValidationError`). Never `new Error(...)` in domain code. `[review]`
- Do not catch to log and rethrow. Catch only to translate or recover.

## Immutability and exhaustiveness

- Prefer `readonly` properties and `readonly T[]`; update with spreads, not mutation. `[review]`
- Exhaustive `switch` over unions ends with `satisfies never` in `default`, so a new member breaks the build. `[review]`

```ts
export const labelFor = (status: NoteStatus): string => {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "archived":
      return "Archived";
    default:
      return status satisfies never;
  }
};
```

## Scope discipline

- Three similar lines beat a premature helper. Extract only on the third real use with identical intent. `[review]`
- Before adding a dependency, check whether the project already has an equivalent; if not, say so in the report. `[review]`
- Match the surrounding code's patterns before inventing new ones. `[review]`
