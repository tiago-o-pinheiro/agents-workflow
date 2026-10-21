import { describe, expect, it } from 'vitest'

import { isLocale, t } from './index'

describe('i18n', () => {
  it('Given a known key, should return the english message', () => {
    expect(t('common.retry')).toBe('Retry')
  })

  it('Given a supported locale, should accept it', () => {
    expect(isLocale('en')).toBe(true)
  })

  it('Given an unsupported value, should reject it', () => {
    expect(isLocale('xx')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
