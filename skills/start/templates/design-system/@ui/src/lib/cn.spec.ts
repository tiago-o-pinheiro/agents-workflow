import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('Given conflicting utilities, should keep the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('Given falsy conditions, should drop them', () => {
    expect(cn('p-2', false, undefined, 'text-sm')).toBe('p-2 text-sm')
  })
})
