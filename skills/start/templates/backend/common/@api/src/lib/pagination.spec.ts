import { describe, expect, it } from 'vitest'

import { toPagination, toPaginationMeta } from './pagination'

describe('toPagination', () => {
  it('Given the first page, should skip nothing', () => {
    expect(toPagination({ page: 1, pageSize: 20 })).toEqual({ take: 20, skip: 0 })
  })

  it('Given the third page of ten, should skip twenty rows', () => {
    expect(toPagination({ page: 3, pageSize: 10 })).toEqual({ take: 10, skip: 20 })
  })
})

describe('toPaginationMeta', () => {
  it('Given a total and a query, should echo page and size with the total', () => {
    expect(toPaginationMeta(45, { page: 2, pageSize: 10 })).toEqual({
      total: 45,
      page: 2,
      pageSize: 10,
    })
  })
})
