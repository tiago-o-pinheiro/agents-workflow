# Validation conventions

One schema per shape, shared by client and server. Types are derived, never hand-written. Tags: `[lint]` enforced by ESLint, `[review]` enforced by reviewers.

The lib is `.dev/config.json` `validation`: `typebox` (default) or `zod`. Use only the configured one.

## Contents
- Libraries
- Shared models package
- Naming
- Guards
- Api-schemas
- Decode and encode
- Forms, env, formats

## Libraries

TypeBox 1.x (package `typebox`):

```ts
import { Type, type Static } from 'typebox'
import { Value } from 'typebox/value'

export const Note = Type.Object({ id: Type.String(), title: Type.String(), body: Type.String() })
export type Note = Static<typeof Note>
```

Zod 4:

```ts
import { z } from 'zod'

export const Note = z.object({ id: z.string(), title: z.string(), body: z.string() })
export type Note = z.infer<typeof Note>
```

- Value and type share one name. Reason: one import brings both. [review]
- Never hand-write a TS type that duplicates a schema; derive it. [review]
- Use `import type` / inline `type` for type-only imports. [lint]

## Shared models package

- `packages/models` holds every schema used by both client and server. Schemas used by one side only stay local to that side. [review]
- Expose as a namespace so call sites read `Models.Note`:

```ts
// packages/models/src/index.ts
export * as Models from './notes'
```

- Dependency direction: models depends on nothing but the validation lib. [review]

## Naming

| Name | Meaning |
|---|---|
| `Note` | Full entity |
| `NoteLite` | Nested or list reference (id plus display fields) |
| `NoteBundle` | Create or update payload |
| `NoteFilter` | Query or filter input |

- Always singular PascalCase, no `Schema` suffix on values. [review]
- Constants lists (`NOTE_STATUSES`) are `as const` arrays; derive unions from them, no enums. [lint]

## Guards

Build guards from the schema, never from duck-typing.

```ts
export const isNote = (value: unknown): value is Note => Value.Check(Note, value)       // TypeBox
export const isNote = (value: unknown): value is Note => Note.safeParse(value).success   // Zod
```

## Api-schemas

In the backend, `<domain>.api-schema.ts` describes one endpoint per exported object, as a value plus a `typeof` type:

```ts
export const getNotesApiSchema = {
  querystring: Models.NoteFilter,
  response: { 200: Type.Object({ data: Type.Array(Models.NoteLite), meta: Models.PageMeta }) },
}
export type GetNotesApiSchema = typeof getNotesApiSchema
```

- Shape: `{ params?, querystring?, body?, response: { 200: ... } }`; add other status codes under `response` when the body differs. [review]
- Controllers are typed by `Handler<GetNotesApiSchema>`; never type request fields by hand. [review]

## Decode and encode

- Decode every input at the boundary (params, query, body, env, webhook payloads, localStorage reads, third-party responses). No unvalidated data reaches services. [review]
- Encode every output through the response schema so internal fields (password hashes, foreign keys not in the schema) never leak. [review]
- TypeBox: `Value.Decode(Schema, input)` and `Value.Encode(Schema, output)`. Zod: `Schema.parse(input)`; for outputs, `Schema.parse(output)` with the response schema (strips unknown keys).
- Map validation failures to `ValidationError` (422) in the error handler, not per call site. [review]
- Do not use `Value.Cast` or `Value.Default` to silently repair bad input. [review]

## Forms, env, formats

- Forms reuse the shared schemas (`NoteBundle`) for client validation; the server re-validates regardless. [review]
- The env schema lives in `src/config/env.ts` and is parsed once at startup; fail fast with a readable message. Raw `process.env` elsewhere is banned. [lint]
- Register custom formats (email, uuid, date-time) once in the models package entry (TypeBox `Format.Set`; Zod uses built-ins like `z.email()`). Never re-register in apps. [review]
