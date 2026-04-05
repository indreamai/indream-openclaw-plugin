import { APIError } from '@indreamai/client'

export interface IToolFailurePayload {
  status: 'failed'
  message: string
  detail: string
  errorName?: string
  errorCode?: string
  errorType?: string
  httpStatus?: number
  retriable?: boolean
}

const stringifyPayload = (payload: unknown) => {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export const createJsonResult = <T>(payload: T) => {
  return {
    content: [
      {
        type: 'text' as const,
        text: stringifyPayload(payload),
      },
    ],
    details: payload,
  }
}

export const normalizeToolError = (error: unknown): IToolFailurePayload => {
  // Normalize tool failures so the model does not receive raw SDK or runtime stack traces.
  if (error instanceof APIError) {
    return {
      status: 'failed',
      message: error.message,
      detail: error.detail,
      errorName: error.name,
      errorCode: error.errorCode,
      errorType: error.type,
      httpStatus: error.status,
      retriable: error.status === 429 || error.status >= 500,
    }
  }

  if (error instanceof Error) {
    return {
      status: 'failed',
      message: error.message,
      detail: error.message,
      errorName: error.name,
    }
  }

  return {
    status: 'failed',
    message: 'Unknown plugin error',
    detail: 'Unknown plugin error',
  }
}

export const createErrorResult = (error: unknown) => {
  return createJsonResult(normalizeToolError(error))
}
