import { describe, expect, it } from 'vitest'

import { isHealth } from './health.model'

describe('Health', () => {
  it('Given a complete health payload, should recognise it', () => {
    const payload = { status: 'ok', uptime: 12.5, timestamp: '2026-01-01T00:00:00.000Z' }

    expect(isHealth(payload)).toBe(true)
  })

  it('Given a payload with an invalid timestamp, should reject it', () => {
    const payload = { status: 'ok', uptime: 12.5, timestamp: '::timestamp::' }

    expect(isHealth(payload)).toBe(false)
  })

  it('Given a payload with a negative uptime, should reject it', () => {
    const payload = { status: 'ok', uptime: -1, timestamp: '2026-01-01T00:00:00.000Z' }

    expect(isHealth(payload)).toBe(false)
  })
})
