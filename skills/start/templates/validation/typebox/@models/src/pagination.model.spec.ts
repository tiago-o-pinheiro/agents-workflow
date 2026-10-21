import { Value } from 'typebox/value'
import { describe, expect, it } from 'vitest'

import { PAGE_SIZE_MAX, PaginationQuery } from './pagination.model'

describe('PaginationQuery', () => {
  it('Given an empty query, should fall back to the first page with the default size', () => {
    const query = Value.Default(PaginationQuery, {})

    expect(query).toEqual({ page: 1, pageSize: 20 })
  })

  it('Given a page size above the maximum, should reject it', () => {
    const query = { page: 1, pageSize: PAGE_SIZE_MAX + 1 }

    expect(Value.Check(PaginationQuery, query)).toBe(false)
  })

  it('Given a page below one, should reject it', () => {
    const query = { page: 0, pageSize: 10 }

    expect(Value.Check(PaginationQuery, query)).toBe(false)
  })
})
