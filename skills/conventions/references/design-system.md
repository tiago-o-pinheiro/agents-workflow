# Design system

## Contents
- Three layers
- Tokens
- Contract
- Components
- App CSS wiring
- Adding a token
- Visual rules
- Motion and feedback
- States
- shadcn variant

## Three layers

1. Tokens package: raw values (CSS variables, TS motion tokens).
2. Contract: Tailwind v4 `@theme inline` mapping token variables to utilities.
3. Components: ui package, built only from token utilities.

Packages are `tokens` and `ui`. In single layout they live at `src/design-system/{tokens,ui}`. Feature and app-level composites never live in the ui package; they live in `features/` or `components/`.

## Tokens

`tokens/src/theme.css` holds values as CSS variables: `:root` for light, `.dark` for overrides.

- Color roles: `background`, `foreground`, `surface`, `muted`, `primary`, `primary-foreground`, `accent`, `danger`, `border`, `ring`.
- Corner (radius) scale, spacing on a 4px base, typefaces, font sizes, elevation (shadows), motion.
- Dark mode: `.dark` class on `html`. Never `prefers-color-scheme` alone.

`tokens/src/motion.ts` holds durations and easing as `as const`, for JS animations only (CSS uses the CSS variables).

```ts
export const DURATION = { fast: 120, base: 200, slow: 320 } as const;
export const EASING = { out: [0.16, 1, 0.3, 1] } as const;
```

## Contract

`tokens/src/tailwind.css` maps variables with `@theme inline`, so utilities come from tokens:

```css
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-foreground: var(--foreground);
  --radius-md: var(--corner-md);
  --shadow-md: var(--elevation-md);
  --font-sans: var(--typeface-sans);
}
```

Result: `bg-surface`, `text-foreground`, `rounded-md`, `shadow-md`. `inline` keeps the utilities resolving to the live variable, so `.dark` works without regenerating CSS.

Token names never reuse a Tailwind theme namespace (`--radius-*`, `--shadow-*`, `--font-*`, `--color-*`), or the mapping becomes a self-reference. Tokens use `--corner-*`, `--elevation-*`, `--typeface-*`, `--motion-*` and bare color roles.

## Components

One folder per component, deep imports only:

```
ui/src/button/button.tsx
ui/src/button/button.spec.tsx
ui/src/button/index.ts
ui/src/lib/cn.ts
```

- Import `@scope/ui/button` (single app: `@/design-system/ui/button`). No barrel `index.ts` at the ui root. Reason: deep imports keep bundles and tests small.
- `cn()` in `ui/src/lib/cn.ts` = `clsx` + `tailwind-merge`. Use it for every conditional class.
- Variants are `as const` maps keyed by variant name; use `cva` only when the project uses shadcn.
- Components use token utilities only. Named exports, arrow functions, props type `XProps`.

```tsx
const VARIANTS = {
  primary: 'bg-primary text-primary-foreground',
  ghost: 'bg-transparent text-foreground',
} as const;

export const Button = ({ variant = 'primary', className, ...props }: ButtonProps) => (
  <button className={cn('rounded-md px-4 h-11', VARIANTS[variant], className)} {...props} />
);
```

## App CSS wiring

Order in the app global CSS is fixed:

```css
@import "tailwindcss";
@import "<tokens>/theme.css";
@import "<tokens>/tailwind.css";
@source "<path to ui src>";
```

`@source` is required: Tailwind does not scan other packages otherwise, and ui classes vanish from the build.

## Adding a token

1. Add the CSS variable to `theme.css` for light and dark.
2. Add the mapping to `tailwind.css`.
3. Never define a value inside a component.

## Visual rules

- No hex, rgb, hsl in components. No `px` and no arbitrary values (`p-[13px]`); use the scale. [review]
- No inline `style` except dynamic values that reference tokens (`style={{ width: `${pct}%` }}`). [review]
- Color split 60-30-10: 60% background/surface, 30% foreground/secondary, 10% accent.
- One accent color per screen. One primary action per screen.
- Touch targets at least 44px (`h-11`, `min-w-11`).
- Text and UI contrast meets WCAG AA (4.5:1 text, 3:1 large text and controls).
- Visible focus ring on every interactive element (`ring` token).

## Motion and feedback

- Durations and easing come from tokens, never literals.
- Ease-out (deceleration) for entrances; shorter exits.
- Respect `prefers-reduced-motion`: drop transforms, keep opacity.
- Every interaction gives feedback within about 100ms (pressed state, optimistic update, or progress).

## States

- Loading: skeleton matching the final layout. No spinners for content.
- Error: inline next to the cause, human tone ("We couldn't save that. Try again."). No raw error codes.
- Empty: one phrase, plus an optional action.
- Disabled: reduced contrast and `aria-disabled`, with a reason when it is not obvious.

## shadcn variant

Applies when `.dev/config.json` `ui` = `shadcn`.

- Generate components into the ui package, not the app.
- Then rewrite each to the token contract and project conventions: named exports, arrow functions, kebab-case files, token utilities only, one folder per component.
- Remove shadcn's own color variables if they duplicate tokens; map them in `theme.css` instead.
- `cva` is allowed for variants.
