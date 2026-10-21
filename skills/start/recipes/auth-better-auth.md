# Recipe: auth-better-auth

## Applies when

`.dev/config.json` has `auth: "better-auth"`, `orm: "prisma" | "drizzle"` and a `backend`; the ORM recipe ran first, so `notes` and `db.ts` exist. Any frontend or none. Adds Better Auth (`better-auth`, email + password, cookie sessions) on the API with the ORM adapter, a session guard that protects `notes`, `GET /me`, and sign-in, sign-up and sign-out UI. Fully exercised with hono + drizzle (monorepo, Vite) and next + prisma (single); fastify and express are documented, not exercised. `notes` stay shared, not per-user: scoping rows to the user id is a follow-up.

## Steps by layer

Resolve from `.dev/config.json`: `<api>`, `<src>`, `<models>` exactly as in the ORM recipes; `<web>` = web package root (`apps/web` | `.`), `<web-src>` = its `src`. Import API modules and `Models` the way the sibling `health` and `notes` files do. With `backend: "next"` the API lives in the web package and the paths `/me`, `/notes` become `/api/me`, `/api/notes`. Run package commands in `<api>` (web in `<web>`); `<dlx>` = `pnpm dlx` | `bunx`.

1. Deps: `better-auth@^1` in `<api>` and, in a monorepo with a frontend, also in `<web>` (it ships `better-auth/react`). The schema CLI is the `auth` package, run with `<dlx> auth@^1` (`@better-auth/cli` is deprecated).
2. Env. In the env module add `BETTER_AUTH_SECRET` (min 32 chars, dev-only default `dev-only-secret-change-me-0123456789abcdef`: `next build` imports route modules, so a required secret breaks CI builds) and `BETTER_AUTH_URL` (url, default `http://localhost:<api port>`; Next: the web origin). The trusted web origin is the existing `CORS_ORIGIN`. Append both keys to `<api>/.env.example` and `<api>/.env`; extend the env spec (defaults, provided secret kept, a short secret throws naming `BETTER_AUTH_SECRET`). Production must override the secret.
3. `<src>/lib/auth.ts`, the only Better Auth file besides the auth service. Prisma `database: prismaAdapter(db, { provider: 'postgresql' })` from `better-auth/adapters/prisma`; Drizzle `database: drizzleAdapter(db, { provider: 'pg', schema })` from `better-auth/adapters/drizzle` with `import * as schema from '<alias>/modules/auth/schemas/auth.table'`:
```ts
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: <adapter above>,
  emailAndPassword: { enabled: true },
})
```
4. Schema and migration: generated, never hand-written. Create the empty target file, then run `<dlx> auth@^1 generate --config <src>/lib/auth.ts --output <target> -y` in `<api>` (the "schema mismatch" log line before the write is expected).
   - Prisma: target `prisma/schema/auth.prisma` (generates `User`, `Session`, `Account`, `Verification` mapped to singular tables); then `<pm> run db:migrate:dev --name auth` and `<pm> run db:generate` (Prisma 7 does not regenerate the client after migrate).
   - Drizzle: target `<src>/modules/auth/schemas/auth.table.ts` (the `*.table.ts` glob picks it up; it imports only `drizzle-orm`). Delete the `/* @__PURE__ */ ` markers (no comments), run prettier; then `<pm> run db:generate --name auth` and `<pm> run db:migrate`.
   The PGlite `setup-db` replays every migration, so specs see the auth tables.
5. Model `<models>/user.model.ts` (project validation lib, export from `models.ts`): `User` {id non-empty string (Better Auth ids are not uuids), name non-empty, email} plus `isUser`.
6. Auth module `<src>/modules/auth/`. `services/auth.service.ts` (class with arrow members, exported instance): `handle(request)` delegates to `auth.handler`; `findUser(headers: Headers): Promise<Models.User | null>` calls `auth.api.getSession({ headers })` and maps to `{ id, name, email }`. `controllers/auth.controller.ts` (no Better Auth import): `handle` forwards to the service, `getMe` encodes the session user with `Models.User` (200). `guards/auth.guard.ts` exports `requireSession`, which throws `UnauthorizedError` when `findUser` returns null.
7. Wire the guard and the handler per backend. Protect every `notes` route; `health` and `/api/auth/*` stay public.

| Backend | Guard | Mount |
|---|---|---|
| Hono | `createMiddleware<AuthEnv>` from `hono/factory`, `AuthEnv = { Variables: { user: Models.User } }`; sets `user` on the context; `notesRouter = new Hono().use(requireSession)...` | `authRouter = new Hono().on(['GET', 'POST'], '/*', authController.handle)` at `/api/auth`; `meRouter = new Hono<AuthEnv>().get('/', requireSession, authController.getMe)` at `/me`; `cors({ origin: env.CORS_ORIGIN, credentials: true })` |
| Next | wrapper `requireSession(handler: SessionRouteHandler): RouteHandler` passing the user as a third argument; routes become `withErrorHandler(requireSession(notesController.x))` | `src/app/api/auth/[...all]/route.ts` exports `GET` and `POST` as `withErrorHandler(authController.handle)`; `src/app/api/me/route.ts` exports `GET = withErrorHandler(requireSession(authController.getMe))` |
| Fastify | async `preHandler` storing the user in a module-level `WeakMap` keyed by `request` (`getSessionUser(request)` throws `UnauthorizedError` when absent; no `declare module`, it needs `interface`); `addHook('preHandler', requireSession)` first in `notesRouter`; headers via `fromNodeHeaders(request.headers)` (`better-auth/node`) | `authRouter: Router` with `app.route({ method: ['GET', 'POST'], url: '/*', handler })` under `{ prefix: '/api/auth' }`; the controller builds a web `Request` (URL from `request.protocol`, `request.hostname`, `request.url`; method; headers; `JSON.stringify(request.body)` when defined), calls the service, then `reply.status`, copies headers (`set-cookie` via `getSetCookie()`), `reply.send(await response.text())`; register `@fastify/cors` with `credentials: true`; `meRouter` `GET /` with `preHandler` at `/me` |
| Express | async middleware keyed by `response` in the same `WeakMap` pattern, calls `next()` after the await; `notesRouter.use(requireSession)` | service `handle = toNodeHandler(auth)` (`better-auth/node`); `Router().all('/api/auth/*splat', authController.handle)` mounted with `app.use` before `express.json()` (Better Auth reads the raw body; a prefix mount would strip the path); `cors({ origin, credentials: true })`; `meRouter` at `/me` |

   Hono and Next getMe: `getMe = (context: Context<AuthEnv>) => context.json(encode(Models.User, context.get('user')), 200)` / `getMe: SessionRouteHandler = (_request, _context, user) => Response.json(encode(Models.User, user), { status: 200 })`. Hono `handle = (context: Context) => this.authService.handle(context.req.raw)`.
8. Separate API only (`core` package): add `credentials: 'include'` to the `fetch` init in `<core>/src/api-client.ts` so feature calls send the session cookie. Cookies work in local dev because `localhost` ports share one site; different production sites need `advanced.defaultCookieAttributes` (`sameSite: 'none'`, `secure`).
9. Web client `<web-src>/lib/auth-client.ts`, from `better-auth/react`. `customFetchImpl: (input, init) => fetch(input, init)` resolves `fetch` per call (specs spy on the global after import). Separate API: `createAuthClient({ baseURL: API_URL, fetchOptions: { credentials: 'include', customFetchImpl } })` (an origin without a path makes Better Auth append `/api/auth`). Next backend: `createAuthClient({ fetchOptions: { customFetchImpl } })` (same origin; a relative `baseURL` throws).
10. `<web-src>/features/auth/` (UI from the ui package, imported as `health-status.tsx` does): `lib/read-field.ts` (typed `FormData` string read), `lib/to-auth-message.ts` (`toSignInMessage(status)`: 401 to "Wrong email or password.", else "We could not sign you in. Try again."; `toSignUpMessage(status)`: 422 to "An account with this email already exists.", else "We could not create your account. Try again."), and `components/`:
    - `sign-in-form.tsx` and `sign-up-form.tsx`: `Field` (`Email`, `Password`, plus `Name` on sign-up, `name`, `required`, `autoComplete`) and `Button type="submit" isLoading loadingLabel`, `useState` for `error` and `isPending`, `onSubmit={(event) => void handleSubmit(event)}`. `handleSubmit` calls `authClient.signIn.email` / `authClient.signUp.email` with `.catch(() => ({ error: { status: 0 } }))`, shows the mapped message in `<p role="alert">`, and on success navigates home. A link to the sibling form sits under the button.
    - `user-menu.tsx`: `const { data, isPending } = authClient.useSession()` called directly (never wrapped); `Skeleton` while pending; signed out shows "Sign in" and "Sign up" links; signed in shows `Signed in as <name>` and a secondary `Button` "Sign out" calling `void authClient.signOut()`.
    - Vite: `useNavigate` and `Link to` from `react-router`, success `void navigate('/')`; pages `routes/sign-in-page.tsx`, `routes/sign-up-page.tsx` (`PageShell` + form) added to `src/routes.tsx` with `errorElement: <RouteError />`. Next: `'use client'` first line in all three; `useRouter` from `next/navigation` and `Link href` from `next/link`, success `router.push('/')` then `router.refresh()`; default-export pages `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx`.
    - Render `<UserMenu />` above `HealthStatus` in the home page.
11. API specs (real HTTP flow on PGlite, no mocks). `<src>/test/auth-session.ts` exports `CREDENTIALS` (`member@example.test`, `'::password::-12345'`), `signUp`, `signIn`, `toCookieHeader` and `createSessionCookie` (sign up, join the `name=value` part of every `set-cookie`). Auth spec (`auth.router.spec.ts`; Next: `src/app/api/auth/auth.route.spec.ts` calling the route handlers with `new Request(...)`): sign up 200 with a cookie, sign in 200, wrong password 401, `/me` with the cookie returns a `Models.isUser` body, `/me` without it 401 with `statusCode` and `error: 'Unauthorized'`. Notes spec: `it.each` over every route (list, create, get, update, delete) expecting 401 without a session, and every existing case sending the cookie from `beforeEach`. With Next + typebox the list route does not coerce query strings (422), so cover list only where the backend coerces.
12. Web specs next to each component, `Given ..., should ...`, `userEvent`, role and label queries, spy on `globalThis.fetch`, no `vi.mock` of own modules. Type real-looking emails (`member@example.test`): `type="email"` blocks `'::email::'` in jsdom. Sign-in and sign-up: success (Vite renders `MemoryRouter` routes with a home heading; Next hoists a `{ push, refresh }` spy via `vi.hoisted` and stubs only `next/navigation`), 401/422 human message in `role="alert"`, rejected fetch shows the generic message, pending request disables the submit. `user-menu.spec.tsx`: the session store is module state, so in a `renderMenu(session)` helper spy `fetch` first (`mockImplementation(() => Promise.resolve(Response.json(session)))`, a body reads once), then `authClient.$store.notify('$sessionSignal')`, then render; signed out shows both links, signed in shows the name and Sign out requests `/sign-out`.

## Convention specifics

- Layering: only `lib/auth.ts` and `auth.service.ts` import Better Auth; controllers and routers never do, and the ORM stays in `db.ts` and services. Guards throw `UnauthorizedError`, the existing error handler renders `{ statusCode, error, message, details }`.
- Raw `process.env` stays inside the env module; the web reads no env (`API_URL` comes from `lib/api-url.ts`). Never commit a real secret; `.env` is ignored.
- Web: at most 4 values per hook; Better Auth hooks are called where used, never re-exported. Loading, error and empty states are handled; forms have labels, inline errors and a disabled submit while pending.
- No `as`, `any`, `!`, comments, enums, default exports (Next pages excepted); arrow functions; kebab-case files with type suffix.

## Verify

1. `docker compose up -d --wait` (with `DB_PORT` if 5432 is busy, matching `DATABASE_URL`), `<pm> run db:migrate` in `<api>`.
2. `<pm exec> prettier --write .`, `<pm> run lint:fix` (import order), then `node scripts/check.mjs --full`.
3. Start the API with `PORT`, `BETTER_AUTH_URL` and `CORS_ORIGIN` set to free ports (Next: `<pm exec> next dev --port <p>`, both URLs = that origin). Using `-c jar`: `curl -XPOST <api>/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: <CORS_ORIGIN>' -d '{"name":"Ada","email":"ada@example.test","password":"password-12345"}'`, sign in the same way via `/sign-in/email`, `curl -b jar <api>/me`, and `POST /notes` with and without `-b jar` (401 without). Stop the server.

## Done when

- `node scripts/check.mjs --full` exits 0; specs run with Docker stopped.
- Sign-up and sign-in return 200 and a session cookie; `/me` returns the user with the cookie and 401 without; every notes route returns 401 without a session and works with one.
- Auth tables exist in the tracked migration; `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are validated in the env module and listed in `.env.example`.
- The web (if any) has working sign-in and sign-up pages and a user menu with sign-out; only the service and `auth.ts` touch Better Auth.
