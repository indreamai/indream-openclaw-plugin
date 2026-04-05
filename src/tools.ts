import { IndreamClient, type TEditorStateV1 } from '@indreamai/client'
import { Type } from '@sinclair/typebox'
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
} from './config'
import { createErrorResult, createJsonResult } from './results'
import { resolveUploadSource } from './upload-source'

const EXPORT_RATIO_VALUES = ['16:9', '9:16', '1:1', '4:3', '3:4', 'custom'] as const
const EXPORT_FORMAT_VALUES = ['mp4', 'webm'] as const
const FPS_VALUES = [30, 60] as const

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

type TLooseTool = Omit<AnyAgentTool, 'label'> & {
  label?: string
}

type TLooseToolFactory = (
  ctx: OpenClawPluginToolContext
) => TLooseTool | TLooseTool[] | null | undefined

export interface IIndreamClientLike {
  editor: {
    capabilities: () => Promise<unknown>
    validate: (editorState: TEditorStateV1) => Promise<unknown>
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
    update: (
      projectId: string,
      payload: { title?: string; description?: string | null }
    ) => Promise<unknown>
    sync: (
      projectId: string,
      payload: { editorState: TEditorStateV1; stateVersion?: string }
    ) => Promise<unknown>
    delete: (projectId: string) => Promise<unknown>
    listAssets: (params: { projectId: string; pageSize?: number; pageCursor?: string }) => Promise<unknown>
    addAsset: (projectId: string, assetId: string) => Promise<unknown>
    removeAsset: (projectId: string, assetId: string) => Promise<unknown>
    createExport: (
      projectId: string,
      payload: {
        clientTaskId?: string
        fps: 30 | 60
        ratio: (typeof EXPORT_RATIO_VALUES)[number]
        scale: number
        format: (typeof EXPORT_FORMAT_VALUES)[number]
        callbackUrl?: string
        callbackHeaders?: Record<string, string>
      },
      options?: { idempotencyKey?: string }
    ) => Promise<unknown>
  }
  assets: {
    get: (assetId: string) => Promise<unknown>
    delete: (assetId: string) => Promise<unknown>
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

const readRecord = (value: unknown) => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const readOptionalString = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const readRequiredString = (params: Record<string, unknown>, key: string) => {
  const value = readOptionalString(params, key)
  if (!value) {
    throw new Error(`${key} is required.`)
  }
  return value
}

const readOptionalInteger = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined
  }
  return value
}

const readOptionalNumber = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const readRequiredNumber = (params: Record<string, unknown>, key: string) => {
  const value = readOptionalNumber(params, key)
  if (value === undefined) {
    throw new Error(`${key} is required.`)
  }
  return value
}

const readRequiredLiteralString = <T extends readonly string[]>(
  params: Record<string, unknown>,
  key: string,
  values: T
): T[number] => {
  const value = readRequiredString(params, key)
  if (!values.includes(value as T[number])) {
    throw new Error(`${key} must be one of ${values.join(', ')}.`)
  }
  return value as T[number]
}

const readRequiredLiteralNumber = <T extends readonly number[]>(
  params: Record<string, unknown>,
  key: string,
  values: T
): T[number] => {
  const value = readRequiredNumber(params, key)
  if (!values.includes(value as T[number])) {
    throw new Error(`${key} must be one of ${values.join(', ')}.`)
  }
  return value as T[number]
}

const readOptionalStringRecord = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be an object of string values.`)
  }

  const result: Record<string, string> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string') {
      throw new Error(`${key}.${entryKey} must be a string.`)
    }
    result[entryKey] = entryValue
  }
  return result
}

const readEditorState = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`)
  }

  return value as TEditorStateV1
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

const ensureClient = (api: OpenClawPluginApi, deps: IIndreamToolDeps) => {
  const config = resolvePluginConfig(api.pluginConfig)
  const clientFactory = deps.createClient || createClient
  return {
    config,
    client: clientFactory(config),
  }
}

const executeWithClient = async (
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

const executeUploadWithClient = async (
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

    return createJsonResult({
      ...asset,
      uploadSource: {
        kind: uploadSource.sourceKind,
        source: uploadSource.source,
      },
      editorAssetMapping: {
        assetId: asset.assetId,
        remoteUrl: asset.fileUrl,
        remoteKey: asset.fileKey,
        filename: asset.filename,
        type: asset.type,
      },
    })
  } catch (error) {
    return createErrorResult(error)
  }
}

const exportRatioSchema = Type.Union(EXPORT_RATIO_VALUES.map((value) => Type.Literal(value)))
const exportFormatSchema = Type.Union(EXPORT_FORMAT_VALUES.map((value) => Type.Literal(value)))
const fpsSchema = Type.Union(FPS_VALUES.map((value) => Type.Literal(value)))

const paginationSchema = {
  pageSize: Type.Optional(Type.Integer({ minimum: 1 })),
  pageCursor: Type.Optional(Type.String()),
}

export const registerIndreamTools = (
  api: OpenClawPluginApi,
  deps: IIndreamToolDeps = {}
): IRegisteredToolsSummary => {
  const required: IRegisterToolRecord[] = []
  const optional: IRegisterToolRecord[] = []

  const withDefaultLabel = (name: string, tool: TLooseTool | TLooseToolFactory) => {
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

  const register = (
    name: string,
    tool: TLooseTool | TLooseToolFactory,
    toolIsOptional = false
  ) => {
    api.registerTool(
      withDefaultLabel(name, tool) as Parameters<OpenClawPluginApi['registerTool']>[0],
      toolIsOptional ? { optional: true } : undefined
    )
    const collection = toolIsOptional ? optional : required
    collection.push({
      name,
      optional: toolIsOptional,
    })
  }

  register('indream_editor_capabilities', {
    name: 'indream_editor_capabilities',
    label: 'Indream Editor Capabilities',
    description: 'Fetch the current Indream editor capability catalog.',
    parameters: Type.Object({}),
    async execute() {
      return await executeWithClient(api, deps, async (client) => {
        return await client.editor.capabilities()
      })
    },
  })

  register('indream_editor_validate', {
    name: 'indream_editor_validate',
    label: 'Validate Indream Editor JSON',
    description: 'Validate an Indream editor JSON payload before saving or exporting.',
    parameters: Type.Object({
      editorState: Type.Unknown(),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.editor.validate(readEditorState(params, 'editorState'))
      })
    },
  })

  register('indream_projects_list', {
    name: 'indream_projects_list',
    label: 'List Indream Projects',
    description: 'List Indream projects.',
    parameters: Type.Object({
      ...paginationSchema,
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.projects.list({
          pageSize: readOptionalInteger(params, 'pageSize'),
          pageCursor: readOptionalString(params, 'pageCursor'),
        })
      })
    },
  })

  register('indream_projects_get', {
    name: 'indream_projects_get',
    label: 'Get Indream Project',
    description: 'Get a single Indream project, including editorState.',
    parameters: Type.Object({
      projectId: Type.String(),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.projects.get(readRequiredString(params, 'projectId'))
      })
    },
  })

  register('indream_projects_list_assets', {
    name: 'indream_projects_list_assets',
    label: 'List Indream Project Assets',
    description: 'List assets attached to a project.',
    parameters: Type.Object({
      projectId: Type.String(),
      ...paginationSchema,
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.projects.listAssets({
          projectId: readRequiredString(params, 'projectId'),
          pageSize: readOptionalInteger(params, 'pageSize'),
          pageCursor: readOptionalString(params, 'pageCursor'),
        })
      })
    },
  })

  register('indream_assets_get', {
    name: 'indream_assets_get',
    label: 'Get Indream Asset',
    description: 'Fetch a reusable Indream asset.',
    parameters: Type.Object({
      assetId: Type.String(),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.assets.get(readRequiredString(params, 'assetId'))
      })
    },
  })

  register('indream_exports_get', {
    name: 'indream_exports_get',
    label: 'Get Indream Export',
    description: 'Fetch a single export task.',
    parameters: Type.Object({
      taskId: Type.String(),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.exports.get(readRequiredString(params, 'taskId'))
      })
    },
  })

  register('indream_exports_list', {
    name: 'indream_exports_list',
    label: 'List Indream Exports',
    description: 'List export tasks.',
    parameters: Type.Object({
      ...paginationSchema,
      createdByApiKeyId: Type.Optional(Type.String()),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.exports.list({
          pageSize: readOptionalInteger(params, 'pageSize'),
          pageCursor: readOptionalString(params, 'pageCursor'),
          createdByApiKeyId: readOptionalString(params, 'createdByApiKeyId'),
        })
      })
    },
  })

  register('indream_exports_wait', {
    name: 'indream_exports_wait',
    label: 'Wait For Indream Export',
    description: 'Poll an export task until it reaches a terminal state.',
    parameters: Type.Object({
      taskId: Type.String(),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
      pollIntervalMs: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await client.exports.wait(readRequiredString(params, 'taskId'), {
          timeoutMs: readOptionalInteger(params, 'timeoutMs'),
          pollIntervalMs: readOptionalInteger(params, 'pollIntervalMs'),
        })
      })
    },
  })

  register(
    'indream_projects_create',
    {
      name: 'indream_projects_create',
      label: 'Create Indream Project',
      description: 'Create a new persisted Indream project.',
      parameters: Type.Object({
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        editorState: Type.Unknown(),
        stateVersion: Type.Optional(Type.String()),
        idempotencyKey: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.create(
            {
              title: readOptionalString(params, 'title'),
              description: readOptionalString(params, 'description') ?? null,
              editorState: readEditorState(params, 'editorState'),
              stateVersion: readOptionalString(params, 'stateVersion'),
            },
            {
              idempotencyKey: readOptionalString(params, 'idempotencyKey'),
            }
          )
        })
      },
    },
    true
  )

  register(
    'indream_projects_update',
    {
      name: 'indream_projects_update',
      label: 'Update Indream Project',
      description: 'Update project title and description.',
      parameters: Type.Object({
        projectId: Type.String(),
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.update(readRequiredString(params, 'projectId'), {
            title: readOptionalString(params, 'title'),
            description: readOptionalString(params, 'description') ?? null,
          })
        })
      },
    },
    true
  )

  register(
    'indream_projects_sync',
    {
      name: 'indream_projects_sync',
      label: 'Sync Indream Project',
      description: 'Replace the latest persisted editorState for a project.',
      parameters: Type.Object({
        projectId: Type.String(),
        editorState: Type.Unknown(),
        stateVersion: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.sync(readRequiredString(params, 'projectId'), {
            editorState: readEditorState(params, 'editorState'),
            stateVersion: readOptionalString(params, 'stateVersion'),
          })
        })
      },
    },
    true
  )

  register(
    'indream_projects_delete',
    {
      name: 'indream_projects_delete',
      label: 'Delete Indream Project',
      description: 'Delete a project.',
      parameters: Type.Object({
        projectId: Type.String(),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.delete(readRequiredString(params, 'projectId'))
        })
      },
    },
    true
  )

  register(
    'indream_projects_add_asset',
    {
      name: 'indream_projects_add_asset',
      label: 'Add Asset To Indream Project',
      description: 'Attach an existing asset to a project.',
      parameters: Type.Object({
        projectId: Type.String(),
        assetId: Type.String(),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.addAsset(
            readRequiredString(params, 'projectId'),
            readRequiredString(params, 'assetId')
          )
        })
      },
    },
    true
  )

  register(
    'indream_projects_remove_asset',
    {
      name: 'indream_projects_remove_asset',
      label: 'Remove Asset From Indream Project',
      description: 'Detach an asset from a project.',
      parameters: Type.Object({
        projectId: Type.String(),
        assetId: Type.String(),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.removeAsset(
            readRequiredString(params, 'projectId'),
            readRequiredString(params, 'assetId')
          )
        })
      },
    },
    true
  )

  register(
    'indream_assets_upload',
    (ctx) => ({
      name: 'indream_assets_upload',
      label: 'Upload Indream Asset',
      description:
        'Upload a local file path or remote HTTP/HTTPS URL and return editor JSON asset mapping fields.',
      parameters: Type.Object({
        filePath: Type.Optional(Type.String()),
        sourceUrl: Type.Optional(Type.String()),
        filename: Type.Optional(Type.String()),
        contentType: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeUploadWithClient(api, deps, ctx, params)
      },
    }),
    true
  )

  register(
    'indream_assets_delete',
    {
      name: 'indream_assets_delete',
      label: 'Delete Indream Asset',
      description: 'Delete an asset.',
      parameters: Type.Object({
        assetId: Type.String(),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.assets.delete(readRequiredString(params, 'assetId'))
        })
      },
    },
    true
  )

  register(
    'indream_exports_create',
    {
      name: 'indream_exports_create',
      label: 'Create Indream Export',
      description: 'Create a stateless export directly from editor JSON.',
      parameters: Type.Object({
        editorState: Type.Unknown(),
        stateVersion: Type.Optional(Type.String()),
        clientTaskId: Type.Optional(Type.String()),
        fps: fpsSchema,
        compositionWidth: Type.Optional(Type.Integer({ minimum: 1 })),
        compositionHeight: Type.Optional(Type.Integer({ minimum: 1 })),
        ratio: exportRatioSchema,
        scale: Type.Number({ exclusiveMinimum: 0 }),
        format: exportFormatSchema,
        callbackUrl: Type.Optional(Type.String()),
        callbackHeaders: Type.Optional(Type.Record(Type.String(), Type.String())),
        idempotencyKey: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.exports.create(
            {
              editorState: readEditorState(params, 'editorState'),
              stateVersion: readOptionalString(params, 'stateVersion'),
              clientTaskId: readOptionalString(params, 'clientTaskId'),
              fps: readRequiredLiteralNumber(params, 'fps', FPS_VALUES),
              compositionWidth: readOptionalInteger(params, 'compositionWidth'),
              compositionHeight: readOptionalInteger(params, 'compositionHeight'),
              ratio: readRequiredLiteralString(params, 'ratio', EXPORT_RATIO_VALUES),
              scale: readRequiredNumber(params, 'scale'),
              format: readRequiredLiteralString(params, 'format', EXPORT_FORMAT_VALUES),
              callbackUrl: readOptionalString(params, 'callbackUrl'),
              callbackHeaders: readOptionalStringRecord(params, 'callbackHeaders'),
            },
            {
              idempotencyKey: readOptionalString(params, 'idempotencyKey'),
            }
          )
        })
      },
    },
    true
  )

  register(
    'indream_projects_create_export',
    {
      name: 'indream_projects_create_export',
      label: 'Create Indream Project Export',
      description: 'Create an export task from the latest saved project state.',
      parameters: Type.Object({
        projectId: Type.String(),
        clientTaskId: Type.Optional(Type.String()),
        fps: fpsSchema,
        ratio: exportRatioSchema,
        scale: Type.Number({ exclusiveMinimum: 0 }),
        format: exportFormatSchema,
        callbackUrl: Type.Optional(Type.String()),
        callbackHeaders: Type.Optional(Type.Record(Type.String(), Type.String())),
        idempotencyKey: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          return await client.projects.createExport(
            readRequiredString(params, 'projectId'),
            {
              clientTaskId: readOptionalString(params, 'clientTaskId'),
              fps: readRequiredLiteralNumber(params, 'fps', FPS_VALUES),
              ratio: readRequiredLiteralString(params, 'ratio', EXPORT_RATIO_VALUES),
              scale: readRequiredNumber(params, 'scale'),
              format: readRequiredLiteralString(params, 'format', EXPORT_FORMAT_VALUES),
              callbackUrl: readOptionalString(params, 'callbackUrl'),
              callbackHeaders: readOptionalStringRecord(params, 'callbackHeaders'),
            },
            {
              idempotencyKey: readOptionalString(params, 'idempotencyKey'),
            }
          )
        })
      },
    },
    true
  )

  return {
    required,
    optional,
  }
}
