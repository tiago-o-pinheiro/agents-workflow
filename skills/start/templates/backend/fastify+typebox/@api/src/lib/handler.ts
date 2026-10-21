import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
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

export type Handler<Schema extends FastifySchema> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RouteGenericInterface,
  ContextConfigDefault,
  Schema,
  TypeBoxTypeProvider,
  FastifyBaseLogger
>
