import { serve } from '@hono/node-server'

import { createApp } from '@/app'
import { env } from '@/config/env'

const app = createApp()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  process.stdout.write(`Listening on port ${info.port}\n`)
})
