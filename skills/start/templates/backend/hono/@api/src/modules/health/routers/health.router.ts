import { Hono } from 'hono'

import { healthController } from '@/modules/health/controllers/health.controller'

export const healthRouter = new Hono().get('/', healthController.getHealth)
