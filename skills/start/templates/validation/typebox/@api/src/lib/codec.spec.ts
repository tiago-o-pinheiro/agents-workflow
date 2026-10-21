import { Type } from 'typebox'
import { describe, expect, it } from 'vitest'

import { coerce } from './codec'

const Query = Type.Object({
  page: Type.Integer({ default: 1 }),
  search: Type.Optional(Type.String()),
})

describe('coerce', () => {
  it('Given a plain integer string, should convert it to a number', () => {
    expect(coerce(Query, { page: '2' })).toEqual({ page: 2 })
  })

  it('Given a missing value with a default, should apply the default', () => {
    expect(coerce(Query, {})).toEqual({ page: 1 })
  })

  it.each(['1.5', '0x10', '1e3'])(
    'Given page %s, should keep the raw string so validation rejects it',
    (page) => {
      expect(coerce(Query, { page })).toEqual({ page })
    },
  )

  it('Given a numeric string for a string field, should keep it a string', () => {
    expect(coerce(Query, { page: '1', search: '123' })).toEqual({ page: 1, search: '123' })
  })
})
