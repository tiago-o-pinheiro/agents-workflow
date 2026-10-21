import { describe, expect, it } from 'vitest'

import { PAGE_SIZE_MAX, PaginationQuery } from './pagination.model'

describe('PaginationQuery', () => {
  it('Given an empty query, should fall back to the first page with the default size', () => {
    const query = PaginationQuery.parse({})

    expect(query).toEqual({ page: 1, pageSize: 20 })
  })

  it('Given string values from a query string, should convert them to numbers', () => {
    const query = PaginationQuery.parse({ page: '2', pageSize: '10' })

    expect(query).toEqual({ page: 2, pageSize: 10 })
  })

  it('Given a page size above the maximum, should reject it', () => {
    const result = PaginationQuery.safeParse({ page: 1, pageSize: PAGE_SIZE_MAX + 1 })

    expect(result.success).toBe(false)
  })

  it('Given a page below one, should reject it', () => {
    const result = PaginationQuery.safeParse({ page: 0, pageSize: 10 })

    expect(result.success).toBe(false)
  })
})
