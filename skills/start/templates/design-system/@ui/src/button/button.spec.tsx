import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('Given a click, should call the handler once', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('Given no type, should not submit surrounding forms', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('Given a loading state, should be busy, disabled and announce the label', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button isLoading loadingLabel="Saving" onClick={onClick}>
        Save
      </Button>,
    )

    const button = screen.getByRole('button', { name: /Saving/ })
    await user.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('Given the disabled prop, should not react to clicks', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('Given a variant and a size, should apply their token utilities', () => {
    render(
      <Button variant="ghost" size="lg">
        Save
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-transparent', 'min-h-12')
  })
})
