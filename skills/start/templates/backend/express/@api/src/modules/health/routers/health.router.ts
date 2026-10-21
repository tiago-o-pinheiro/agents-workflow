import { Router } from 'express'

import { healthController } from '@/modules/health/controllers/health.controller'

export const healthRouter = Router()

healthRouter.get('/', healthController.getHealth)
