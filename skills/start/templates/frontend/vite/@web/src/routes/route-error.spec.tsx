import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { RouteError } from './route-error'

describe('RouteError', () => {
  it('Given a failure, should explain it in plain language and offer a retry', () => {
    const router = createMemoryRouter([{ path: '/', element: <RouteError /> }])
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading', { name: 'Something went wrong on our side' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })
})
