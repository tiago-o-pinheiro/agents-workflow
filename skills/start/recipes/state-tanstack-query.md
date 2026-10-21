# Recipe: state-tanstack-query

## Applies when

`.dev/config.json` has `state` including `"tanstack-query"` and a `frontend`. Adds TanStack Query v5 to the web app, moves the health feature onto it, and sets the pattern for server state. Run it before `state-zustand` when both are listed (both edit `layout.tsx` / `app.tsx`).

## Steps by layer

Resolve from `.dev/config.json`: `<web>` = web app root (`apps/web` | `.`), `<web-src>` = its source (`apps/web/src` | `src`), `<ui>` = ui import prefix (`<scope>/ui` | `@/design-system/ui`). Backend `none` has no `features/health`: do steps 1-3 and 5, skip 4 and the health parts of 6. All files are relative to `<web-src>`; `@/` is the web app alias.

1. Dep in the web app: pnpm `pnpm add --filter <scope>/web @tanstack/react-query@^5`, bun `bun add --cwd apps/web @tanstack/react-query@^5`, single `pnpm add` or `bun add` at the root. No devtools package.
2. `components/query-provider.tsx`: one `QueryClient` per mounted provider, created lazily with `useState` so a Next server never shares a client between requests. The `'use client'` line is required on Next and harmless on Vite.
```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

type QueryProviderProps = {
  children: ReactNode
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })

export const QueryProvider = ({ children }: QueryProviderProps) => {
  const [queryClient] = useState(createQueryClient)

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```
3. Mount it once. Next: in `app/layout.tsx` wrap `{children}` inside `<body>` with `<QueryProvider>` (import `@/components/query-provider`, sorted before other `@/components/*` imports). Vite: in `app.tsx` return `<QueryProvider><RouterProvider router={router} /></QueryProvider>` (import `./components/query-provider`).
4. `features/health/api/health.query.ts` next to the fetcher:
```ts
import { queryOptions } from '@tanstack/react-query'

import { getHealth } from './get-health'

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: getHealth,
})
```
5. `test/render-with-query.tsx`: fresh client per render, no retries (a failing query must surface at once) and `gcTime: Infinity` so no timers outlive the test.
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { type ReactElement } from 'react'

export const renderWithQuery = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}
```
6. Migrate `features/health/components/health-status.tsx`: delete `HealthPhase` and the private `useHealth`; drop the `react` and `../api/get-health` imports. Add `import { useQuery } from '@tanstack/react-query'` (own group, before `<ui>` imports) and `import { healthQuery } from '../api/health.query'`. In the component:
```tsx
const { status, refetch } = useQuery(healthQuery)
```
   Render `status === 'pending'` (skeleton), `'success'` (online text), `'error'` (alert). Retry button: `onClick={() => void refetch()}`; a refetch from the error state returns to `pending`, so the skeleton shows again. Markup, copy and `HealthStatusSkeleton` stay unchanged.
7. `health-status.spec.tsx`: `import { screen }` only (no `render`), import `renderWithQuery` from `@/test/render-with-query` in its own group above `./health-status`, replace every `render(<HealthStatus />)` with `renderWithQuery(<HealthStatus />)`. Cases and `fetch` spies stay as they are.
8. `<pm exec> prettier --write <web-src>`; run `<pm exec> eslint . --fix` in `<web>` if import order fails.

## Convention specifics

- Query keys and `queryOptions` live in `features/<domain>/api/<name>.query.ts`, one exported const per query; the key is an array starting with the domain (`['notes', 'list', filter]`, `['notes', 'detail', id]`).
- Components call `useQuery(xQuery)` / `useMutation({...})` directly. Never write `useNotes`-style wrappers around them: hooks are free, and a wrapper that re-exports other hooks is banned. Destructure at most 4 values.
- Branch on `status` (`'pending' | 'error' | 'success'`), not on `isLoading`; `data` is narrowed inside the `success` branch, so no `!` or `as`.
- Fetchers stay plain async functions (`getHealth`); with a separate API they go through `apiClient` from the core package. Query functions return decoded models, never raw `unknown`.
- Mutations: `useMutation({ mutationFn: createNote, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }) })` with `queryClient = useQueryClient()` in the component. Only when the ORM recipe created `notes`; do not build notes UI here.
- Tests mock `fetch` (`vi.spyOn(globalThis, 'fetch')`) and render through `renderWithQuery`; never share a `QueryClient` across tests.
- Server prefetch/hydration on Next is out of scope; add it per route when a page needs it.

## Verify

1. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
2. `grep -rn "useHealth\|useEffect" <web-src>/features/health` finds nothing.
3. Optional: start the dev server on a free port and load the page. With the API stopped it shows the retry alert; with it running, "The API is online." Stop the server.

## Done when

- `@tanstack/react-query` is a dependency of the web app only; no devtools dependency.
- `QueryProvider` is mounted once (Next `layout.tsx`, Vite `app.tsx`); `render-with-query.tsx` exists.
- With a backend: `health.query.ts` exists, `HealthStatus` uses `useQuery(healthQuery)`, no `useHealth`, and its spec passes through `renderWithQuery`.
- `node scripts/check.mjs --full` exits 0.
