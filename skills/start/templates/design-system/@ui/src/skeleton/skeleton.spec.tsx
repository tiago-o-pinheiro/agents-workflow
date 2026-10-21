import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './skeleton'

describe('Skeleton', () => {
  it('Given size classes, should merge them over the defaults and hide from assistive tech', () => {
    render(<Skeleton data-testid="skeleton" className="h-4 w-32" />)

    const skeleton = screen.getByTestId('skeleton')

    expect(skeleton).toHaveClass('bg-muted', 'h-4', 'w-32')
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
  })
})
