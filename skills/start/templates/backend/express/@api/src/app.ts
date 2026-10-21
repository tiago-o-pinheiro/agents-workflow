import cors from 'cors'
import express from 'express'

import { env } from '@/config/env'
import { errorHandler, notFoundHandler } from '@/errors/error-handler'
import { healthRouter } from '@/modules/health/routers/health.router'

export const createApp = () => {
  const app = express()

  app.use(cors({ origin: env.CORS_ORIGIN }))
  app.use(express.json())
  app.use('/health', healthRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
