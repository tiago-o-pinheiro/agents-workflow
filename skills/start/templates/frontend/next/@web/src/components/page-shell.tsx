import { type ReactNode } from 'react'

type PageShellProps = {
  title: string
  description?: string
  children: ReactNode
}

export const PageShell = ({ title, description, children }: PageShellProps) => (
  <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </header>
    {children}
  </main>
)
