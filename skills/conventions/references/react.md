# React conventions

Tags: `[lint]` = enforced by the generated ESLint config, `[review]` = enforced by reviewers. Hook rules live in the hooks reference; TypeScript rules in the typescript reference.

## Contents

- Components
- States
- Handlers and props
- Context pattern
- Bridge pattern
- Folder structure
- Styling
- Accessibility
- Forms
- Data and state options
- Next.js
- Performance

## Components

- One component per file. File `notes-list.tsx` (kebab-case `[lint]`), named export `NotesList` `[lint]`.
- Props type is `NotesListProps`. An inline object type is allowed for 2 props or fewer. `[review]`
- File-private subcomponents and skeletons may live in the same file, unexported. `[review]`
- Arrow functions only, no default exports (except Next page/layout/route files). `[lint]`

```tsx
type NotesListProps = {
  notes: readonly Note[];
  onSelect: (id: string) => void;
};

export const NotesList = ({ notes, onSelect }: NotesListProps) => (
  <ul>
    {notes.map((note) => (
      <NoteRow key={note.id} note={note} onSelect={onSelect} />
    ))}
  </ul>
);
```

## States

Handle every state. A component that fetches or submits renders all of these. `[review]`

- Loading: a skeleton matching the final layout. No spinners for content areas.
- Empty: one human phrase ("No notes yet") plus an optional action ("Create note").
- Error: inline, human tone ("Could not load notes"), with a retry. Never a raw error message or stack.
- Disabled: controls are disabled while saving or invalid, visibly and with `disabled`.

```tsx
if (isLoading) {
  return <NotesListSkeleton />;
}
if (error) {
  return <ErrorMessage message="Could not load notes" onRetry={refetch} />;
}
if (notes.length === 0) {
  return <EmptyState message="No notes yet" actionLabel="Create note" onAction={onCreate} />;
}
```

## Handlers and props

- Internal handlers are `handleX` (`handleSubmit`). Callback props are `onX` (`onSubmit`). `[review]`
- Booleans are `isX`/`hasX`/`canX`/`shouldX`, including props (`isDisabled`). `[review]`

## Context pattern

A provider plus a consumer hook that throws outside the provider; the value is wrapped in `useMemo` so consumers do not re-render needlessly. `[review]`

```tsx
const NotesContext = createContext<NotesContextValue | null>(null);

export const NotesProvider = ({ children }: { children: ReactNode }) => {
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const value = useMemo(() => ({ notes, setNotes }), [notes]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export const useNotes = (): NotesContextValue => {
  const value = useContext(NotesContext);
  if (!value) {
    throw new Error("useNotes must be used within NotesProvider");
  }
  return value;
};
```

## Bridge pattern

The core package defines contexts and types and knows nothing about the app. The app supplies real values through a small bridge component mounted near the root. `[review]`

```tsx
export const NotesApiBridge = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const api = useMemo(() => createNotesApi(token), [token]);
  return <NotesApiProvider value={api}>{children}</NotesApiProvider>;
};
```

## Folder structure

```
app/ (or routes/)            thin route/page files: compose feature components only
features/<domain>/components feature UI
features/<domain>/hooks      hooks used by 2+ components of the domain
components/                  shared app components
hooks/                       shared cross-feature hooks
```

- Route files hold no logic beyond reading params and rendering feature components. `[review]`
- Design-system primitives come only from the ui package via deep imports: `@scope/ui/button`, never a barrel. Single-app projects: `@/design-system/ui/button`. `[review]`
- Features do not import from other features; lift shared code to `components/` or `hooks/`. `[review]`

## Styling

- Tailwind token utilities only (`p-4`, `text-muted-foreground`). No hex colors, no `px` values, no arbitrary values (`w-[137px]`). `[review]`
- No inline `style` except dynamic values that reference tokens (a CSS variable set from data). `[review]`

```tsx
// bad
<div className="w-[137px] bg-[#f5f5f5]" style={{ padding: 13 }} />

// good
<div className="w-32 bg-muted p-3" />
```

## Accessibility

- Use semantic elements (`button`, `nav`, `ul`, `label`) before reaching for `div` plus roles. `[review]`
- Every input has a `label`; icon-only buttons have an accessible name. `[review]`
- Interactive targets are at least 44px (`min-h-11 min-w-11`). `[review]`
- Focus is visible; never remove outlines without a replacement. `[review]`
- Add `aria-*` only when native semantics are not enough. `[review]`

## Forms

- Validation schema lives in a `*.schema.ts` file from the models package; the form and the backend share it. `[review]`
- Show validation messages inline next to the field, in plain language. `[review]`
- One primary action per form; disable it while submitting or invalid. `[review]`

## Data and state options

The project picked one or more in `.dev/config.json` `state`. Use only what is picked; match existing code.

- Context + hand-rolled hooks: each data hook returns `{ data, isLoading, error, refetch }` (4 values max). Context holds client-side shared state, not a cache.
- TanStack Query: query keys are `as const` factories per feature (`noteKeys.detail(id)`); one hook per query or mutation; never copy server state into Context or Zustand.
- Zustand: one store per domain with separate `State` and `Actions` types; components subscribe through narrow selectors (`useNotesStore((state) => state.filter)`), never the whole store.

## Next.js

- Components are server components by default. Add `'use client'` only on leaf components that need state, effects, or browser APIs.
- Server actions call services; they do not contain business logic or ORM calls.
- Never import server-only code (services, db, env secrets) into a client component.
- Page, layout, and route files keep default exports because Next requires them; everything else is a named export.

## Performance

- `key` is a stable id, never the array index for reorderable lists. `[review]`
- `memo`, `useMemo`, `useCallback` only after measuring, except the context value `useMemo` above. `[review]`
- Prop drilling deeper than 2 levels: introduce a context instead. `[review]`
