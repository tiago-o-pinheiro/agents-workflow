# Recipe: auth-google-jwt

## Applies when

`.dev/config.json` has `auth: "google-jwt"`, `orm: "prisma" | "drizzle"` and a `backend`; the ORM recipe ran first, so `notes` and `db.ts` exist. Any frontend or none. The web sends a Google ID token to `POST /auth/google`; the API verifies it, upserts a `User` and returns its own access JWT (HS256, `jose`). Refresh: none in v1; the token lives `JWT_EXPIRES_IN` (15m default) and the web signs the user out on the first 401, so expiry means signing in again. `notes` stay shared, not per-user: scoping rows to `userId` is a follow-up.

## Steps by layer

Resolve from `.dev/config.json`: `<api>`, `<src>`, `<models>` exactly as in the ORM recipes; `<web>` = web package root (`apps/web` | `.`), `<web-src>` = its `src`. Import API modules and `Models` the way the sibling `health` files do. Run package commands in `<api>` (web in `<web>`).

1. Deps in `<api>` (same `add` forms as the ORM recipe): `google-auth-library jose`. Web only: dev `@types/google.accounts`, and add `"google.accounts"` to `compilerOptions.types` in `<web>/tsconfig.json`.
2. Env. In the env module add `GOOGLE_CLIENT_ID` (non-empty, default `google-client-id-not-set`, never empty: `google-auth-library` skips the audience check when it is falsy), `JWT_SECRET` (min 32 chars, dev-only default), `JWT_EXPIRES_IN` (default `15m`). Append the three keys with those defaults to `<api>/.env.example` and `<api>/.env`; extend the env spec (short secret names `JWT_SECRET`, provided values are kept). Production must override `JWT_SECRET`.
3. Models (`<models>/auth.model.ts`, export from `models.ts`, project validation lib): `User` {uuid id, email, name, avatarUrl nullable string}, `GoogleLoginBundle` {idToken 1-4096}, `AuthSession` {accessToken, user}, plus `isAuthSession` and `isUser`.
4. User table, then migration. Columns: uuid `id` pk, `googleId` unique, `email`, `name`, nullable `avatarUrl`, `createdAt`, `updatedAt`, as in `notes`.
   - Prisma: `prisma/schema/user.prisma` (`model User`, `@@map("users")`), then `<pm> run db:migrate:dev --name users` and `<pm> run db:generate` (the client must regenerate before typecheck).
   - Drizzle: `<src>/modules/auth/schemas/users.table.ts` (`pgTable('users', ...)`, `googleId: text().notNull().unique()`), then `<pm> run db:generate --name users` and `<pm> run db:migrate`.
5. Services under `<src>/modules/auth/services/` (classes with arrow members and an exported instance, like `notes`):
   - `token.service.ts`, the only `jose` user: `sign(userId)` = `new SignJWT().setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(env.JWT_EXPIRES_IN).sign(secret)`; `verify(token)` returns the `sub` via `jwtVerify(token, secret, { algorithms: ['HS256'] })` and throws `UnauthorizedError` on any failure.
   - `users.service.ts`, the only ORM user: `upsertGoogleUser(profile)` (Prisma `db.user.upsert({ where: { googleId } })`; Drizzle `insert().onConflictDoUpdate({ target: users.googleId, set })`) and `getUser(id)` (`NotFoundError`), both with explicit selects returning `Models.User`.
   - `auth.service.ts`, the only `google-auth-library` user: `loginWithGoogle(idToken)` runs `new OAuth2Client().verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID })`, maps any failure or a payload without `sub` and `email` to `UnauthorizedError('Invalid Google token')`, upserts, signs, returns `AuthSession`; `authenticate(authorization)` splits `Bearer <token>` (missing or other scheme throws `UnauthorizedError`) and returns `tokenService.verify(token)`; `getMe(userId)` maps a missing user to `UnauthorizedError`.
6. Schemas, controller, router in `<src>/modules/auth/`, mirroring `notes`: `POST /google` (body `GoogleLoginBundle`, 200 `AuthSession`) and `GET /me` (200 `User`), mounted with prefix `/auth` in `app.ts`. Controllers use `encode(...)` and import no `jose`, `google-auth-library` or ORM.
7. Guard `<src>/modules/auth/guards/auth.guard.ts`: a module-level `WeakMap<object, string>` of user ids, `getUserId(key)` (throws `UnauthorizedError` when absent) and a framework-specific `authGuard` that stores `await authService.authenticate(<authorization header>)` under a stable key and lets errors propagate to the error handler. Key and glue per backend:

| Backend | Key | Guard and use |
|---|---|---|
| Fastify | `request` | `async (request: FastifyRequest) => {...}`; `app.addHook('onRequest', authGuard)` first in `notesRouter` (before validation, so bad bodies still get 401); `{ onRequest: authGuard }` on `/me` |
| Express | `response` | `RequestHandler` calling `next()` after the `await` (Express 5 forwards rejections); `notesRouter.use(authGuard)`; `authRouter.get('/me', authGuard, ...)`; controllers call `getUserId(response)` |
| Hono | `context.req.raw` | `createMiddleware(async (c, next) => {...; await next() })`; `.use(authGuard)` on `notesRouter` |
| Next | `request` | `withAuth(handler: RouteHandler): RouteHandler`; routes become `withErrorHandler(withAuth(notesController.x))`; auth routes live in `src/app/api/auth/{google,me}/route.ts` |

   Protect every `notes` route; `health` and `POST /auth/google` stay public.
8. Test helper `<src>/test/bearer-headers.ts`: `bearerHeaders(userId = randomUUID())` returns `{ authorization: 'Bearer ' + await tokenService.sign(userId) }`. Update `notes.router.spec.ts` so every request sends it (Fastify: a local `request(options)` wrapping `app.inject({ ...options, headers })`; Express: `request.agent(app).set(await bearerHeaders())` in `beforeEach`; Hono: pass `headers` to `app.request`; Next: pass headers in `new Request`), then add an `it.each` with no header expecting 401 for list, create, get and delete.
9. Web, when a frontend exists: `<web-src>/features/auth/`.
   - `store/session.store.ts`: module-level `cached` plus a `Set` of listeners; exports `getSession`, `getServerSession` (`null`), `getToken`, `setSession`, `clearSession`, `subscribe`. Reads `window.localStorage` lazily inside `try/catch` and validates with `Models.isAuthSession`; `getSession` returns `null` when `window` is undefined, so SSR and tests never crash.
   - `api/auth-api.ts`: `loginWithGoogle(idToken)` (`apiClient.post('/auth/google', { idToken }, decodeSession)`) and `getMe()`, decoders throw `ApiError` on a bad body (as `get-health.ts`).
   - `<web-src>/lib/api-client.ts`: pass `getToken` from the store to `createApiClient({ baseUrl: API_URL, getToken })`. Without `core` (backend `next`) create that file with the same `get`/`post(path, [body,] decode)` shape on `fetch`, adding `Authorization: Bearer` from `getToken()`.
   - `<web-src>/config/public-env.ts` (the web's only env reader; the lint config exempts exactly this path) exports `GOOGLE_CLIENT_ID` from `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''` (Vite: `String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '')`). Document the variable in `<web>/.env.example` and copy to `.env`.
   - `components/google-sign-in-button.tsx` (`'use client'`): an effect loads `https://accounts.google.com/gsi/client` once, calls `google.accounts.id.initialize({ client_id, callback })` and `renderButton(ref.current, { type: 'standard', theme: 'outline', size: 'large' })`; the callback runs `loginWithGoogle` then `setSession`; failures show a `role="alert"` message.
   - `components/auth-header.tsx` (`'use client'`): `useSyncExternalStore(subscribe, getSession, getServerSession)` called directly (a `useSession` wrapper is rejected by `hook-shape`), a private effect hook that calls `getMe()` for the stored token and `clearSession()` on `ApiError` 401, the user name and a `Button` "Sign out" (`onClick={clearSession}`), else the sign-in button.
   - Render `<AuthHeader />` above `{children}` in Next `src/app/layout.tsx`; in Vite above `<RouterProvider>` in `src/app.tsx` (add `"google.accounts"` to its `types`).
10. Specs. API: no real Google call; `vi.spyOn(OAuth2Client.prototype, 'verifyIdToken')` resolving `new LoginTicket('::env::', payload)` (full `TokenPayload`: `iss`, `aud`, `sub`, `iat`, `exp`, `email`, `name`, `picture`) or rejecting. `auth.router.spec.ts` on PGlite: valid token returns `AuthSession` and the spy got `{ idToken, audience: env.GOOGLE_CLIENT_ID }`; the same account twice leaves one user row; rejected token 401; empty `idToken` 422; `/auth/me` with the issued token returns the user; without, malformed, or for an unknown user 401. `token.service.spec.ts`: round trip, tampered 401, expired 401 (`vi.useFakeTimers({ now })`). Web: `session.store.spec.ts` (jsdom storage, `vi.resetModules()` plus dynamic import for restore, corrupt storage is signed out), `auth-header.spec.tsx` (signed in shows the name and Sign out clears; a 401 from `/auth/me` signs out), `google-sign-in-button.spec.tsx` (`vi.stubGlobal('google', ...)` whose `initialize` invokes the callback; spy on `fetch`; success stores the token, a 401 shows the alert). Names `Given ..., should ...`, placeholders `'::email::'`, no `vi.mock` of own modules.

## Convention specifics

- Layering: `jose` only in `token.service`, `google-auth-library` only in `auth.service`, ORM only in `users.service` (and the notes service). Controllers read the user through `getUserId`, never parse headers.
- Hooks: at most 4 values, called directly where used, never wrapped. Token store, not React state, owns the session.
- Errors are `UnauthorizedError` (401) for every auth failure; messages never echo the token.
- No `as`, `any`, `!`, comments, enums, default exports; files `<name>.<layer>.ts`.

## Verify

1. Start the database and migrate (`docker compose up -d --wait`, `DB_PORT` if 5432 is busy and match `DATABASE_URL`).
2. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
3. Boot the API (`PORT=<free port> <pm> run dev` in `<api>`): `curl -i localhost:<port>/notes` returns 401; `curl -s -XPOST localhost:<port>/auth/google -H 'content-type: application/json' -d '{"idToken":"x"}'` returns 401. Mint a token with a one-off `tsx` script calling `tokenService.sign('<uuid>')` and check `/notes` with `-H "authorization: Bearer <token>"` returns 200. Stop the server.

## Done when

- `node scripts/check.mjs --full` exits 0 with no Google or network access.
- `POST /auth/google` with a valid Google ID token returns an access JWT and one `User` row; invalid tokens return 401.
- Every `notes` route returns 401 without a valid bearer token; `GET /auth/me` returns the signed-in user.
- The web (if any) signs in with the Google button, sends the bearer through the API client, and signs out on request or on a 401.
- `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN` are validated in the env module and documented in `.env.example` (plus the web client id variable).
