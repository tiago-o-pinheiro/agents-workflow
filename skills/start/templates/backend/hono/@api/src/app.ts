import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { env } from '@/config/env'
import { errorHandler, notFoundHandler } from '@/errors/error-handler'
import { healthRouter } from '@/modules/health/routers/health.router'

export const createApp = () => {
  const app = new Hono()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  app.route('/health', healthRouter)

  return app
}
