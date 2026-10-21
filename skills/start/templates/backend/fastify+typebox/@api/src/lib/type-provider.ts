import {
  type FastifyPluginAsyncTypebox,
  TypeBoxValidatorCompiler,
  type TypeBoxTypeProvider,
} from '@fastify/type-provider-typebox'
import { type FastifyInstance, type FastifySchemaCompiler } from 'fastify'
import { type TSchema } from 'typebox'
import { Value } from 'typebox/value'

export type Router = FastifyPluginAsyncTypebox
export type TypedApp = ReturnType<typeof applyTypeProvider>

const validatorCompiler: FastifySchemaCompiler<TSchema> = (routeSchema) => {
  const validate = TypeBoxValidatorCompiler(routeSchema)
  return (data) => validate(Value.Default(routeSchema.schema, Value.Clone(data)))
}

export const applyTypeProvider = (app: FastifyInstance) => {
  app.setValidatorCompiler(validatorCompiler)
  return app.withTypeProvider<TypeBoxTypeProvider>()
}
