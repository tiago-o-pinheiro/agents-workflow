import {
  type ContextConfigDefault,
  type FastifyBaseLogger,
  type FastifySchema,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
  type RouteGenericInterface,
  type RouteHandlerMethod,
} from 'fastify'
import { type ZodTypeProvider } from 'fastify-type-provider-zod'

export type Handler<Schema extends FastifySchema> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RouteGenericInterface,
  ContextConfigDefault,
  Schema,
  ZodTypeProvider,
  FastifyBaseLogger
>
