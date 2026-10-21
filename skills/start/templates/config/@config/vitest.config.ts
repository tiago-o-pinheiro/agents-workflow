import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['eslint/**/*.spec.mjs'],
    restoreMocks: true,
  },
})
