import { describe, expect, it, vi, type MockInstance } from 'vitest'

import { ApiError, createApiClient, type Decoder } from './api-client'

const BASE_URL = 'http://api.test'

const decodeAsIs: Decoder<unknown> = (raw) => raw

const lastRequest = (spy: MockInstance<typeof fetch>) => {
  const [url, init] = spy.mock.lastCall ?? []
  return { url, init }
}

describe('createApiClient', () => {
  it('Given a json response, should return it through the decoder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ name: '::name::' }))
    const client = createApiClient({ baseUrl: BASE_URL })

    const result = await client.get('/things/1', decodeAsIs)

    expect(result).toEqual({ name: '::name::' })
  })

  it('Given a path, should request it under the base url with the method', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
    const client = createApiClient({ baseUrl: BASE_URL })

    await client.get('/things', decodeAsIs)

    expect(lastRequest(spy).url).toBe('http://api.test/things')
    expect(lastRequest(spy).init?.method).toBe('GET')
  })

  it('Given a token provider, should send a bearer authorization header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
    const client = createApiClient({ baseUrl: BASE_URL, getToken: () => '::token::' })

    await client.get('/things', decodeAsIs)

    expect(new Headers(lastRequest(spy).init?.headers).get('Authorization')).toBe(
      'Bearer ::token::',
    )
  })

  it('Given no token, should not send an authorization header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
    const client = createApiClient({ baseUrl: BASE_URL, getToken: () => null })

    await client.get('/things', decodeAsIs)

    expect(new Headers(lastRequest(spy).init?.headers).has('Authorization')).toBe(false)
  })

  it.each([
    ['post', 'POST'],
    ['patch', 'PATCH'],
  ] as const)('Given a %s with a body, should send it as json', async (name, method) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: '::id::' }))
    const client = createApiClient({ baseUrl: BASE_URL })

    const result = await client[name]('/things', { title: '::title::' }, decodeAsIs)

    expect(result).toEqual({ id: '::id::' })
    expect(lastRequest(spy).init?.method).toBe(method)
    expect(lastRequest(spy).init?.body).toBe(JSON.stringify({ title: '::title::' }))
    expect(new Headers(lastRequest(spy).init?.headers).get('Content-Type')).toBe(
      'application/json',
    )
  })

  it('Given an empty response on delete, should resolve without a value', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    const client = createApiClient({ baseUrl: BASE_URL })

    await expect(client.delete('/things/1')).resolves.toBeUndefined()
    expect(lastRequest(spy).init?.method).toBe('DELETE')
  })

  it('Given an error body from the api, should throw an ApiError with status, message and details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        { statusCode: 422, error: 'Unprocessable Entity', message: '::message::', details: ['::detail::'] },
        { status: 422 },
      ),
    )
    const client = createApiClient({ baseUrl: BASE_URL })

    const failure = await client.get('/things', decodeAsIs).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 422, message: '::message::', details: ['::detail::'] })
  })

  it('Given an error without a json body, should throw an ApiError naming the status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('::html::', { status: 502 }))
    const client = createApiClient({ baseUrl: BASE_URL })

    const failure = await client.get('/things', decodeAsIs).catch((error: unknown) => error)

    expect(failure).toMatchObject({ status: 502, message: 'Request failed with status 502' })
  })

  it('Given a network failure, should throw an ApiError with status zero', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('::offline::'))
    const client = createApiClient({ baseUrl: BASE_URL })

    const failure = await client.get('/things', decodeAsIs).catch((error: unknown) => error)

    expect(failure).toMatchObject({ status: 0, message: 'Network request failed' })
  })
})
