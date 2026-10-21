import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { routes } from './routes'

describe('routes', () => {
  it('Given an unknown address, should show the not-found page with a way home', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/missing'] })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading', { name: 'We could not find that page' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })
})
