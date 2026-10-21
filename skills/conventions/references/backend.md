# Backend conventions

Architecture is always layered: router -> controller -> service. Never DDD or clean-architecture modules. Tags: `[lint]` enforced by ESLint, `[review]` enforced by reviewers.

## Contents
- Layout and flow
- Router
- Controller
- Service and data access
- Errors
- Env, pagination, auth, logging
- Prisma and Drizzle
- Framework mapping
- Adding an endpoint

## Layout and flow

```
src/modules/notes/
  routers/notes.router.ts
  controllers/notes.controller.ts
  services/notes.service.ts
  schemas/notes.api-schema.ts
src/errors/  src/config/env.ts  src/lib/handler.ts
```

- Suffix every file `<domain>.<layer>.ts`, kebab-case. [lint]
- Flow is router -> controller -> service. Never skip a layer or call upward. [review]
- Next.js built-in backend: same layout under `src/server/modules/`.
- Module singletons, no DI container: `export const notesService = new NotesService()`. Reason: simple, greppable, testable through HTTP. [review]

## Router

- Wire only: route, schema, auth guard, controller method. No logic. [review]
- Mount each router with a prefix (`/notes`). [review]

```ts
export const notesRouter = (app: FastifyInstance) => {
  app.get('/', { schema: getNotesApiSchema, preHandler: authGuard }, notesController.getNotes)
}
```

## Controller

- Class with `private readonly` service dependencies and arrow-function handlers typed by the api-schema. Reason: arrows keep `this` bound when passed to the router. [review]
- `Handler<GetNotesApiSchema>` comes from `src/lib/handler.ts`, one glue file per framework. Do not redefine it.
- Transport only: decode input, call service, encode output, set status. No business rules, no ORM calls. [review]

```ts
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  getNotes: Handler<GetNotesApiSchema> = async (request, reply) => {
    const filter = Value.Decode(NoteFilter, request.query)
    const page = await this.notesService.listNotes(request.user.id, filter)
    return reply.status(200).send(page)
  }
}

export const notesController = new NotesController(notesService)
```

## Service and data access

- Services own business rules and data access. Controllers never touch the ORM. [review]
- Extract `<domain>.repository.ts` only when queries grow complex; the service stays the only caller. [review]
- Authorization lives in services: check resource ownership, throw `ForbiddenError`. Reason: every entry point (HTTP, jobs, actions) gets the check. [review]
- Multi-write operations run in a transaction. [review]
- Throw early, keep the happy path unindented.

```ts
getNote = async (userId: string, id: string) => {
  const note = await db.note.findUnique({ where: { id }, select: noteSelect })
  if (!note) throw new NotFoundError('Note not found')
  if (note.authorId !== userId) throw new ForbiddenError('Not your note')
  return note
}
```

## Errors

In `src/errors/`: `GlobalError(message, statusCode, details?)` base class, plus `NotFoundError` 404, `ConflictError` 409, `ValidationError` 422, `ForbiddenError` 403, `UnauthorizedError` 401.

- Throw these from services; never build error responses by hand. [review]
- One error handler per app maps them to `{ statusCode, error, message, details }`.
- Unknown errors become 500 with a generic message; log the original, never leak stack or internals. [review]
- Schema decode failures map to `ValidationError` (422).

## Env, pagination, auth, logging

- `src/config/env.ts` validates env at startup with the project's schema lib and exports a typed object. It is the only reader of `process.env`. [lint]
- Pagination helper: input `page`, `pageSize` from query -> `{ take, skip }`; output `{ data, meta: { total, page, pageSize } }`. Cap `pageSize`. Never return unbounded lists. [review]
- Auth guard is framework middleware or preHandler. It verifies the credential and sets the user on the request context. Routers attach it; controllers read `request.user`. [review]
- Log with the framework logger (`request.log`, `app.log`, hono/pino logger). Never `console`. [lint]
- Never log secrets, tokens, or full request bodies. [review]

## Prisma and Drizzle

Prisma:
- Singleton client in `src/lib/db.ts` (reuse across hot reloads in dev). [review]
- Multi-file schema: `prisma/schema/<model>.prisma` plus a `base.prisma` for datasource and generator.
- Always set `select` or `include` explicitly; never return raw models (leaks internal fields). [review]
- Avoid N+1: batch with `include`, `in` filters, or one query per relation level. [review]
- `@@index` on every field used in `where` or `orderBy` lookups. [review]
- `prisma.$transaction` for multi-writes. [review]

Drizzle: one schema file per domain (`src/db/schema/notes.ts`), same rules: explicit column selection, indexes on lookup fields, `db.transaction` for multi-writes.

Dev preflight: a script (`scripts/dev-preflight.mjs`) runs before `dev`. It starts the docker database (`docker compose up -d --wait`) and applies migrations. Never require manual DB setup. [review]

## Framework mapping

The layering is identical; only wiring differs.

- Fastify: each router is a plugin registered with `{ prefix }`; use the TypeBox type provider so `request.query` is typed from the api-schema.
- Hono: one `Hono` router per module mounted with `app.route('/notes', notesRouter)`; validator middleware runs the api-schema before the handler.
- Express (separate API app): `Router()` per module mounted with `app.use('/notes', router)`; a `validate(schema)` middleware decodes input; async errors reach the central error middleware (Express 5 forwards rejections).
- Next.js built-in: `src/app/api/notes/route.ts` exports `GET`/`POST` that delegate to `notesController` in `src/server/modules/notes/`. Route files are thin. Server actions call services directly (decode input first). Never import `src/server` from client components. [review]

## Adding an endpoint

1. Models: add or extend the shared schema (`Note`, `NoteBundle`, `NoteFilter`) and the DB model.
2. Api-schema: `<domain>.api-schema.ts` with params, querystring, body, response.
3. Service method with rules, authorization, data access.
4. Controller handler typed by the api-schema.
5. Router entry with schema and auth guard.
6. Spec: HTTP-level test covering success, validation failure, and authorization failure.
