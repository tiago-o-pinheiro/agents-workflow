import en from './en.json'
import { createTranslator } from './translator'

export type TranslationKey = keyof typeof en

export const SUPPORTED_LOCALES = ['en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const isLocale = (value: unknown): value is Locale =>
  SUPPORTED_LOCALES.some((locale) => locale === value)

export const t = createTranslator<TranslationKey>(en)

export { createTranslator } from './translator'
export type { Variables } from './translator'
