export class AppError extends Error {
  readonly status: number
  readonly code?: string
  readonly expose: boolean

  constructor(
    message: string,
    status = 500,
    options: { code?: string; expose?: boolean; cause?: unknown } = {}
  ) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.code = options.code
    this.expose = options.expose ?? status < 500
    if (options.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

type HttpErrorShape = {
  status: number
  message: string
  code?: string
}

export function toHttpErrorShape(
  error: unknown,
  fallbackMessage = "Internal server error"
): HttpErrorShape {
  if (error instanceof AppError) {
    return {
      status: error.status,
      message: error.expose ? error.message : fallbackMessage,
      code: error.code,
    }
  }

  return {
    status: 500,
    message: fallbackMessage,
  }
}
