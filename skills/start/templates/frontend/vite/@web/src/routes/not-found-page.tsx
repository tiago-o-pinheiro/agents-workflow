import { Link } from 'react-router'

export const NotFoundPage = () => (
  <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-4 p-6">
    <h1 className="text-2xl font-semibold">We could not find that page</h1>
    <p className="text-muted-foreground">It may have moved, or the address may be mistyped.</p>
    <Link
      to="/"
      className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Back to home
    </Link>
  </main>
)
