# Recipe: auth-authjs

## Applies when

`.dev/config.json` has `auth: "authjs"`, `frontend: "next"`, `orm: "prisma" | "drizzle"` and a `backend`; the ORM recipe ran first. Adds Auth.js (`next-auth`) with the ORM adapter, Google and GitHub sign-in, a sign-in page, and protects the `notes` API. Fully supported with `backend: "next"`. With a separate API (fastify, hono, express) apply steps 1-2 and 7-8 without the adapter (JWT sessions need no tables) and protect the API as in "Separate API"; that path is documented, not exercised.

Versions (checked 2026-10): `next-auth` `latest` is still v4; v5 is only on the `beta` tag, so pin it exactly: `next-auth@5.0.0-beta.32` (peers `next ^16` ok, depends on `@auth/core@0.41.3`). Adapters are stable: `@auth/drizzle-adapter@^1.11.3`, `@auth/prisma-adapter@^2.11.3` (peer `@prisma/client >=6`). Install them in one command so one `@auth/core` resolves.

## Steps by layer

Resolve from `.dev/config.json`: `<web>` = Next app root (`apps/web` | `.`), `<web-src>` = its `src`, `<src>` = API source (`apps/web/src/server` | `src/server`; with `backend: "next"` the API lives in the web package), `<api>` = its package root. Import API modules the way sibling `health` files do (`@/server/...` in the Next backend). Run package commands in `<web>`.

1. Deps: `next-auth@5.0.0-beta.32` plus `@auth/drizzle-adapter` or `@auth/prisma-adapter`. Vitest cannot import `next-auth` as external ESM (`next/server` has no extension), so in `<web>/vitest.config.ts` pass `inlineDeps: ['next-auth']` to `createVitestConfig`.
2. Env. Strategy: JWT sessions (`session: { strategy: 'jwt' }`), because Edge-free route handlers, specs and a separate API can all verify the cookie with only `AUTH_SECRET`; the adapter still persists users and linked accounts. In the env module add `AUTH_SECRET` (min 32 chars, dev-only default), `AUTH_TRUST_HOST` (boolean, default true; local dev needs it), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (strings, default empty). Append all six with those defaults to `<api>/.env.example` and `.env` (create both when missing); extend the env spec (short secret named, provider values kept, `'false'` read as boolean). Production must override `AUTH_SECRET`.
3. Adapter tables, then migration. Auth.js requires exactly these four tables and column names; keep the plural table names.
   - Drizzle: `<src>/modules/auth/schemas/auth.table.ts` exports `users` (`id text pk $defaultFn(() => crypto.randomUUID())`, `name`, `email unique`, `emailVerified timestamp mode date`, `image`), `accounts` (`userId` fk cascade, `type text $type<'oauth' | 'oidc' | 'email' | 'webauthn'>()`, `provider`, `providerAccountId`, snake_case `refresh_token access_token expires_at(integer) token_type scope id_token session_state`, composite pk `[provider, providerAccountId]`), `sessions` (`sessionToken` pk, `userId` fk cascade, `expires`), `verificationTokens` (`verification_tokens`, `identifier`, `token`, `expires`, composite pk). Do not import types from `next-auth/adapters` (not exported by the beta). Then `<pm> run db:generate --name auth` and `<pm> run db:migrate`.
   - Prisma: `prisma/schema/auth.prisma` with models `User` (`@@map("users")`, `id String @id @default(cuid())`, optional `name`, unique optional `email`, optional `emailVerified DateTime?`, optional `image`, relations `accounts Account[]`, `sessions Session[]`), `Account` (same snake_case fields as above, `@@id([provider, providerAccountId])`, `user` relation `onDelete: Cascade`), `Session`, `VerificationToken` (`@@id([identifier, token])`), each with `@@map`. Then `<pm> run db:migrate:dev --name auth` and `<pm> run db:generate`.
4. `<web-src>/auth.ts` (framework root file, composition only):
```ts
export const signInProviders = [{ id: 'google', name: 'Google' }, { id: 'github', name: 'GitHub' }]
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  providers: [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }), GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET })],
  session: { strategy: 'jwt' },
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST,
  pages: { signIn: '/sign-in' },
})
```
   Prisma: `adapter: PrismaAdapter(db)` (`db` from `<src>/lib/db`). Always pass secrets from the typed env module, never rely on Auth.js reading `process.env` (lint bans it). Providers are imported as `next-auth/providers/google` and `.../github`.
5. `<web-src>/app/api/auth/[...nextauth]/route.ts`: `import { handlers } from '@/auth'` then `export const { GET, POST } = handlers`.
6. Guard `<src>/modules/auth/guards/auth.guard.ts`: `withAuth(handler: RouteHandler): RouteHandler` calls `getToken({ req: request, secret: env.AUTH_SECRET })` (`next-auth/jwt`) and throws `UnauthorizedError` when it returns null. Do not call `auth()` here: it needs Next's request scope (`headers()`), so under Vitest it throws and the route answers 500. `getToken` reads the session cookie from a plain `Request`, verifies signature and expiry, and is the same call a separate API makes. Wrap every notes route: `withErrorHandler(withAuth(notesController.getNotes))` in `src/app/api/notes/route.ts` and `[id]/route.ts`; `health` stays public.
7. Web (`<web-src>`, server components by default):
   - `features/auth/actions/auth.actions.ts` (`'use server'`): `signInWithProvider(providerId)` calls `signIn(providerId, { redirectTo: '/' })`; `signOutUser()` calls `signOut({ redirectTo: '/' })`.
   - `features/auth/components/sign-in-buttons.tsx` (`'use client'`, an inline `form action` closure is invalid in a server component): props `providers: { id, name }[]` and `onSignIn: (providerId: string) => Promise<void>`; one `<form>` per provider with a `Button` "Sign in with <name>".
   - `auth-header-view.tsx` (presentational): props `userName: string | null`, `onSignOut`; a `Link` "Sign in" to `/sign-in` when null, else the name and a sign-out form with a `Button` "Sign out". `auth-header.tsx` (async server component) reads `await auth()` and renders the view with `signOutUser`; render `<AuthHeader />` above `{children}` in `src/app/layout.tsx`.
   - `app/sign-in/page.tsx`: `redirect('/')` when `await auth()` is truthy, else `PageShell` with `SignInButtons providers={signInProviders} onSignIn={signInWithProvider}`.
8. Specs (no mocks of own modules, no real OAuth):
   - `<src>/test/authed-request.ts`: `sessionCookie()` encodes a token with `encode` from `next-auth/jwt` (`secret: env.AUTH_SECRET`, `salt: 'authjs.session-token'`) and returns `authjs.session-token=<jwt>`; `authedRequest(url, init)` builds a `Request` with that cookie. Update the notes route specs to build every request with it (make helpers `async`).
   - `src/app/api/notes/unauthorized.spec.ts`: `it.each` over list, create, get, delete with a plain `Request` expecting 401, plus a forged cookie expecting 401.
   - `[...nextauth]/route.spec.ts`: `GET(new NextRequest('http://localhost/api/auth/providers'))` lists `github` and `google`; `/api/auth/session` returns `null` without a cookie.
   - Components with role queries and `userEvent`: `sign-in-buttons.spec.tsx` (a button per provider, click calls `onSignIn` with the id) and `auth-header-view.spec.tsx` (signed out link `/sign-in`, signed in name, sign out calls the action). Names `Given ..., should ...`, placeholders `'::name::'`.

## Separate API (documented, not exercised)

Keep the same `AUTH_SECRET` in the web and API envs. The web sends the session to the API (same-site cookie, or `Authorization: Bearer <session JWT>` taken from a server action). The API guard installs `next-auth` and calls `getToken({ req: { headers }, secret: env.AUTH_SECRET })` from `next-auth/jwt` with the request headers, throwing `UnauthorizedError` on null; wire it per framework as in `auth-google-jwt` step 7. Production over https uses the cookie `__Secure-authjs.session-token`, so set `AUTH_URL` to the https origin on the API too.

## Convention specifics

- `auth.ts` is composition: no business logic, no `process.env`. ORM stays behind `db.ts`; controllers never import `next-auth`.
- Server components read the session; client components receive data and server actions as props, never import `@/auth`.
- Every auth failure in the API is `UnauthorizedError` (401). No `as`, `any`, `!`, comments, enums; default exports only for Next pages and layouts.

## Verify

1. Start the database and migrate (`DB_PORT` if 5432 is busy and match `DATABASE_URL`).
2. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
3. `<pm exec> next dev --port <free port>`: `curl -i localhost:<port>/api/notes` returns 401; `curl -s localhost:<port>/api/auth/providers` lists google and github; `/sign-in` returns 200 with both buttons. Stop the server.

## Done when

- `node scripts/check.mjs --full` exits 0 with no network access.
- Every `notes` handler returns 401 without a valid session cookie and works with one; `health` stays public.
- `/api/auth/providers` lists Google and GitHub; `/sign-in` renders a button per provider; the header shows sign-in or the user with sign-out.
- Adapter tables exist in a tracked migration; `AUTH_*` variables are validated in the env module and documented in `.env.example`.
