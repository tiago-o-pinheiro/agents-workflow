import { StatusCodes } from 'http-status-codes'

import { GlobalError } from './global-error'

export class NotFoundError extends GlobalError {
  constructor(message = 'Not found', details?: unknown) {
    super(message, StatusCodes.NOT_FOUND, details)
  }
}

export class ConflictError extends GlobalError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, StatusCodes.CONFLICT, details)
  }
}

export class ValidationError extends GlobalError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, StatusCodes.UNPROCESSABLE_ENTITY, details)
  }
}

export class ForbiddenError extends GlobalError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, StatusCodes.FORBIDDEN, details)
  }
}

export class UnauthorizedError extends GlobalError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, StatusCodes.UNAUTHORIZED, details)
  }
}
