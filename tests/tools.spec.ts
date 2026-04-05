import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from 'openclaw/plugin-sdk/plugin-entry'
import pluginEntry from '../src/index'
import { registerIndreamTools, type IIndreamClientLike, type IIndreamToolDeps } from '../src/tools'

interface ICapturedTool {
  tool: Parameters<OpenClawPluginApi['registerTool']>[0]
  optional: boolean
}

const DEFAULT_TOOL_CONTEXT = {} as OpenClawPluginToolContext

const createMockApi = (pluginConfig?: Record<string, unknown>) => {
  const capturedTools: ICapturedTool[] = []

  const api = {
    id: 'indream',
    name: 'Indream',
    source: 'test',
    registrationMode: 'full',
    config: {},
    pluginConfig,
    runtime: {} as OpenClawPluginApi['runtime'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    resolvePath: (input: string) => input,
    registerTool(tool, opts) {
      capturedTools.push({
        tool,
        optional: opts?.optional === true,
      })
    },
    registerHook: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerCliBackend: vi.fn(),
    registerProvider: vi.fn(),
    registerSpeechProvider: vi.fn(),
    registerMediaUnderstandingProvider: vi.fn(),
    registerImageGenerationProvider: vi.fn(),
    registerWebFetchProvider: vi.fn(),
    registerWebSearchProvider: vi.fn(),
    registerInteractiveHandler: vi.fn(),
    onConversationBindingResolved: vi.fn(),
    registerCommand: vi.fn(),
    registerContextEngine: vi.fn(),
    registerMemoryPromptSection: vi.fn(),
    registerMemoryFlushPlan: vi.fn(),
    registerMemoryRuntime: vi.fn(),
    registerMemoryEmbeddingProvider: vi.fn(),
    on: vi.fn(),
  } satisfies OpenClawPluginApi

  return {
    api,
    capturedTools,
  }
}

const resolveRegisteredTools = (tool: ICapturedTool['tool'], ctx?: OpenClawPluginToolContext) => {
  const resolved = typeof tool === 'function' ? tool(ctx || DEFAULT_TOOL_CONTEXT) : tool
  if (!resolved) {
    return [] as AnyAgentTool[]
  }

  return Array.isArray(resolved) ? resolved : [resolved]
}

const readToolNames = (tool: ICapturedTool['tool'], ctx?: OpenClawPluginToolContext) => {
  return resolveRegisteredTools(tool, ctx).map((entry) => entry.name)
}

const getCapturedToolOptional = (
  capturedTools: ICapturedTool[],
  name: string,
  ctx?: OpenClawPluginToolContext
) => {
  const entry = capturedTools.find((toolEntry) => readToolNames(toolEntry.tool, ctx).includes(name))
  return entry?.optional
}

const buildClientStub = () => {
  return {
    editor: {
      capabilities: vi.fn(async () => ({ version: 'v1' })),
      validate: vi.fn(async () => ({ valid: true, errors: [] })),
    },
    projects: {
      create: vi.fn(async (_payload, options) => ({ kind: 'projects.create', options })),
      list: vi.fn(async (payload) => ({ kind: 'projects.list', payload })),
      get: vi.fn(async (projectId) => ({ kind: 'projects.get', projectId })),
      update: vi.fn(async (projectId, payload) => ({ kind: 'projects.update', projectId, payload })),
      sync: vi.fn(async (projectId, payload) => ({ kind: 'projects.sync', projectId, payload })),
      delete: vi.fn(async (projectId) => ({ kind: 'projects.delete', projectId })),
      listAssets: vi.fn(async (payload) => ({ kind: 'projects.listAssets', payload })),
      addAsset: vi.fn(async (projectId, assetId) => ({ kind: 'projects.addAsset', projectId, assetId })),
      removeAsset: vi.fn(async (projectId, assetId) => ({
        kind: 'projects.removeAsset',
        projectId,
        assetId,
      })),
      createExport: vi.fn(async (projectId, payload, options) => ({
        kind: 'projects.createExport',
        projectId,
        payload,
        options,
      })),
    },
    assets: {
      get: vi.fn(async (assetId) => ({ kind: 'assets.get', assetId })),
      delete: vi.fn(async (assetId) => ({ kind: 'assets.delete', assetId })),
    },
    exports: {
      create: vi.fn(async (payload, options) => ({ kind: 'exports.create', payload, options })),
      get: vi.fn(async (taskId) => ({ kind: 'exports.get', taskId })),
      list: vi.fn(async (payload) => ({ kind: 'exports.list', payload })),
      wait: vi.fn(async (taskId, options) => ({ kind: 'exports.wait', taskId, options })),
    },
    uploads: {
      upload: vi.fn(async (_body, options) => ({
        assetId: 'asset_test',
        type: 'IMAGE',
        source: 'UPLOAD',
        filename: options.filename,
        mimetype: options.contentType,
        size: 11,
        fileUrl: 'https://cdn.example.com/uploads/demo.png',
        fileKey: 'uploads/demo.png',
        width: 100,
        height: 100,
        duration: null,
      })),
    },
  } satisfies IIndreamClientLike
}

const getTool = (
  capturedTools: ICapturedTool[],
  name: string,
  ctx?: OpenClawPluginToolContext
) => {
  for (const entry of capturedTools) {
    const tool = resolveRegisteredTools(entry.tool, ctx).find((candidate) => candidate.name === name)
    if (tool) {
      return tool
    }
  }

  expect.unreachable(`Expected tool ${name} to be registered.`)
}

describe('tool registration', () => {
  it('registers required read tools and optional write tools', () => {
    const { api, capturedTools } = createMockApi()

    pluginEntry.register(api)

    const toolNames = capturedTools.flatMap((entry) => readToolNames(entry.tool))
    expect(toolNames).toContain('indream_editor_capabilities')
    expect(toolNames).toContain('indream_assets_upload')
    expect(getCapturedToolOptional(capturedTools, 'indream_editor_capabilities')).toBe(false)
    expect(getCapturedToolOptional(capturedTools, 'indream_projects_create')).toBe(true)
    expect(getCapturedToolOptional(capturedTools, 'indream_assets_upload')).toBe(true)
  })

  it('uses explicit labels for every indream tool', () => {
    const { api, capturedTools } = createMockApi()

    registerIndreamTools(api)

    const expectedLabels: Record<string, string> = {
      indream_editor_capabilities: 'Indream Editor Capabilities',
      indream_editor_validate: 'Validate Indream Editor JSON',
      indream_projects_list: 'List Indream Projects',
      indream_projects_get: 'Get Indream Project',
      indream_projects_list_assets: 'List Indream Project Assets',
      indream_assets_get: 'Get Indream Asset',
      indream_exports_get: 'Get Indream Export',
      indream_exports_list: 'List Indream Exports',
      indream_exports_wait: 'Wait For Indream Export',
      indream_projects_create: 'Create Indream Project',
      indream_projects_update: 'Update Indream Project',
      indream_projects_sync: 'Sync Indream Project',
      indream_projects_delete: 'Delete Indream Project',
      indream_projects_add_asset: 'Add Asset To Indream Project',
      indream_projects_remove_asset: 'Remove Asset From Indream Project',
      indream_assets_upload: 'Upload Indream Asset',
      indream_assets_delete: 'Delete Indream Asset',
      indream_exports_create: 'Create Indream Export',
      indream_projects_create_export: 'Create Indream Project Export',
    }

    for (const [toolName, expectedLabel] of Object.entries(expectedLabels)) {
      expect(getTool(capturedTools, toolName).label).toBe(expectedLabel)
    }
  })

  it('maps project export payloads and idempotency options', async () => {
    const { api, capturedTools } = createMockApi({
      apiKey: 'test-key',
    })
    const client = buildClientStub()
    const deps: IIndreamToolDeps = {
      createClient: () => client,
    }

    registerIndreamTools(api, deps)
    const tool = getTool(capturedTools, 'indream_projects_create_export')
    const result = await tool.execute('tool-1', {
      projectId: 'project_123',
      fps: 30,
      ratio: '16:9',
      scale: 1,
      format: 'mp4',
      callbackHeaders: {
        'x-demo': '1',
      },
      idempotencyKey: 'idem-1',
    })

    expect(client.projects.createExport).toHaveBeenCalledWith(
      'project_123',
      {
        clientTaskId: undefined,
        fps: 30,
        ratio: '16:9',
        scale: 1,
        format: 'mp4',
        callbackUrl: undefined,
        callbackHeaders: {
          'x-demo': '1',
        },
      },
      {
        idempotencyKey: 'idem-1',
      }
    )
    expect(result?.details).toMatchObject({
      kind: 'projects.createExport',
      projectId: 'project_123',
    })
  })

  it('returns a stable failed payload when api key is missing', async () => {
    const { api, capturedTools } = createMockApi()
    registerIndreamTools(api)

    const tool = getTool(capturedTools, 'indream_exports_get')
    const result = await tool.execute('tool-2', {
      taskId: 'task_123',
    })

    expect(result?.details).toMatchObject({
      status: 'failed',
    })
    expect(String((result?.details as { detail?: string }).detail || '')).toContain(
      'plugins.entries.indream.config.apiKey'
    )
  })
})

describe('upload tool', () => {
  it('supports local file path uploads and returns editor asset mapping', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'indream-openclaw-plugin-'))
    const filePath = join(tempDir, 'hero.png')
    await writeFile(filePath, Buffer.from('hello world'))

    const { api, capturedTools } = createMockApi({
      apiKey: 'test-key',
      uploads: {
        allowLocalPaths: true,
        allowRemoteUrls: true,
      },
    })
    const client = buildClientStub()
    registerIndreamTools(api, {
      createClient: () => client,
    })

    const tool = getTool(capturedTools, 'indream_assets_upload', {
      workspaceDir: tempDir,
    })
    const result = await tool.execute('tool-3', {
      filePath: './hero.png',
      projectId: 'project_123',
    })

    expect(client.uploads.upload).toHaveBeenCalled()
    expect(result?.details).toMatchObject({
      assetId: 'asset_test',
      editorAssetMapping: {
        assetId: 'asset_test',
        remoteUrl: 'https://cdn.example.com/uploads/demo.png',
        remoteKey: 'uploads/demo.png',
      },
    })
  })
})
