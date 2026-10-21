import { type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getReasonPhrase, StatusCodes } from 'http-status-codes'

import { isGlobalError } from './global-error'

type ErrorBody = {
  statusCode: number
  error: string
  message: string
  details?: unknown
}

const toReasonPhrase = (statusCode: number): string => {
  try {
    return getReasonPhrase(statusCode)
  } catch {
    return 'Error'
  }
}

const toErrorBody = (statusCode: number, message: string, details?: unknown): ErrorBody => ({
  statusCode,
  error: toReasonPhrase(statusCode),
  message,
  details,
})

const resolveErrorBody = (error: unknown): ErrorBody => {
  if (isGlobalError(error)) {
    return toErrorBody(error.statusCode, error.message, error.details)
  }
  if (error instanceof HTTPException && error.status < StatusCodes.INTERNAL_SERVER_ERROR) {
    return toErrorBody(error.status, error.message)
  }
  return toErrorBody(StatusCodes.INTERNAL_SERVER_ERROR, 'Internal server error')
}

export const errorHandler = (error: unknown) => {
  const body = resolveErrorBody(error)
  if (body.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
  return Response.json(body, { status: body.statusCode })
}

export const notFoundHandler = (context: Context) => {
  const body = toErrorBody(
    StatusCodes.NOT_FOUND,
    `Route ${context.req.method}:${context.req.path} not found`,
  )
  return Response.json(body, { status: body.statusCode })
}
