import type { OpenClawPluginConfigSchema } from 'openclaw/plugin-sdk/plugin-entry'

export const PLUGIN_ID = 'indream'
export const PLUGIN_NAME = 'Indream'
export const PLUGIN_DESCRIPTION = 'Indream video editor API tools and skills for OpenClaw'

export const DEFAULT_BASE_URL = 'https://api.indream.ai'
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_POLL_INTERVAL_MS = 2_000

export interface IIndreamPluginUploadsConfig {
  allowLocalPaths: boolean
  allowRemoteUrls: boolean
}

export interface IIndreamPluginConfig {
  apiKey?: string
  baseURL: string
  timeoutMs: number
  pollIntervalMs: number
  uploads: IIndreamPluginUploadsConfig
}

export const pluginConfigJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    apiKey: {
      type: 'string',
      minLength: 1,
    },
    baseURL: {
      type: 'string',
      default: DEFAULT_BASE_URL,
    },
    timeoutMs: {
      type: 'integer',
      minimum: 1,
      default: DEFAULT_TIMEOUT_MS,
    },
    pollIntervalMs: {
      type: 'integer',
      minimum: 1,
      default: DEFAULT_POLL_INTERVAL_MS,
    },
    uploads: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowLocalPaths: {
          type: 'boolean',
          default: true,
        },
        allowRemoteUrls: {
          type: 'boolean',
          default: true,
        },
      },
      default: {
        allowLocalPaths: true,
        allowRemoteUrls: true,
      },
    },
  },
} as const

export const pluginConfigUiHints = {
  apiKey: {
    label: 'Indream API key',
    help: 'Used for all requests to the Indream Open API.',
    placeholder: 'indream_...',
    sensitive: true,
  },
  baseURL: {
    label: 'Base URL',
    placeholder: DEFAULT_BASE_URL,
  },
  timeoutMs: {
    label: 'Timeout (ms)',
    advanced: true,
  },
  pollIntervalMs: {
    label: 'Poll interval (ms)',
    advanced: true,
  },
  uploads: {
    label: 'Upload controls',
    advanced: true,
  },
} as const

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const readPositiveInteger = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined
  }

  return value
}

const readOptionalBoolean = (value: unknown) => {
  return typeof value === 'boolean' ? value : undefined
}

export const resolvePluginConfig = (value: unknown): IIndreamPluginConfig => {
  const record = isRecord(value) ? value : {}
  const uploadsRecord = isRecord(record.uploads) ? record.uploads : {}

  return {
    apiKey: readOptionalString(record.apiKey),
    baseURL: readOptionalString(record.baseURL) || DEFAULT_BASE_URL,
    timeoutMs: readPositiveInteger(record.timeoutMs) || DEFAULT_TIMEOUT_MS,
    pollIntervalMs: readPositiveInteger(record.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS,
    uploads: {
      allowLocalPaths: readOptionalBoolean(uploadsRecord.allowLocalPaths) ?? true,
      allowRemoteUrls: readOptionalBoolean(uploadsRecord.allowRemoteUrls) ?? true,
    },
  }
}

export const buildMissingApiKeyMessage = () => {
  return 'Indream plugin is not configured. Set plugins.entries.indream.config.apiKey before using Indream tools.'
}

export const pluginConfigSchema: OpenClawPluginConfigSchema = {
  jsonSchema: pluginConfigJsonSchema as Record<string, unknown>,
  uiHints: pluginConfigUiHints,
  validate(value) {
    if (value === undefined) {
      return {
        ok: true,
      }
    }

    if (!isRecord(value)) {
      return {
        ok: false,
        errors: ['Plugin config must be an object.'],
      }
    }

    const errors: string[] = []
    if (value.apiKey !== undefined && readOptionalString(value.apiKey) === undefined) {
      errors.push('apiKey must be a non-empty string.')
    }

    if (value.baseURL !== undefined && readOptionalString(value.baseURL) === undefined) {
      errors.push('baseURL must be a non-empty string.')
    }

    if (value.timeoutMs !== undefined && readPositiveInteger(value.timeoutMs) === undefined) {
      errors.push('timeoutMs must be a positive integer.')
    }

    if (
      value.pollIntervalMs !== undefined &&
      readPositiveInteger(value.pollIntervalMs) === undefined
    ) {
      errors.push('pollIntervalMs must be a positive integer.')
    }

    if (value.uploads !== undefined) {
      if (!isRecord(value.uploads)) {
        errors.push('uploads must be an object.')
      } else {
        if (
          value.uploads.allowLocalPaths !== undefined &&
          readOptionalBoolean(value.uploads.allowLocalPaths) === undefined
        ) {
          errors.push('uploads.allowLocalPaths must be a boolean.')
        }
        if (
          value.uploads.allowRemoteUrls !== undefined &&
          readOptionalBoolean(value.uploads.allowRemoteUrls) === undefined
        ) {
          errors.push('uploads.allowRemoteUrls must be a boolean.')
        }
      }
    }

    if (errors.length > 0) {
      return {
        ok: false,
        errors,
      }
    }

    return {
      ok: true,
      value: resolvePluginConfig(value),
    }
  },
}
