import { defineConfig, type ViteUserConfig } from 'vitest/config'

type VitestEnvironment = 'node' | 'jsdom' | 'happy-dom'

type CreateVitestConfigOptions = {
  root: string
  environment?: VitestEnvironment
  setupFiles?: readonly string[]
  plugins?: ViteUserConfig['plugins']
}

export const createVitestConfig = ({
  root,
  environment = 'node',
  setupFiles = [],
  plugins = [],
}: CreateVitestConfigOptions) =>
  defineConfig({
    plugins,
    resolve: {
      alias: { '@': `${root}/src` },
    },
    test: {
      environment,
      setupFiles: [...setupFiles],
      include: ['src/**/*.spec.{ts,tsx}'],
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.spec.{ts,tsx}'],
      },
    },
  })
