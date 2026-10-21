import { StatusCodes } from 'http-status-codes'
import { describe, expect, it } from 'vitest'

import { GlobalError, isGlobalError } from './global-error'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './http-errors'

describe('http errors', () => {
  it.each([
    ['NotFoundError', new NotFoundError(), StatusCodes.NOT_FOUND],
    ['ConflictError', new ConflictError(), StatusCodes.CONFLICT],
    ['ValidationError', new ValidationError(), StatusCodes.UNPROCESSABLE_ENTITY],
    ['ForbiddenError', new ForbiddenError(), StatusCodes.FORBIDDEN],
    ['UnauthorizedError', new UnauthorizedError(), StatusCodes.UNAUTHORIZED],
  ])('Given a %s, should carry its http status code', (_name, error, statusCode) => {
    expect(error.statusCode).toBe(statusCode)
  })

  it('Given a custom message and details, should keep both on the error', () => {
    const error = new ConflictError('::message::', { field: '::field::' })

    expect(error.message).toBe('::message::')
    expect(error.details).toEqual({ field: '::field::' })
  })

  it('Given a subclass instance, should recognise it as a global error', () => {
    expect(isGlobalError(new NotFoundError())).toBe(true)
  })

  it('Given a plain error, should not recognise it as a global error', () => {
    expect(isGlobalError(new Error('::message::'))).toBe(false)
  })

  it('Given a global error, should name itself after its class', () => {
    expect(new GlobalError('::message::', StatusCodes.BAD_REQUEST).name).toBe('GlobalError')
    expect(new NotFoundError().name).toBe('NotFoundError')
  })
})
