import { type FastifyReply, type FastifyRequest } from 'fastify'
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

const isFrameworkValidationError = (error: unknown): error is Error & { validation: unknown } =>
  error instanceof Error && 'validation' in error

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
  if (isFrameworkValidationError(error)) {
    return toErrorBody(StatusCodes.UNPROCESSABLE_ENTITY, error.message, error.validation)
  }
  if (isClientError(error)) {
    return toErrorBody(error.statusCode, error.message)
  }
  return toErrorBody(StatusCodes.INTERNAL_SERVER_ERROR, 'Internal server error')
}

export const errorHandler = (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
  const body = resolveErrorBody(error)
  if (body.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    request.log.error(error)
  }
  return reply.status(body.statusCode).send(body)
}
