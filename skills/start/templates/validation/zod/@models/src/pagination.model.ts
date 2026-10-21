import { z } from 'zod'

export const PAGE_SIZE_MAX = 100
export const PAGE_SIZE_DEFAULT = 20

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
})
export type PaginationQuery = z.infer<typeof PaginationQuery>

export const PaginationMeta = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX),
})
export type PaginationMeta = z.infer<typeof PaginationMeta>

export const PaginationResult = <Item extends z.ZodType>(item: Item) =>
  z.object({
    data: z.array(item),
    meta: PaginationMeta,
  })
export type PaginationResult<Item> = {
  data: Item[]
  meta: PaginationMeta
}
