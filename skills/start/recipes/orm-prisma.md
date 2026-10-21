# Recipe: orm-prisma

## Applies when

`.dev/config.json` has `orm: "prisma"` and a `backend`. Adds a Docker Postgres 17 dev database, Prisma 7, and a `notes` CRUD domain with real-database specs.

## Steps by layer

Resolve from `.dev/config.json`: `<api>` = API package root (`apps/api` | `apps/web` | `.`), `<src>` = API source (`apps/api/src` | `apps/web/src/server` | `src` | `src/server`), `<models>` = models source (`packages/models/src` | `src/models`). Import API modules and `Models` the way the sibling `health` files do. Run package commands in `<api>`.

1. Deps (pnpm `pnpm add --filter <scope>/api`, single `pnpm add`, bun `bun add --cwd <api>`; `-D` for dev). Pin Prisma to major 7 (`latest` is v8 rc): `@prisma/client@^7 @prisma/adapter-pg@^7 pg`; dev: `prisma@^7 @types/pg @electric-sql/pglite @electric-sql/pglite-socket`. Trust the engines: pnpm adds `'@prisma/engines'` and `prisma` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`, then `pnpm rebuild`; bun adds them to root `trustedDependencies`.
2. Docker. Root `docker-compose.yml`: service `postgres`, image `postgres:17-alpine`, ports `'${DB_PORT:-5432}:5432'`, env `POSTGRES_USER/PASSWORD=postgres`, `POSTGRES_DB=app`, volume `postgres-data:/var/lib/postgresql/data` (declared under `volumes:`), healthcheck `pg_isready -U postgres -d app` (interval 2s, timeout 3s, retries 20).
3. Env. Append `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app` to `<api>/.env.example` and copy to `<api>/.env` when missing. In the env module add `DATABASE_URL` (non-empty string, default that URL) plus an env spec case that keeps a provided value.
4. Preflight `scripts/dev-preflight.mjs` (root, zero-dep, braces on every `if`). It resolves `DATABASE_URL` (process env, then `<cwd>/.env`, then the default), derives `DB_PORT` from its port, and for local hosts requires `docker info` then runs `docker compose up -d --wait` in the repo root; then runs the rest of argv (the migrate command) in cwd. Exit 1 with a one-line reason on any failure.
```js
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_URL = 'postgresql://postgres:postgres@localhost:5432/app'
const LOCAL = ['localhost', '127.0.0.1', '[::1]']
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (msg) => { process.stderr.write(`dev-preflight: ${msg}\n`); process.exit(1) }
const fromDotenv = (file) => {
  if (!existsSync(file)) { return undefined }
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  return line?.slice(13).replace(/^["']|["']$/g, '')
}
const run = (cmd, args, env, cwd) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, cwd })
  if (r.error || r.status !== 0) { fail(`"${[cmd, ...args].join(' ')}" failed`) }
}
const databaseUrl = process.env.DATABASE_URL ?? fromDotenv(join(process.cwd(), '.env')) ?? DEFAULT_URL
const url = new URL(databaseUrl)
const env = { ...process.env, DATABASE_URL: databaseUrl, DB_PORT: url.port || '5432' }
if (LOCAL.includes(url.hostname)) {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) { fail('Docker is not running. Start Docker and retry.') }
  run('docker', ['compose', 'up', '-d', '--wait'], env, rootDir)
}
const [cmd, ...args] = process.argv.slice(2)
if (cmd) { run(cmd, args, env, process.cwd()) }
```
5. Scripts in `<api>/package.json`: `dev` = `node <rel>/scripts/dev-preflight.mjs <pm> run db:migrate && <existing dev command>` (`<rel>` = path from `<api>` to the repo root: `../..` for `apps/*`, `.` for single; `<pm> run` = `pnpm run` | `bun run`), `db:generate` = `prisma generate`, `db:migrate` = `prisma migrate deploy`, `db:migrate:dev` = `prisma migrate dev`, `db:studio` = `prisma studio`, `postinstall` and `prebuild` = `prisma generate`.
6. Prisma files in `<api>`. `prisma/schema/base.prisma`: `generator client { provider = "prisma-client", output = "../../<src relative to <api>>/generated/prisma" }` (e.g. `../../src/generated/prisma`) and `datasource db { provider = "postgresql" }` (no url). `prisma/schema/note.prisma`: `model Note` with `id String @id @default(uuid()) @db.Uuid`, `title String`, `body String @default("")`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `@@index([createdAt])`, `@@map("notes")`. `prisma.config.ts`: load `.env` when present (`process.loadEnvFile` guarded by `existsSync`; Prisma 7 does not read `.env` itself), then export `defineConfig({ schema: 'prisma/schema', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL ?? DEFAULT_URL } })` with `DEFAULT_URL` = the dev URL from step 3. Not `env('DATABASE_URL')`: it throws when the variable is unset, and `prebuild` runs `prisma generate`, so CI builds without a `.env` would fail. Config files are exempt from the raw `process.env` ban.
7. Ignore generated code: `<src>/generated` in `.gitignore` and `.prettierignore`; in root `eslint.config.mjs` export `[...createEslintConfig({...}), { ignores: ['**/generated/**'] }]`. Make sure `prisma.config.ts` is in the package `tsconfig` `include` (`*.config.ts`).
8. Start the database (`docker compose up -d --wait`, use `DB_PORT=<port>` when 5432 is busy and match `DATABASE_URL`), then `<pm> run db:migrate:dev --name init` in `<api>`. `prisma/migrations` stays tracked in git.
9. `<src>/lib/db.ts`: `export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) })` (`PrismaClient` from `<src>/generated/prisma/client`).
10. Models (`<models>/note.model.ts`, export from `models.ts`, project validation lib): `Note` {uuid id, title 1-200, body max 10000, createdAt/updatedAt date-time strings}, `NoteLite` (id, title, createdAt), `NoteBundle` {title, body default ''}, `NoteFilter` = `PaginationQuery` + optional `search`, plus `isNote`.
11. `notes` module under `<src>/modules/notes/`, mirroring `health` siblings: `schemas/notes.api-schema.ts` (list: querystring `NoteFilter`, response `PaginationResult(NoteLite)`; get/create/update/delete with `params` = `Note` id, body `NoteBundle`, 200/201/200/204), `controllers/notes.controller.ts` (class, arrow handlers, `encode(<schema>.response[status], value)`, no ORM import), `routers/notes.router.ts` (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`), mounted in `app.ts` with prefix `/notes`.
12. `services/notes.service.ts` (the only ORM user): explicit `select`, `NotFoundError` when missing, dates to ISO strings, list pagination through `toPagination` / `toPaginationMeta` with `findMany` + `count` and `search` as `title: { contains, mode: 'insensitive' }`, ordered by `createdAt desc`.
```ts
listNotes = async (filter: Models.NoteFilter) => {
  const where: Prisma.NoteWhereInput = filter.search ? { title: { contains: filter.search, mode: 'insensitive' } } : {}
  const [rows, total] = await Promise.all([
    db.note.findMany({ where, select: noteLiteSelect, orderBy: { createdAt: 'desc' }, ...toPagination(filter) }),
    db.note.count({ where }),
  ])
  return { data: rows.map(toNoteLite), meta: toPaginationMeta(total, filter) }
}
getNote = async (id: string): Promise<Models.Note> => {
  const row = await db.note.findUnique({ where: { id }, select: noteSelect })
  if (!row) { throw new NotFoundError('Note not found') }
  return toNote(row)
}
```
13. Tests run on PGlite served over its socket, so the real `db.ts` and driver are exercised. Create `<src>/test/setup-db.ts` and register it with `setupFiles: ['./src/test/setup-db.ts']` in the package `vitest.config.ts` (path relative to `<api>`):
```ts
const MIGRATIONS = join(import.meta.dirname, '<rel to <api>>', 'prisma', 'migrations')
const pglite = await PGlite.create()
for (const dir of readdirSync(MIGRATIONS).sort()) {
  const file = join(MIGRATIONS, dir, 'migration.sql')
  if (existsSync(file)) { await pglite.exec(readFileSync(file, 'utf8')) }
}
const server = new PGLiteSocketServer({ db: pglite, host: '127.0.0.1', port: 0, maxConnections: 10 })
await server.start()
vi.stubEnv('DATABASE_URL', `postgresql://postgres:postgres@${server.getServerConn()}/postgres`)
beforeEach(async () => {
  const { rows } = await pglite.query<{ name: string }>(
    `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'`,
  )
  if (rows.length > 0) { await pglite.exec(`TRUNCATE ${rows.map((row) => row.name).join(', ')} CASCADE`) }
})
afterAll(async () => {
  const { db } = await import('<alias>/lib/db')
  await db.$disconnect()
  await server.stop()
  await pglite.close()
})
```
14. Specs: `notes.service.spec.ts` (round trip, NotFound on get/delete, pagination totals) and `notes.router.spec.ts` (create 201, empty title 422, list page and `search`, get 200/404, malformed id 422, update 200/404, delete 204 then 404) through the framework test call. Names `Given ..., should ...`, placeholders `'::title::'`, no mocks.

## Convention specifics

- Layering: ORM only in the service and `db.ts`; the lint rule blocks ORM imports in controllers. Never return raw models; map selected rows to `Models.*`.
- Backend differences: Fastify/Hono/Express differ only in the router file, `Handler`/validator glue (copy `health`) and the test call (`app.inject` | `app.request` | `supertest(app)`). Next: `src/app/api/notes/**/route.ts` stays thin and delegates to the controller; specs import the route handlers and call them with `new Request(...)`.
- No `as`, `any`, `!`, comments, enums, default exports; arrow functions; files `notes.<layer>.ts`.
- Multi-write operations use `db.$transaction`.

## Verify

1. `docker compose up -d --wait` (with `DB_PORT` if needed) and `<pm> run db:migrate` in `<api>`.
2. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
3. Start the API (`PORT=<free port> <pm> run dev` in `<api>`), then `curl -s -XPOST localhost:<port>/notes -H 'content-type: application/json' -d '{"title":"hello","body":"world"}'` and `curl -s 'localhost:<port>/notes?pageSize=5'`; stop the server.

## Done when

- `docker compose up -d --wait` brings a healthy Postgres 17 and the `dev` script starts it and migrates without manual steps.
- `node scripts/check.mjs --full` exits 0; specs run with Docker stopped.
- `POST /notes` returns 201 with the note and `GET /notes` lists it with `meta.total`.
- Unknown id returns 404, invalid body or id returns 422, `DELETE` returns 204.
- Only the service touches Prisma; `DATABASE_URL` is validated in the env module and documented in `.env.example`.
