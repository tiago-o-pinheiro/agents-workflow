export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.status = status
    this.details = details
  }
}

export type Decoder<Output> = (raw: unknown) => Output

export type ApiClientOptions = {
  baseUrl: string
  getToken?: () => string | null | undefined
}

export type ApiClient = {
  get: <Output>(path: string, decode: Decoder<Output>) => Promise<Output>
  post: <Output>(path: string, body: unknown, decode: Decoder<Output>) => Promise<Output>
  patch: <Output>(path: string, body: unknown, decode: Decoder<Output>) => Promise<Output>
  delete: (path: string) => Promise<void>
}

type ErrorBody = { message: string; details?: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isErrorBody = (value: unknown): value is ErrorBody =>
  isRecord(value) && typeof value['message'] === 'string'

const parseText = (text: string): unknown => {
  if (text === '') {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const toApiError = (status: number, payload: unknown): ApiError => {
  if (isErrorBody(payload)) {
    return new ApiError(payload.message, status, payload.details)
  }
  return new ApiError(`Request failed with status ${status}`, status, payload)
}

export const createApiClient = ({ baseUrl, getToken }: ApiClientOptions): ApiClient => {
  const send = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const token = getToken?.()
    const headers = new Headers()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((cause: unknown) => {
      throw new ApiError('Network request failed', 0, cause)
    })

    const payload = parseText(await response.text())
    if (!response.ok) {
      throw toApiError(response.status, payload)
    }
    return payload
  }

  return {
    get: async (path, decode) => decode(await send('GET', path)),
    post: async (path, body, decode) => decode(await send('POST', path, body)),
    patch: async (path, body, decode) => decode(await send('PATCH', path, body)),
    delete: async (path) => {
      await send('DELETE', path)
    },
  }
}
