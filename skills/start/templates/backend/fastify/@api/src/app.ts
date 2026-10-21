import cors from '@fastify/cors'
import { fastify } from 'fastify'

import { env } from '@/config/env'
import { errorHandler } from '@/errors/error-handler'
import { applyTypeProvider } from '@/lib/type-provider'
import { healthRouter } from '@/modules/health/routers/health.router'

export const createApp = async () => {
  const app = applyTypeProvider(fastify({ logger: env.NODE_ENV !== 'test' }))

  app.setErrorHandler(errorHandler)
  await app.register(cors, { origin: env.CORS_ORIGIN })
  await app.register(healthRouter, { prefix: '/health' })

  return app
}
