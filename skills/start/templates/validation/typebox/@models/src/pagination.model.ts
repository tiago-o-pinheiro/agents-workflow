import { Type, type Static, type TSchema } from 'typebox'

export const PAGE_SIZE_MAX = 100
export const PAGE_SIZE_DEFAULT = 20

export const PaginationQuery = Type.Object({
  page: Type.Integer({ minimum: 1, default: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: PAGE_SIZE_MAX, default: PAGE_SIZE_DEFAULT }),
})
export type PaginationQuery = Static<typeof PaginationQuery>

export const PaginationMeta = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: PAGE_SIZE_MAX }),
})
export type PaginationMeta = Static<typeof PaginationMeta>

export const PaginationResult = <Item extends TSchema>(item: Item) =>
  Type.Object({
    data: Type.Array(item),
    meta: PaginationMeta,
  })
export type PaginationResult<Item> = {
  data: Item[]
  meta: PaginationMeta
}
