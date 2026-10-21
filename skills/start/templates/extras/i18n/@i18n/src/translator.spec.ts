import { describe, expect, it } from 'vitest'

import { createTranslator } from './translator'

const messages = { greeting: 'Hello, {{name}}!', plain: 'Plain text' }

describe('createTranslator', () => {
  it('Given a key without variables, should return the message', () => {
    const t = createTranslator(messages)

    expect(t('plain')).toBe('Plain text')
  })

  it('Given a message with placeholders, should interpolate the variables', () => {
    const t = createTranslator(messages)

    expect(t('greeting', { name: 'Ada' })).toBe('Hello, Ada!')
  })

  it('Given a missing variable, should keep the placeholder', () => {
    const t = createTranslator(messages)

    expect(t('greeting', {})).toBe('Hello, {{name}}!')
  })

  it('Given an unknown key, should fall back to the key', () => {
    const t = createTranslator<string>(messages)

    expect(t('missing')).toBe('missing')
  })
})
