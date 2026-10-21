import { type Router } from '@/lib/type-provider'
import { healthController } from '@/modules/health/controllers/health.controller'
import { getHealthApiSchema } from '@/modules/health/schemas/health.api-schema'

export const healthRouter: Router = async (app) => {
  app.get('/', { schema: getHealthApiSchema }, healthController.getHealth)
}
