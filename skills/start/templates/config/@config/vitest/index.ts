import { defineConfig, type ViteUserConfig } from 'vitest/config'

type VitestEnvironment = 'node' | 'jsdom' | 'happy-dom'

type CreateVitestConfigOptions = {
  root: string
  environment?: VitestEnvironment
  setupFiles?: readonly string[]
  plugins?: ViteUserConfig['plugins']
  inlineDeps?: readonly string[]
}

export const createVitestConfig = ({
  root,
  environment = 'node',
  setupFiles = [],
  plugins = [],
  inlineDeps = [],
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
      ...(inlineDeps.length > 0 ? { server: { deps: { inline: [...inlineDeps] } } } : {}),
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.spec.{ts,tsx}'],
      },
    },
  })
