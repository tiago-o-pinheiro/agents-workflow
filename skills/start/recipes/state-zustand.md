# Recipe: state-zustand

## Applies when

`.dev/config.json` has `state` including `"zustand"` and a `frontend`. Adds Zustand 5 with a persisted theme store (light, dark, system), a `ThemeSync` that applies it to `<html>`, and a `ThemeToggle` in the page shell header. Hydration-safe on Next. The `.dark` token values already exist in the tokens theme.

## Steps by layer

Resolve from `.dev/config.json`: `<web>` = web app root (`apps/web` | `.`), `<web-src>` = its source (`apps/web/src` | `src`), `<ui>` = ui import prefix (`<scope>/ui` | `@/design-system/ui`). All files are relative to `<web-src>`; `@/` is the web app alias. If `state-tanstack-query` already ran, `layout.tsx` / `app.tsx` already contain `QueryProvider`: add to it, do not replace it.

1. Dep in the web app: pnpm `pnpm add --filter <scope>/web zustand@^5`, bun `bun add --cwd apps/web zustand@^5`, single `pnpm add` or `bun add` at the root.
2. `stores/theme.store.ts`. `skipHydration: true` keeps the first client render equal to the server render (`'system'`); `ThemeSync` rehydrates after mount.
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'theme', skipHydration: true, partialize: ({ theme }) => ({ theme }) },
  ),
)
```
3. `components/theme-sync.tsx` (`'use client'`, renders `null`): reads `theme` with `useThemeStore((state) => state.theme)`; one `useEffect(() => { void useThemeStore.persist.rehydrate() }, [])`; a second effect on `[theme]` that calls `window.matchMedia('(prefers-color-scheme: dark)')`, runs `apply` (`document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))`), subscribes `media.addEventListener('change', apply)` and removes it in the cleanup. `window` is touched only inside effects.
4. `components/theme-toggle.tsx` (`'use client'`): a `role="group" aria-label="Theme"` row of three `Button`s from `<ui>/button` (`size="sm"`, `variant` `secondary` when selected else `ghost`, `aria-pressed={theme === option.value}`, `onClick={() => { setTheme(option.value) }}`), options `Light`, `Dark`, `System` from a module-level `OPTIONS` array. Select each value with its own call: `useThemeStore((state) => state.theme)` and `useThemeStore((state) => state.setTheme)`. Import order: `<ui>/button`, blank line, `@/stores/theme.store`.
5. `components/page-shell.tsx`: import `./theme-toggle` (own group after `react`); make the `<header>` `flex flex-wrap items-start justify-between gap-4`, wrap title and description in `<div className="flex flex-col gap-1">`, and render `<ThemeToggle />` after it. `PageShell` stays a server component on Next.
6. Mount `ThemeSync` once. Next: `app/layout.tsx`, inside `<body>` before the children. Vite: `app.tsx`, before `<RouterProvider />` (wrap both in a fragment, or inside `QueryProvider`).
7. Specs. `stores/theme.store.spec.ts`: `beforeEach` clears `localStorage` and resets with `useThemeStore.setState({ theme: 'system' })`; cases: default is `system`; `setTheme('dark')` updates the state and writes `"theme":"dark"` to `localStorage`; a saved value is restored by `await useThemeStore.persist.rehydrate()`. `components/theme-toggle.spec.tsx`: the same reset plus removing the `dark` class, and a `stubSystemTheme(isDark)` helper using `vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: isDark, addEventListener: vi.fn(), removeEventListener: vi.fn() })))` (jsdom has no `matchMedia`; vitest restores globals between files). Cases (`userEvent`, role queries, `it('Given ..., should ...')`): System is pressed by default; clicking Dark presses it and adds `dark` to `document.documentElement`; Light after Dark removes it; a dark system with `ThemeSync` rendered adds the class.
8. `<pm exec> prettier --write <web-src>` then `<pm exec> eslint . --fix` in `<web>`.

## Convention specifics

- Stores: `stores/<name>.store.ts` for app-wide state; `features/<domain>/stores/<name>.store.ts` for state owned by one feature. One `create<State>()(...)` per file, state type declared above it, actions defined inside the store.
- Components select one value per `useXStore((state) => state.x)` call; never `useXStore()` bare and never an object selector. Do not wrap store hooks in custom hooks.
- Zustand is for client UI state only. Server data belongs in TanStack Query (or fetchers), never copied into a store.
- Anything persisted on Next needs `skipHydration: true` plus a client component that calls `rehydrate()` in an effect; never read `window`/`localStorage` during render.
- Known trade-off: a returning dark-mode user sees one light frame before `ThemeSync` runs. Fix with a blocking inline script only if the product demands it.
- Test stores by resetting state in `beforeEach` (`setState`), never by re-creating the store.

## Verify

1. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
2. Next: start the dev server on a free port, load the page in a browser and read the console: no hydration warnings (a missing favicon 404 is fine). Click Dark: `<html>` gets `dark` and `localStorage.theme` holds the choice; reload keeps it. Stop the server.
3. Vite: dev server on a free port, `curl` returns 200 for the page and `/src/app.tsx`; stop it.

## Done when

- `zustand` is a dependency of the web app only.
- `stores/theme.store.ts`, `theme-sync.tsx`, `theme-toggle.tsx` and their specs exist; `ThemeSync` is mounted once; `PageShell` renders `ThemeToggle`.
- Choosing a theme toggles `dark` on `<html>`, persists across reloads, and Next logs no hydration warning.
- `node scripts/check.mjs --full` exits 0.
