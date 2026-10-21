import { createApp } from '@/app'
import { env } from '@/config/env'

const app = await createApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
