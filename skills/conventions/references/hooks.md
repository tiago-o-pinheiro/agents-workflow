# Hooks conventions

Tags: `[lint]` = enforced by the generated ESLint config (`react-hooks` rules and the custom `hook-shape` rule), `[review]` = enforced by reviewers.

## Contents

- Non-negotiable rules
- Return shape
- One responsibility
- Where hooks live
- Dependency arrays
- Context consumer hooks
- Worked example: splitting a god hook
- Forbidden: the wrapper hook

## Non-negotiable rules

These are the owner's rules. Do not soften, bend, or work around them.

- "A hook must never return more than 4 values. Over that, it is a mega-hook — split it or delete it." `[lint]` (`hook-shape`)
- "Hooks are free. Calling the same hook from two components is not duplication and never justifies wrapping it."
- "Never write a hook whose body is other hook calls re-exported. Call those hooks directly where the values are used, even if that repeats the wiring across components." `[lint]` (`hook-shape`)

Repeated wiring across components is accepted cost. A wrapper hides which hooks a component depends on and grows into a mega-hook.

## Return shape

- Return an object, not a tuple, so call sites name what they take. Exception: a hook that mirrors `useState` (`[value, setValue]`). `[review]`
- At most 4 keys. Count every function and value. `[lint]`

```ts
const { data, isLoading, error, refetch } = useNotes();
```

## One responsibility

Never mix fetching, UI state, and submission in one hook. Each is its own hook; the component composes them. `[review]`

## Where hooks live

- Used by one component: define it in that component's file, not exported. `[review]`
- Used by two or more components of one domain: `features/<domain>/hooks/use-<name>.ts`. `[review]`
- Used across features: the app's `hooks/` directory. `[review]`
- Move a hook only when the second consumer appears, not before.

## Dependency arrays

- Depend on stable primitive values (token string, id, config value). `[lint]` via `react-hooks/exhaustive-deps`
- Never put API client instances, class instances, or inline objects/functions in deps; they change identity or hide the real trigger. Depend on the token or config that builds the client. `[review]`
- Never silence `exhaustive-deps`; restructure instead. `[lint]`

```ts
// bad: client identity is the trigger
useEffect(() => { void client.notes.list(); }, [client]);

// good: the value that actually changes
useEffect(() => { void fetchNotes(token); }, [token]);
```

## Context consumer hooks

A consumer hook throws when used outside its provider, so misuse fails loudly. `[review]`

```ts
export const useNotes = (): NotesContextValue => {
  const value = useContext(NotesContext);
  if (!value) {
    throw new Error("useNotes must be used within NotesProvider");
  }
  return value;
};
```

This is the one place a plain `Error` is acceptable: it is a programmer error, not a domain error.

## Worked example: splitting a god hook

Bad: 7 values, three responsibilities (fetching, form state, submission).

```ts
const useNoteEditor = (noteId: string) => {
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => { ... };
  const reset = () => { ... };
  return { note, isLoading, title, setTitle, isSaving, error, save, reset };
};
```

Good: three focused hooks, each under the limit, called directly in the component.

```ts
const useNote = (noteId: string) => {
  // returns { note, isLoading, error, refetch }
};

const useTitleDraft = (initialTitle: string) => {
  // returns { title, setTitle, reset }
};

const useSaveNote = (noteId: string) => {
  // returns { save, isSaving, saveError }
};

export const NoteEditor = ({ noteId }: NoteEditorProps) => {
  const { note, isLoading, error, refetch } = useNote(noteId);
  const { title, setTitle, reset } = useTitleDraft(note?.title ?? "");
  const { save, isSaving, saveError } = useSaveNote(noteId);

  if (isLoading) {
    return <NoteEditorSkeleton />;
  }
  if (error) {
    return <ErrorMessage message={error} onRetry={refetch} />;
  }
  return (
    <form onSubmit={() => save({ title })}>
      ...
    </form>
  );
};
```

If `useNote` is used by this component only, keep it private in the same file.

## Forbidden: the wrapper hook

Its body only calls other hooks and re-exports their values. Delete it and call the hooks where the values are used. `[lint]` (`hook-shape`)

```ts
// bad
export const useNoteEditor = (noteId: string) => {
  const noteState = useNote(noteId);
  const draft = useTitleDraft(noteState.note?.title ?? "");
  const saving = useSaveNote(noteId);
  return { ...noteState, ...draft, ...saving };
};

// good: no wrapper, the component calls the three hooks (see above)
```

A hook that calls other hooks and also adds its own logic (derived value, effect, memo) is fine, provided it still returns at most 4 values.
