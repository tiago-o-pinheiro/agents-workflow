# Recipe: ui-shadcn

## Applies when

`.dev/config.json` has `ui: "shadcn"` and a `frontend`. Adds shadcn/ui to the ui package: shared token roles, `button` and `field` rebuilt on shadcn primitives (same paths and props), plus `input`, `card` and `dialog` as the pattern for later components.

## Steps by layer

Resolve from `.dev/config.json`: `<ui>` = ui package root (`packages/ui` | `src/design-system/ui`), `<ui-src>` = ui source (`packages/ui/src` | `src/design-system/ui`), `<tokens>` = tokens CSS dir (`packages/tokens/src` | `src/design-system/tokens`), `<app-css>` = the app `globals.css`. The ui package is never the app: no shadcn file lands in the app.

1. Deps in the ui package (pnpm `pnpm add --filter <scope>/ui`, bun `bun add --cwd packages/ui`, single `pnpm add` or `bun add` at the root). Pinned majors: `radix-ui@^1 class-variance-authority@^0.7 lucide-react@^1`. `radix-ui` is the unified package shadcn imports from (`import { Dialog as DialogPrimitive } from 'radix-ui'`); never `@radix-ui/react-*`.
2. `components.json` in `<ui>` (single: repo root). Tailwind v4 means `"config": ""`; `css` points at `<tokens>/tailwind.css` relative to the file; `"style": "new-york"`, `"rsc": false`, `"tsx": true`, `"cssVariables": true`, `"iconLibrary": "lucide"`. Aliases point at the ui package, with `@/` as the alias root: monorepo `{ "components": "@/", "ui": "@/", "utils": "@/lib/cn", "lib": "@/lib", "hooks": "@/hooks" }` (add `"compilerOptions": { "paths": { "@/*": ["./src/*"] } }` to `packages/ui/tsconfig.json`; Vitest already aliases `@`); single `{ "components": "@/design-system/ui", "ui": "@/design-system/ui", "utils": "@/design-system/ui/lib/cn", "lib": "@/design-system/ui/lib", "hooks": "@/design-system/ui/hooks" }`.
3. Do not run `shadcn init`. It rewrites the app CSS with its own oklch variables, `tw-animate-css` and `@layer base`, which breaks the token contract. Components are written by hand from the specs below; use `pnpm dlx shadcn@latest view <name>` only to read upstream source.
4. Token roles. shadcn expects these names; map them, never add a second set of variables:

| shadcn | token | action |
|---|---|---|
| `background` `foreground` `primary(-foreground)` `muted(-foreground)` `accent(-foreground)` `border` `ring` | same name | exists |
| `destructive` | `danger` (`danger-foreground`) | use `bg-danger text-danger-foreground`; never add `destructive` |
| `card(-foreground)` `popover(-foreground)` `secondary(-foreground)` `input` | same name | add |

   In `<tokens>/theme.css` add to `:root`: `--card: #ffffff`, `--card-foreground: #0f172a`, `--popover: #ffffff`, `--popover-foreground: #0f172a`, `--secondary: #f1f5f9`, `--secondary-foreground: #0f172a`, `--input: #78879b`; and to `.dark`: `--card: #111827`, `--card-foreground: #e2e8f0`, `--popover: #111827`, `--popover-foreground: #e2e8f0`, `--secondary: #1e293b`, `--secondary-foreground: #e2e8f0`, `--input: #64748b`. In `<tokens>/tailwind.css` `@theme inline` add the matching `--color-<role>: var(--<role>)` lines (`card`, `card-foreground`, `popover`, `popover-foreground`, `secondary`, `secondary-foreground`, `input`). Radius, shadow and font utilities already map from `--corner-*`, `--elevation-*`, `--typeface-*`; add nothing for them.
5. `<app-css>` must stay exactly the four lines `@import 'tailwindcss'`, the two token imports and `@source` to the ui src. If any shadcn command touched it (or the tokens files), restore them and redo step 4.
6. `button/button.tsx` on `cva`, keeping the props API (`variant` primary|secondary|ghost, `size` sm|md|lg, `isLoading`, `loadingLabel`, default `type="button"`, `disabled` while loading, `aria-busy`, sr-only loading label) and every class asserted by `button.spec.tsx` (`bg-transparent`, `min-h-12`). Export `buttonVariants` and `ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & {...}`; add `destructive: 'bg-danger text-danger-foreground hover:bg-danger/90'`; `secondary` becomes `bg-secondary text-secondary-foreground hover:bg-secondary/80`. Add `buttonVariants` to `button/index.ts`. Extend `button.spec.tsx` with the destructive variant.
```tsx
export const buttonVariants = cva(['inline-flex min-w-11 items-center justify-center gap-2 rounded-md font-medium transition-colors', '...'], {
  variants: { variant: { primary: '...', destructive: '...' }, size: { sm: 'min-h-11 px-3 text-sm', lg: 'min-h-12 px-6 text-lg' } },
  defaultVariants: { variant: 'primary', size: 'md' },
})
<button className={cn(buttonVariants({ variant, size }), className)} {...props} />
```
7. `input/`: `Input` = `ComponentProps<'input'>`, `type` defaults to `'text'`, classes `min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground`, the focus-visible outline-ring pair, `disabled:` opacity, `aria-invalid:border-danger`. Spec: typing keeps the value, disabled rejects typing, `type` is applied.
8. `field/field.tsx` renders `Input` from `../input/input` (instead of its own `<input>`) and keeps label, `error`, `aria-invalid`, `aria-describedby`, and the error paragraph. Props and `field.spec.tsx` unchanged. `skeleton` stays as is.
9. `card/`: `Card` (`flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm`), `CardHeader`, `CardTitle` (h3), `CardDescription` (`text-muted-foreground`), `CardContent`, `CardFooter`; each `ComponentProps<'div'>` (or `'h3'`/`'p'`) plus `className` through `cn`. Spec: composed card renders heading, description, content, footer; a passed class merges over the defaults.
10. `dialog/`: wrap `DialogPrimitive` from `radix-ui`: `Dialog`, `DialogTrigger`, `DialogClose` are direct aliases of Root, Trigger, Close; `DialogContent` renders Portal, Overlay (`fixed inset-0 bg-foreground/50`), Content (`fixed top-1/2 left-1/2 ... -translate-x-1/2 -translate-y-1/2 ... bg-popover text-popover-foreground shadow-md`) and a close button (`size-11`, lucide `X` with `aria-hidden`, sr-only "Close"); `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` style the parts with `cn`. No `tw-animate-css` or `animate-in` classes. Spec (`Button` as `DialogTrigger asChild`): closed renders no dialog; click opens a dialog named by its title and described by its description; close button closes; Escape closes.
11. Each new folder gets `index.ts` with named exports (components plus `XProps` types). Spec imports sort `./<name>` before `../<other>/...` with no blank line between them (lint rule). Format with `<pm exec> prettier --write <ui>`.

## Convention specifics

- Every shadcn snippet is rewritten before landing: arrow functions, named exports (no `forwardRef`, React 19 takes `ref` as a prop), `type` not `interface`, no comments, no `data-slot`, no `React.` namespace, kebab-case files, relative `../lib/cn` imports, token utilities only (`bg-danger`, never `bg-destructive`; no hex, arbitrary values or `dark:` color overrides).
- Touch targets stay at least 44px (`min-h-11`, `size-11`); shadcn's `h-9` and `size-8` defaults are raised.
- Deep imports only (`<scope>/ui/dialog`, single `@/design-system/ui/dialog`); no ui barrel.
- New components later: copy this folder pattern, keep `cva` for variants, add the token roles first.

## Verify

1. `<pm exec> prettier --write .` then `node scripts/check.mjs --full`.
2. `git diff -- <app-css>` is empty; `grep -rnE "oklch|tw-animate|bg-destructive" <ui-src> <tokens> <app-css>` finds nothing.
3. Optional: use `Card`, `Dialog` or `Input` in a throwaway page, run the dev server on a free port, confirm light and dark render with token colors, stop it, and remove the page.

## Done when

- `components.json` exists in the ui package (single: repo root), aliases point at the ui package, no `tailwind.config` exists.
- `button`, `field`, `skeleton` keep their paths and props; their existing specs pass; `input`, `card`, `dialog` exist with specs.
- `theme.css` and `tailwind.css` carry the added roles for light and dark; no duplicate shadcn variable set; the app CSS is unchanged.
- `radix-ui`, `class-variance-authority`, `lucide-react` are dependencies of the ui package only.
- `node scripts/check.mjs --full` exits 0.
