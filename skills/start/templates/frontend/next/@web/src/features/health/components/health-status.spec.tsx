import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HealthStatus } from './health-status'

const healthResponse = () =>
  Response.json({ status: 'ok', uptime: 1, timestamp: '2026-01-01T00:00:00.000Z' })

describe('HealthStatus', () => {
  it('Given a pending request, should show a loading placeholder', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined))
    render(<HealthStatus />)

    expect(screen.getByRole('status', { name: 'Checking API status' })).toBeVisible()
  })

  it('Given a healthy api, should tell the user it is online', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(healthResponse())
    render(<HealthStatus />)

    expect(await screen.findByText('The API is online.')).toBeVisible()
  })

  it('Given an unhealthy api, should show a human message with a retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }))
    render(<HealthStatus />)

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the API.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('Given a failed check, should recover when the user retries', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('::offline::'))
      .mockResolvedValueOnce(healthResponse())
    render(<HealthStatus />)

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('The API is online.')).toBeVisible()
  })
})
