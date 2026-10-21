import { createApp } from '@/app'
import { env } from '@/config/env'

const app = createApp()

app.listen(env.PORT, () => {
  process.stdout.write(`Listening on port ${env.PORT}\n`)
})
