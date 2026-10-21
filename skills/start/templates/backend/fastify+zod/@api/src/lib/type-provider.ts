import { type FastifyInstance } from 'fastify'
import {
  type FastifyPluginAsyncZod,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

export type Router = FastifyPluginAsyncZod
export type TypedApp = ReturnType<typeof applyTypeProvider>

export const applyTypeProvider = (app: FastifyInstance) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  return app.withTypeProvider<ZodTypeProvider>()
}
