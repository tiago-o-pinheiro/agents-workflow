# Testing conventions

Vitest everywhere. Tags: `[lint]` enforced by ESLint, `[review]` enforced by reviewers.

## Contents
- Setup and placement
- Naming
- Structure
- Fixtures
- React
- Mocking
- Backend
- Coverage rules
- What not to test

## Setup and placement

- Config comes from the config package factory: `createVitestConfig({ root: import.meta.dirname })` for backend and packages, plus `environment: 'jsdom'` and `setupFiles` for UI. Never hand-roll a vitest config. [review]
- Specs are colocated next to the source: `notes.service.ts` -> `notes.service.spec.ts`. React: `.spec.tsx`. [lint]

## Naming

- `describe('<Unit>')` names the unit under test; `it('Given <condition>, should <behavior>')`.
- Domain language, 6-12 words. No implementation words (no "calls", "mock", "state"). [review]

```ts
describe('NotesService', () => {
  it('Given a note owned by someone else, should forbid reading it', async () => {})
})
```

## Structure

- One behavior per test. Several asserts are fine if they describe the same behavior. [review]
- No conditionals or loops in tests. Use `it.each` for tables. [review]
- Arrange, act, assert, in that order, separated by blank lines.
- No `!`, no `as` casts, no `any` in tests. Fix the types or use a builder. [lint]

## Fixtures

- No shared mutable fixtures (module-level objects mutated across tests). [review]
- Build data with mock builders that take overrides:

```ts
export const mockNote = (overrides: Partial<Note> = {}): Note => ({
  id: '::id::',
  title: '::title::',
  body: '::body::',
  ...overrides,
})
```

- Placeholder values look like `'::title::'`, never realistic fake data. Reason: failures show which field leaked. [review]
- Builders live next to the schema or in a `test/` helper folder; they return schema-typed values.

## React

Use React Testing Library.

- Query priority: `getByRole` -> `getByLabelText` -> `getByTestId` -> `getByText`. Drop to a lower one only when the higher is impossible. [review]
- `userEvent.setup()` per test, never `fireEvent`. [lint]
- Assert what the user sees (text, roles, disabled state), not component internals, props, or hook calls. [review]
- Cover loading, empty, error, and disabled states for each data-driven component. [review]
- Await async UI with `findBy*`/`waitFor`; never fixed sleeps. [review]

```tsx
it('Given an empty title, should block saving the note', async () => {
  const user = userEvent.setup()
  render(<NoteForm onSubmit={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(screen.getByText('Title is required')).toBeVisible()
})
```

## Mocking

- Never `vi.mock` your own modules. Spy on globals (`vi.spyOn(globalThis, 'fetch')`) or inject the dependency. [review]
- `vi.mock` is acceptable only for third-party modules with unavoidable side effects (timers, native APIs). [review]
- Restore spies between tests (`restoreMocks: true` in the shared config).
- Prefer fake time (`vi.useFakeTimers`) over mocking date utilities.

## Backend

Tests exercise the real HTTP flow through router, controller, service, and database.

- Fastify: `app.inject({ method: 'GET', url: '/notes' })`.
- Hono: `app.request('/notes')`.
- Express: `supertest(app).get('/notes')`.
- Next.js: import the route file and call `GET(new Request('http://test/api/notes'))`.
- Database: PGlite or a disposable test database, migrated in setup and reset between tests. Never mock services or repositories. [review]
- Build the app via an `createApp()` factory that tests import; do not start a listening server.
- Cover per endpoint: success, validation failure (422), authorization failure (401/403), not found (404).

```ts
it('Given an unknown note id, should respond not found', async () => {
  const response = await app.inject({ method: 'GET', url: '/notes/::id::' })

  expect(response.statusCode).toBe(404)
})
```

## Coverage rules

- Each acceptance criterion maps to at least one test; name the test in the criterion's words. [review]
- Bug fixes ship a regression test that fails before the fix and keeps the bug id in its name: `it('BH-12: Given a duplicate title, should ...')`. [review]
- Test behavior at the lowest layer that owns it: rules in service specs through HTTP, rendering in component specs.

## What not to test

- Framework internals (Fastify routing, React rendering, Prisma query building).
- Private implementation details: private methods, internal state, call order.
- Snapshot-only tests; assert explicit values instead.
- Trivial getters, type-only files, and constants.
