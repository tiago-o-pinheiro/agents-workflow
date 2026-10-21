import { z } from 'zod'

export const Health = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
})
export type Health = z.infer<typeof Health>

export const isHealth = (value: unknown): value is Health => Health.safeParse(value).success
