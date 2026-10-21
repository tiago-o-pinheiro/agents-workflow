import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import importX from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import { hookShape } from './rules/hook-shape.mjs'

const IGNORES = [
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/node_modules/**',
  '**/next-env.d.ts',
  'scripts/check.mjs',
]

const TS_FILES = ['**/*.{ts,tsx,mts,cts}']
const SOURCE_FILES = ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}']
const HOOK_FILES = ['**/*.tsx', '**/hooks/**/*.ts', '**/use-*.ts']
const CONFIG_FILES = ['**/*.config.*', 'eslint.config.mjs']
const FRAMEWORK_DEFAULT_EXPORTS = [
  '**/app/**/{page,layout,error,not-found,loading,global-error,template,default}.tsx',
  '**/app/**/{sitemap,robots,manifest}.ts',
  ...CONFIG_FILES,
]
const VIRTUAL_PACKAGES = ['models', 'core', 'tokens', 'ui', 'i18n', 'design-system']

const normalizeDir = (dir) => (dir === '.' ? '' : dir.replace(/\/$/, ''))
const inDir = (dir) => (dir ? `${dir}/**` : '**')

const importOrder = (scope) => ({
  groups: ['builtin', 'external', 'internal', 'unknown', ['parent', 'sibling', 'index']],
  pathGroups: [
    { pattern: `${scope}/**`, group: 'internal' },
    ...VIRTUAL_PACKAGES.flatMap((name) => [
      { pattern: `@/${name}`, group: 'internal' },
      { pattern: `@/${name}/**`, group: 'internal' },
    ]),
    { pattern: '@/**', group: 'unknown' },
  ],
  pathGroupsExcludedImportTypes: ['builtin'],
  'newlines-between': 'always',
  alphabetize: { order: 'asc', caseInsensitive: true },
})

const devPlugin = { meta: { name: 'dev' }, rules: { 'hook-shape': hookShape } }

const baseRules = {
  'func-style': ['error', 'expression'],
  'prefer-arrow-callback': 'error',
  'no-restricted-syntax': [
    'error',
    { selector: 'TSEnumDeclaration', message: 'Use an as const array and a derived union.' },
    { selector: 'FunctionDeclaration', message: 'Use an arrow function.' },
  ],
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  'import-x/consistent-type-specifier-style': ['error', 'prefer-inline'],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/ban-ts-comment': [
    'error',
    { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
  ],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-console': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  'unicorn/filename-case': ['error', { case: 'kebabCase' }],
}

const typeAwareRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
}

export const createEslintConfig = ({
  rootDir,
  scope,
  frontend = 'none',
  webDir = '',
  apiDir = '',
  envFile = '',
}) => {
  const hasFrontend = frontend !== 'none'
  const web = normalizeDir(webDir)
  const api = normalizeDir(apiDir)

  const blocks = [
    { name: 'dev/ignores', ignores: IGNORES },
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
      name: 'dev/base',
      files: SOURCE_FILES,
      languageOptions: { globals: { ...globals.node } },
      plugins: { 'import-x': importX, unicorn },
      rules: { ...baseRules, 'import-x/order': ['error', importOrder(scope)] },
    },
    {
      name: 'dev/type-aware',
      files: TS_FILES,
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDir,
        },
      },
      rules: typeAwareRules,
    },
    {
      name: 'dev/hook-shape',
      files: TS_FILES,
      plugins: { dev: devPlugin },
      rules: { 'dev/hook-shape': 'error' },
    },
    {
      name: 'dev/default-exports',
      files: SOURCE_FILES,
      plugins: { 'import-x': importX },
      rules: { 'import-x/no-default-export': 'error' },
    },
    {
      name: 'dev/default-exports-allowed',
      files: FRAMEWORK_DEFAULT_EXPORTS,
      rules: { 'import-x/no-default-export': 'off' },
    },
    {
      name: 'dev/no-raw-process-env',
      files: TS_FILES,
      ignores: [...CONFIG_FILES, ...(envFile ? [envFile] : [])],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'env',
            message: 'Import the parsed env object from the env module.',
          },
        ],
      },
    },
  ]

  if (hasFrontend) {
    blocks.push(
      {
        name: 'dev/react-hooks',
        files: HOOK_FILES,
        plugins: { 'react-hooks': reactHooks },
        rules: { ...reactHooks.configs.flat.recommended.rules },
      },
      {
        name: 'dev/browser-globals',
        files: ['**/*.tsx'],
        languageOptions: { globals: { ...globals.browser } },
      },
    )
  }

  if (frontend === 'next') {
    blocks.push({
      name: 'dev/next',
      files: [inDir(web)],
      plugins: { '@next/next': nextPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    })
  }

  if (api) {
    blocks.push({
      name: 'dev/api-controllers-no-orm',
      files: [`${api}/**/controllers/**/*.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@prisma/client', 'drizzle-orm', 'drizzle-orm/*', '@/lib/db'],
                message: 'Controllers never touch the ORM. Call a service.',
              },
            ],
          },
        ],
      },
    })
  }

  return blocks
}
