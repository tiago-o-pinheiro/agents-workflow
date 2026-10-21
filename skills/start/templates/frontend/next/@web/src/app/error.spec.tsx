import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ErrorPage from './error'

describe('ErrorPage', () => {
  it('Given a failure, should explain it in plain language and offer a retry', async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    render(<ErrorPage reset={reset} />)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByRole('heading', { name: 'Something went wrong on our side' })).toBeVisible()
    expect(reset).toHaveBeenCalledOnce()
  })
})
