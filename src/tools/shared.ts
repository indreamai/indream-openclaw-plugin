import { IndreamClient, type TEditorStateV1 } from '@indreamai/client'
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from 'openclaw/plugin-sdk/plugin-entry'
import {
  DEFAULT_BASE_URL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  buildMissingApiKeyMessage,
  resolvePluginConfig,
  type IIndreamPluginConfig,
} from '../config'
import { createErrorResult, createJsonResult } from '../results'
import { resolveUploadSource } from '../upload-source'

export const EXPORT_RATIO_VALUES = ['16:9', '9:16', '1:1', '4:3', '3:4', 'custom'] as const
export const EXPORT_FORMAT_VALUES = ['mp4', 'webm'] as const
export const FPS_VALUES = [30, 60] as const

export interface IRegisterToolRecord {
  name: string
  optional: boolean
}

export interface IRegisteredToolsSummary {
  required: IRegisterToolRecord[]
  optional: IRegisterToolRecord[]
}

export interface IIndreamToolDeps {
  createClient?: (config: IIndreamPluginConfig) => IIndreamClientLike
  fetchFn?: typeof fetch
}

export type TLooseTool = Omit<AnyAgentTool, 'label'> & {
  label?: string
}

export type TLooseToolFactory = (
  ctx: OpenClawPluginToolContext
) => TLooseTool | TLooseTool[] | null | undefined

export interface IIndreamClientLike {
  editor: {
    capabilities: () => Promise<unknown>
    validate: (editorState: TEditorStateV1) => Promise<unknown>
  }
  illustrations: {
    search: (q?: string) => Promise<string[]>
  }
  projects: {
    create: (
      payload: {
        title?: string
        description?: string | null
        editorState: TEditorStateV1
        stateVersion?: string
      },
      options?: { idempotencyKey?: string }
    ) => Promise<unknown>
    list: (params?: { pageSize?: number; pageCursor?: string }) => Promise<unknown>
    get: (projectId: string) => Promise<unknown>
    sync: (
      projectId: string,
      payload: { editorState: TEditorStateV1; stateVersion?: string }
    ) => Promise<unknown>
  }
  assets: {
    get: (assetId: string) => Promise<unknown>
  }
  exports: {
    create: (
      payload: {
        clientTaskId?: string
        editorState: TEditorStateV1
        stateVersion?: string
        fps: 30 | 60
        compositionWidth?: number
        compositionHeight?: number
        ratio: (typeof EXPORT_RATIO_VALUES)[number]
        scale: number
        format: (typeof EXPORT_FORMAT_VALUES)[number]
        callbackUrl?: string
        callbackHeaders?: Record<string, string>
      },
      options?: { idempotencyKey?: string }
    ) => Promise<unknown>
    get: (taskId: string) => Promise<unknown>
    list: (params?: {
      pageSize?: number
      pageCursor?: string
      createdByApiKeyId?: string
    }) => Promise<unknown>
    wait: (
      taskId: string,
      options?: { timeoutMs?: number; pollIntervalMs?: number }
    ) => Promise<unknown>
  }
  uploads: {
    upload: (
      body: Buffer,
      options: { filename: string; contentType: string; projectId?: string }
    ) => Promise<{
      assetId: string
      type: string
      source: string | null
      filename: string
      mimetype: string
      size: number | null
      fileUrl: string
      fileKey: string
      width: number | null
      height: number | null
      duration: number | null
    }>
  }
}

export const readRecord = (value: unknown) => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export const readOptionalString = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export const readRequiredString = (params: Record<string, unknown>, key: string) => {
  const value = readOptionalString(params, key)
  if (!value) {
    throw new Error(key + ' is required.')
  }
  return value
}

export const readOptionalStringArray = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value
    .map((entry) => (typeof entry === 'string' && entry.trim() ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry))
  return items.length > 0 ? items : undefined
}

export const readOptionalInteger = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined
  }
  return value
}

export const readRequiredNumber = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(key + ' is required.')
  }
  return value
}

export const readOptionalLiteralString = <T extends readonly string[]>(
  params: Record<string, unknown>,
  key: string,
  values: T
) => {
  const value = readOptionalString(params, key)
  if (!value) {
    return undefined
  }
  if (!values.includes(value as T[number])) {
    throw new Error(key + ' must be one of ' + values.join(', ') + '.')
  }
  return value as T[number]
}

export const readRequiredLiteralString = <T extends readonly string[]>(
  params: Record<string, unknown>,
  key: string,
  values: T
): T[number] => {
  const value = readRequiredString(params, key)
  if (!values.includes(value as T[number])) {
    throw new Error(key + ' must be one of ' + values.join(', ') + '.')
  }
  return value as T[number]
}

export const readRequiredLiteralNumber = <T extends readonly number[]>(
  params: Record<string, unknown>,
  key: string,
  values: T
): T[number] => {
  const value = readRequiredNumber(params, key)
  if (!values.includes(value as T[number])) {
    throw new Error(key + ' must be one of ' + values.join(', ') + '.')
  }
  return value as T[number]
}

export const readOptionalStringRecord = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(key + ' must be an object of string values.')
  }

  const result: Record<string, string> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string') {
      throw new Error(key + '.' + entryKey + ' must be a string.')
    }
    result[entryKey] = entryValue
  }
  return result
}

export interface IOpenApiAssetRecord {
  assetId: string
  type: string
  source: string | null
  filename: string
  mimetype: string
  size: number | null
  fileUrl: string
  fileKey: string
  width: number | null
  height: number | null
  duration: number | null
  hasAudioTrack?: boolean | null
  loopBehavior?: 'finite' | 'loop' | null
  captions?: Array<Record<string, unknown>>
  timingGranularity?: 'word' | 'line' | null
  resourceType?: 'lottie' | 'svg' | null
  resourceJson?: Record<string, unknown> | null
  resourceComponentId?: string | null
  materialConfig?: Record<string, unknown> | null
}

export const normalizeAssetTypeName = (value: unknown) => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase()
}

const readRequiredAssetString = (record: Record<string, unknown>, key: keyof IOpenApiAssetRecord, path: string) => {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(path + '.' + key + ' must be a non-empty string.')
  }
  return value.trim()
}

const readNullableAssetString = (record: Record<string, unknown>, key: keyof IOpenApiAssetRecord, path: string) => {
  const value = record[key]
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(path + '.' + key + ' must be string|null.')
  }
  return value
}

const readNullableAssetNumber = (record: Record<string, unknown>, key: keyof IOpenApiAssetRecord, path: string) => {
  const value = record[key]
  if (value === null) {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(path + '.' + key + ' must be number|null.')
  }
  return value
}

const readOptionalAssetBoolean = (value: unknown) => {
  return typeof value === 'boolean' ? value : undefined
}

const readOptionalAssetLoopBehavior = (
  value: unknown
): 'finite' | 'loop' | undefined => {
  return value === 'finite' || value === 'loop' ? value : undefined
}

const readOptionalAssetTimingGranularity = (
  value: unknown
): 'word' | 'line' | undefined => {
  return value === 'word' || value === 'line' ? value : undefined
}

const readOptionalAssetResourceType = (
  value: unknown
): 'lottie' | 'svg' | undefined => {
  return value === 'lottie' || value === 'svg' ? value : undefined
}

export const normalizeOpenApiAssetRecord = (raw: unknown, path = 'asset'): IOpenApiAssetRecord => {
  const record = readRecord(raw)
  return {
    assetId: readRequiredAssetString(record, 'assetId', path),
    type: readRequiredAssetString(record, 'type', path),
    source: readNullableAssetString(record, 'source', path),
    filename: readRequiredAssetString(record, 'filename', path),
    mimetype: readRequiredAssetString(record, 'mimetype', path),
    size: readNullableAssetNumber(record, 'size', path),
    fileUrl: readRequiredAssetString(record, 'fileUrl', path),
    fileKey: readRequiredAssetString(record, 'fileKey', path),
    width: readNullableAssetNumber(record, 'width', path),
    height: readNullableAssetNumber(record, 'height', path),
    duration: readNullableAssetNumber(record, 'duration', path),
    hasAudioTrack:
      readOptionalAssetBoolean(record.hasAudioTrack) ?? null,
    loopBehavior: readOptionalAssetLoopBehavior(record.loopBehavior) ?? null,
    captions: Array.isArray(record.captions)
      ? record.captions.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        )
      : undefined,
    timingGranularity:
      readOptionalAssetTimingGranularity(record.timingGranularity) ?? null,
    resourceType: readOptionalAssetResourceType(record.resourceType) ?? null,
    resourceJson:
      typeof record.resourceJson === 'object' &&
      record.resourceJson !== null &&
      !Array.isArray(record.resourceJson)
        ? (record.resourceJson as Record<string, unknown>)
        : null,
    resourceComponentId:
      typeof record.resourceComponentId === 'string'
        ? record.resourceComponentId
        : null,
    materialConfig:
      typeof record.materialConfig === 'object' &&
      record.materialConfig !== null &&
      !Array.isArray(record.materialConfig)
        ? (record.materialConfig as Record<string, unknown>)
        : null,
  }
}

const hasPositiveNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export const assertAssetMetadataReady = (asset: IOpenApiAssetRecord, contextPath: string) => {
  const type = normalizeAssetTypeName(asset.type)

  if (!hasPositiveNumber(asset.size)) {
    throw new Error(contextPath + '.size must be a positive number.')
  }

  if (type === 'image') {
    if (!hasPositiveNumber(asset.width)) {
      throw new Error(contextPath + '.width must be a positive number for image assets.')
    }
    if (!hasPositiveNumber(asset.height)) {
      throw new Error(contextPath + '.height must be a positive number for image assets.')
    }
    return
  }

  if (type === 'video') {
    if (!hasPositiveNumber(asset.width)) {
      throw new Error(contextPath + '.width must be a positive number for video assets.')
    }
    if (!hasPositiveNumber(asset.height)) {
      throw new Error(contextPath + '.height must be a positive number for video assets.')
    }
    if (!hasPositiveNumber(asset.duration)) {
      throw new Error(contextPath + '.duration must be a positive number for video assets.')
    }
    return
  }

  if (type === 'audio') {
    if (!hasPositiveNumber(asset.duration)) {
      throw new Error(contextPath + '.duration must be a positive number for audio assets.')
    }
    return
  }

  if (type === 'gif' || type === 'lottie' || type === 'svg') {
    if (!hasPositiveNumber(asset.width)) {
      throw new Error(contextPath + '.width must be a positive number for ' + type + ' assets.')
    }
    if (!hasPositiveNumber(asset.height)) {
      throw new Error(contextPath + '.height must be a positive number for ' + type + ' assets.')
    }
    if (!hasPositiveNumber(asset.duration)) {
      throw new Error(
        contextPath + '.duration must be a positive number for ' + type + ' assets.'
      )
    }
    return
  }

  if (type === 'caption' || type === 'captions') {
    return
  }
}

export const filterCapabilitiesPayload = (payload: unknown, fields?: string[]) => {
  if (!fields || fields.length === 0) {
    return payload
  }
  const record = readRecord(payload)
  return Object.fromEntries(Object.entries(record).filter(([key]) => fields.includes(key)))
}

const createClient = (config: IIndreamPluginConfig): IIndreamClientLike => {
  if (!config.apiKey) {
    throw new Error(buildMissingApiKeyMessage())
  }

  return new IndreamClient({
    apiKey: config.apiKey,
    baseURL: config.baseURL || DEFAULT_BASE_URL,
    timeout: config.timeoutMs || DEFAULT_TIMEOUT_MS,
    pollIntervalMs: config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
  })
}

export const ensureClient = (api: OpenClawPluginApi, deps: IIndreamToolDeps) => {
  const config = resolvePluginConfig(api.pluginConfig)
  const clientFactory = deps.createClient || createClient
  return {
    config,
    client: clientFactory(config),
  }
}

export const ensureConfig = (api: OpenClawPluginApi) => {
  return resolvePluginConfig(api.pluginConfig)
}

export const executeWithClient = async (
  api: OpenClawPluginApi,
  deps: IIndreamToolDeps,
  handler: (client: IIndreamClientLike, config: IIndreamPluginConfig) => Promise<unknown>
) => {
  try {
    const { client, config } = ensureClient(api, deps)
    return createJsonResult(await handler(client, config))
  } catch (error) {
    return createErrorResult(error)
  }
}

export const executeWithConfig = async (
  api: OpenClawPluginApi,
  handler: (config: IIndreamPluginConfig) => Promise<unknown>
) => {
  try {
    return createJsonResult(await handler(ensureConfig(api)))
  } catch (error) {
    return createErrorResult(error)
  }
}

export const executeUploadWithClient = async (
  api: OpenClawPluginApi,
  deps: IIndreamToolDeps,
  ctx: OpenClawPluginToolContext,
  params: Record<string, unknown>
) => {
  try {
    const { client, config } = ensureClient(api, deps)
    const uploadSource = await resolveUploadSource({
      filePath: readOptionalString(params, 'filePath'),
      sourceUrl: readOptionalString(params, 'sourceUrl'),
      filename: readOptionalString(params, 'filename'),
      contentType: readOptionalString(params, 'contentType'),
      workspaceDir: ctx.workspaceDir,
      allowLocalPaths: config.uploads.allowLocalPaths,
      allowRemoteUrls: config.uploads.allowRemoteUrls,
      fetchFn: deps.fetchFn,
    })

    const asset = await client.uploads.upload(uploadSource.body, {
      filename: uploadSource.filename,
      contentType: uploadSource.contentType,
      projectId: readOptionalString(params, 'projectId'),
    })
    const normalizedAsset = normalizeOpenApiAssetRecord(asset, 'upload')
    assertAssetMetadataReady(normalizedAsset, 'upload')

    return createJsonResult({
      ...normalizedAsset,
      uploadSource: {
        kind: uploadSource.sourceKind,
        source: uploadSource.source,
      },
      resolveBinding: {
        type: 'asset',
        assetId: normalizedAsset.assetId,
      },
    })
  } catch (error) {
    return createErrorResult(error)
  }
}

export const buildRegisteredCollection = () => {
  const required: IRegisterToolRecord[] = []
  const optional: IRegisterToolRecord[] = []
  return {
    required,
    optional,
  }
}

export const withDefaultLabel = (name: string, tool: TLooseTool | TLooseToolFactory) => {
  if (typeof tool === 'function') {
    return ((ctx: OpenClawPluginToolContext) => {
      const created = tool(ctx)
      if (!created) {
        return created
      }

      if (Array.isArray(created)) {
        return created.map((item) => ({
          ...item,
          label: item.label || item.name || name,
        })) as AnyAgentTool[]
      }

      return {
        ...created,
        label: created.label || created.name || name,
      } as AnyAgentTool
    }) as TLooseToolFactory
  }

  return {
    ...tool,
    label: tool.label || tool.name || name,
  } as AnyAgentTool
}
