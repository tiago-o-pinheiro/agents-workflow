export class GlobalError extends Error {
  readonly statusCode: number
  readonly details?: unknown

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.details = details
  }
}

export const isGlobalError = (value: unknown): value is GlobalError =>
  value instanceof GlobalError
