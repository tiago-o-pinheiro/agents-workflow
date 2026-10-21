import { type NextFunction, type Request, type Response } from 'express'
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

const isClientError = (error: unknown): error is Error & { statusCode: number } =>
  error instanceof Error &&
  'statusCode' in error &&
  typeof error.statusCode === 'number' &&
  error.statusCode >= StatusCodes.BAD_REQUEST &&
  error.statusCode < StatusCodes.INTERNAL_SERVER_ERROR

const resolveErrorBody = (error: unknown): ErrorBody => {
  if (isGlobalError(error)) {
    return toErrorBody(error.statusCode, error.message, error.details)
  }
  if (isClientError(error)) {
    return toErrorBody(error.statusCode, error.message)
  }
  return toErrorBody(StatusCodes.INTERNAL_SERVER_ERROR, 'Internal server error')
}

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) => {
  const body = resolveErrorBody(error)
  if (body.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  }
  response.status(body.statusCode).json(body)
}

export const notFoundHandler = (request: Request, response: Response) => {
  const body = toErrorBody(
    StatusCodes.NOT_FOUND,
    `Route ${request.method}:${request.path} not found`,
  )
  response.status(body.statusCode).json(body)
}
