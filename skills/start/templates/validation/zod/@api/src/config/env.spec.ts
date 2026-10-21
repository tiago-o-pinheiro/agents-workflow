import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

describe('parseEnv', () => {
  it('Given no variables, should fall back to the defaults', () => {
    const env = parseEnv({})

    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBeGreaterThan(0)
  })

  it('Given a numeric string port, should convert it to a number', () => {
    const env = parseEnv({ PORT: '4010' })

    expect(env.PORT).toBe(4010)
  })

  it('Given invalid variables, should name each of them in the error', () => {
    const parse = () => parseEnv({ PORT: '::port::', NODE_ENV: '::env::' })

    expect(parse).toThrow(/PORT/)
    expect(parse).toThrow(/NODE_ENV/)
  })
})
