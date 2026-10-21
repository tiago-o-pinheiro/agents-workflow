import { Type, type Static } from 'typebox'
import { Value } from 'typebox/value'

export const Health = Type.Object({
  status: Type.Literal('ok'),
  uptime: Type.Number({ minimum: 0 }),
  timestamp: Type.String({ format: 'date-time' }),
})
export type Health = Static<typeof Health>

export const isHealth = (value: unknown): value is Health => Value.Check(Health, value)
