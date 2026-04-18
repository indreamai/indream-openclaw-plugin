import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from 'openclaw/plugin-sdk/plugin-entry'
import pluginEntry from '../src/index'
import { msToTicks } from '../src/compiler/defaults'
import { expandStoryboard } from '../src/compiler/expand'
import {
  registerIndreamTools,
  type IIndreamClientLike,
} from '../src/tools'
import { buildAnimationMap } from '../src/workflow/animation-map'
import type { IStoryboardV6 } from '../src/workflow/types'

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
      capturedTools.push({ tool, optional: opts?.optional === true })
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

  return { api, capturedTools }
}

const resolveRegisteredTools = (
  tool: ICapturedTool['tool'],
  ctx?: OpenClawPluginToolContext
) => {
  const resolved = typeof tool === 'function' ? tool(ctx || DEFAULT_TOOL_CONTEXT) : tool
  if (!resolved) return [] as AnyAgentTool[]
  return Array.isArray(resolved) ? resolved : [resolved]
}

const readToolNames = (tool: ICapturedTool['tool'], ctx?: OpenClawPluginToolContext) =>
  resolveRegisteredTools(tool, ctx).map((entry) => entry.name)

const getTool = (
  capturedTools: ICapturedTool[],
  name: string,
  ctx?: OpenClawPluginToolContext
) => {
  for (const entry of capturedTools) {
    const tool = resolveRegisteredTools(entry.tool, ctx).find((t) => t.name === name)
    if (tool) return tool
  }
  expect.unreachable('Expected tool ' + name + ' to be registered.')
}

const buildClientStub = (): IIndreamClientLike => ({
  editor: {
    capabilities: vi.fn(async () => ({
      version: 'v4',
      transitions: ['fade'],
      illustrations: [
        'ICreativeThinking',
        'IMegaphone',
        'IAiChat',
        'IChatBot',
        'IAiAgent',
      ],
    })),
    validate: vi.fn(async () => ({ valid: true, errors: [] })),
  },
  illustrations: {
    search: vi.fn(async (q) => {
      if (q === 'meeting') return ['ITakingNotes', 'IMeetingBoard']
      if (q === 'chat') return ['IAiChat', 'IChatBot', 'UnsupportedChat']
      if (q === 'ai') return ['IAiChat', 'IAiAgent', 'UnsupportedAi']
      return []
    }),
  },
  projects: {
    create: vi.fn(async () => ({
      projectId: 'project_123',
      title: 'demo',
      description: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      stateVersion: 'state_1',
      editorState: { hidden: true },
    })),
    list: vi.fn(async () => ({ items: [], nextPageCursor: null })),
    get: vi.fn(async () => ({
      projectId: 'project_123',
      title: 'demo',
      description: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      stateVersion: 'state_1',
      editorState: { hidden: true },
    })),
    sync: vi.fn(async () => ({
      projectId: 'project_123',
      updatedAt: '2026-01-01T00:00:00.000Z',
      stateVersion: 'state_2',
      editorState: { hidden: true },
    })),
  },
  assets: {
    get: vi.fn(async (assetId) => ({
      assetId,
      type: 'IMAGE',
      source: 'UPLOAD',
      filename: assetId + '.png',
      mimetype: 'image/png',
      size: 1024,
      fileUrl: 'https://cdn.example.com/' + assetId + '.png',
      fileKey: 'uploads/' + assetId + '.png',
      width: 1920,
      height: 1080,
      duration: null,
    })),
  },
  exports: {
    create: vi.fn(async () => ({ taskId: 'task_123' })),
    get: vi.fn(async () => ({ taskId: 'task_123', status: 'COMPLETED' })),
    list: vi.fn(async () => ({ items: [], nextPageCursor: null })),
    wait: vi.fn(async () => ({ taskId: 'task_123', status: 'COMPLETED' })),
  },
  uploads: {
    upload: vi.fn(async (_body, options) => ({
      assetId: 'asset_test',
      type: 'IMAGE',
      source: 'UPLOAD',
      filename: options.filename,
      mimetype: options.contentType,
      size: 2048,
      fileUrl: 'https://cdn.example.com/asset_test.png',
      fileKey: 'uploads/asset_test.png',
      width: 1920,
      height: 1080,
      duration: null,
    })),
  },
})

const createWorkspaceToolContext = (workspaceDir: string) =>
  ({ workspaceDir } as OpenClawPluginToolContext)

const setupCommittedWorkflow = async (options?: { workspaceDir?: string }) => {
  const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
  const client = buildClientStub()
  registerIndreamTools(api, { createClient: () => client })

  const ctx = options?.workspaceDir
    ? createWorkspaceToolContext(options.workspaceDir)
    : undefined

  const initTool = getTool(capturedTools, 'indream_video_workflow_init', ctx)
  const initResult = await initTool.execute('setup-init', {
    brief: { topic: 'Workflow smoke', goal: 'Check compiled artifact flow' },
  })
  const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

  const setDesignTool = getTool(capturedTools, 'indream_video_workflow_set_design', ctx)
  await setDesignTool.execute('setup-design', {
    artifactId,
    content: '# Design\nPrimary blue. Clean editorial style.',
  })

  const gateTool = getTool(capturedTools, 'indream_video_workflow_gate_advance', ctx)
  await gateTool.execute('setup-gate-design', { artifactId, gate: 'design' })

  const setScriptTool = getTool(capturedTools, 'indream_video_workflow_set_script', ctx)
  await setScriptTool.execute('setup-script', {
    artifactId,
    content: '# Script\nShort hero card.',
  })
  await gateTool.execute('setup-gate-script', { artifactId, gate: 'script' })

  const storyboardTool = getTool(capturedTools, 'indream_video_workflow_set_storyboard', ctx)
  await storyboardTool.execute('setup-storyboard', {
    artifactId,
    storyboard: {
      reviewContracts: {
        enforceTrackOverlapFree: false,
        enforceSceneDurationMatch: true,
        enforceCtaSingleLine: true,
      },
      scenes: [
        {
          sceneId: 's01',
          durationMs: 3000,
          intent: 'hero',
          blockRef: 'block:hero-card',
          slots: {
            primary: {
              resolveBinding: {
                type: 'asset',
                assetId: 'asset-primary-1',
              },
            },
          },
          copy: {
            headline: 'Hello world',
            subheadline: 'Workflow smoke test',
          },
        },
      ],
    },
  })
  await gateTool.execute('setup-gate-storyboard', { artifactId, gate: 'storyboard' })

  const submitTool = getTool(capturedTools, 'indream_video_workflow_scene_submit', ctx)
  const submitResult = await submitTool.execute('setup-scene-submit', {
    artifactId,
    sceneId: 's01',
    sparse: {
      tracks: {
        main: [{ $ref: 'block:hero-card' }],
      },
    },
  })

  const buildTool = getTool(capturedTools, 'indream_video_workflow_build', ctx)
  const buildResult = await buildTool.execute('setup-build', { artifactId })
  await gateTool.execute('setup-gate-build', { artifactId, gate: 'build' })

  const reviewTool = getTool(capturedTools, 'indream_video_workflow_review', ctx)
  const reviewResult = await reviewTool.execute('setup-review', { artifactId })
  await gateTool.execute('setup-gate-static', { artifactId, gate: 'static' })

  const commitTool = getTool(capturedTools, 'indream_video_workflow_commit', ctx)
  const commitResult = await commitTool.execute('setup-commit', { artifactId })

  return {
    api,
    capturedTools,
    client,
    ctx,
    artifactId,
    submitResult,
    buildResult,
    reviewResult,
    commitResult,
  }
}

const createStoryboard = (scenes: IStoryboardV6['scenes']): IStoryboardV6 => ({
  version: 'v6',
  routeMode: 'product-demo',
  output: {
    ratio: '16:9',
    fps: 30,
    format: 'mp4',
    scale: 1,
  },
  scenes,
  globalStyle: {
    theme: 'dark',
    accentColor: '#3366ff',
    backgroundColor: '#000000',
  },
  reviewContracts: {
    enforceTrackOverlapFree: false,
    enforceSceneDurationMatch: true,
    enforceCtaSingleLine: true,
  },
})

const createFullFrameMediaScene = (params: {
  sceneId: string
  assetId: string
  durationMs: number
  animation?: { in?: string; out?: string }
}) => ({
  sceneId: params.sceneId,
  durationMs: params.durationMs,
  intent: 'gallery',
  blockRef: 'custom',
  slots: {},
  copy: {},
  customSparse: {
    sceneId: params.sceneId,
    tracks: {
      media: [
        {
          id: `${params.sceneId}-media`,
          type: 'image' as const,
          startMs: 0,
          durationMs: params.durationMs,
          asset: {
            type: 'asset' as const,
            assetId: params.assetId,
          },
          size: { width: 1920, height: 1080 },
          position: { x: 0, y: 0 },
          animation: params.animation,
        },
      ],
    },
  },
})

// ============================================================================
// Registration
// ============================================================================

describe('tool registration (v6)', () => {
  it('registers all v6 tools', () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api)

    const toolNames = capturedTools.flatMap((entry) => readToolNames(entry.tool))

    const expected = [
      'indream_video_workflow_init',
      'indream_video_workflow_set_design',
      'indream_video_workflow_set_script',
      'indream_video_workflow_set_storyboard',
      'indream_video_workflow_revise',
      'indream_video_workflow_review',
      'indream_video_workflow_gate_advance',
      'indream_video_workflow_scene_submit',
      'indream_video_workflow_scene_list',
      'indream_video_workflow_build',
      'indream_video_workflow_block_list',
      'indream_video_workflow_block_read',
      'indream_video_workflow_snapshot',
      'indream_video_workflow_commit',
      'indream_video_projects_create',
      'indream_video_projects_sync',
      'indream_video_exports_create',
      'indream_assets_upload',
      'indream_assets_get',
      'indream_asset_analyze',
    ]
    for (const name of expected) {
      expect(toolNames, `Expected tool "${name}" to be registered`).toContain(name)
    }
  })

  it('does not register removed v4/v5 tools', () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api)
    const toolNames = capturedTools.flatMap((entry) => readToolNames(entry.tool))
    expect(toolNames).not.toContain('indream_video_workflow_start')
    expect(toolNames).not.toContain('indream_video_workflow_approve')
  })

  it('plugin entry registers the same tool surface', () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    pluginEntry.register(api)
    const toolNames = capturedTools.flatMap((entry) => readToolNames(entry.tool))
    expect(toolNames).toContain('indream_video_workflow_init')
    expect(toolNames).toContain('indream_video_projects_create')
  })
})

// ============================================================================
// Workflow init
// ============================================================================

describe('indream_video_workflow_init', () => {
  it('creates artifact and returns artifactId + gate=capture', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    const client = buildClientStub()
    registerIndreamTools(api, { createClient: () => client })

    const tool = getTool(capturedTools, 'indream_video_workflow_init')
    const result = await tool.execute('t1', {
      brief: { topic: 'My Product Launch', ratio: '16:9' },
    })

    const details = result?.details as Record<string, unknown>
    expect(details.artifactId).toMatch(/^vw-/)
    expect(details.currentGate).toBe('capture')
  })

  it('auto-detects speech-edit route mode from transcript', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const tool = getTool(capturedTools, 'indream_video_workflow_init')
    const result = await tool.execute('t2', {
      brief: { topic: 'Podcast cleanup', transcript: 'First, remove the filler words...' },
    })
    const details = result?.details as Record<string, unknown>
    expect(details.routeMode).toBe('speech-edit')
  })
})

describe('indream_illustrations_search', () => {
  it('returns only editor-supported illustration names', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const tool = getTool(capturedTools, 'indream_illustrations_search')
    const result = await tool.execute('t2-illustration-search', { q: 'chat' })
    const details = result?.details as { items: string[] }

    expect(details.items).toEqual(['IAiChat', 'IChatBot'])
  })
})

// ============================================================================
// Block tools
// ============================================================================

describe('indream_video_workflow_block_list', () => {
  it('returns block list with required metadata', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const tool = getTool(capturedTools, 'indream_video_workflow_block_list')
    const result = await tool.execute('t3', {})
    const details = result?.details as { blocks: Array<{ $id: string }> }
    expect(Array.isArray(details.blocks)).toBe(true)
    expect(details.blocks.length).toBeGreaterThan(0)
    expect(details.blocks.some((b) => b.$id === 'block:hero-card')).toBe(true)
  })
})

describe('indream_video_workflow_block_read', () => {
  it('returns hero-card skeleton', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const tool = getTool(capturedTools, 'indream_video_workflow_block_read')
    const result = await tool.execute('t4', { blockId: 'block:hero-card' })
    const details = result?.details as { $id: string; skeleton: unknown }
    expect(details.$id).toBe('block:hero-card')
    expect(details.skeleton).toBeTruthy()
  })

  it('returns error for unknown block', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const tool = getTool(capturedTools, 'indream_video_workflow_block_read')
    const result = await tool.execute('t5', { blockId: 'block:nonexistent' })
    const details = result?.details as { error: string }
    const c0 = result?.content?.[0]
    const c0Text = c0 && 'text' in c0 ? c0.text : undefined
    expect(details.error || c0Text).toBeTruthy()
  })
})

// ============================================================================
// Semantic ops
// ============================================================================

describe('indream_video_workflow_revise', () => {
  it('rejects unknown op type', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    const client = buildClientStub()
    registerIndreamTools(api, { createClient: () => client })

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t6a', { brief: { topic: 'Test' } })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    const reviseTool = getTool(capturedTools, 'indream_video_workflow_revise')
    const result = await reviseTool.execute('t6b', {
      artifactId,
      ops: [{ type: 'unsupported-op', editorState: {} }],
    })
    const firstContent = result?.content?.[0]
    const text = (firstContent && 'text' in firstContent ? firstContent.text : '') ?? ''
    expect(text.toLowerCase()).toMatch(/failed|error|unknown/i)
  })

  it('applies rewrite-scene-copy op', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    const client = buildClientStub()
    registerIndreamTools(api, { createClient: () => client })

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t7a', {
      brief: { topic: 'Product demo' },
    })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    // Set a storyboard first
    const sbTool = getTool(capturedTools, 'indream_video_workflow_set_storyboard')
    await sbTool.execute('t7b', {
      artifactId,
      storyboard: {
        scenes: [
          {
            sceneId: 's01',
            durationMs: 3000,
            intent: 'Hero intro',
            blockRef: 'block:hero-card',
            slots: {},
            copy: { headline: 'Original Headline' },
          },
        ],
      },
    })

    const reviseTool = getTool(capturedTools, 'indream_video_workflow_revise')
    const result = await reviseTool.execute('t7c', {
      artifactId,
      ops: [
        {
          type: 'rewrite-scene-copy',
          sceneId: 's01',
          copy: { headline: 'New Headline' },
        },
      ],
    })
    expect(result?.details).toBeTruthy()
  })

  it('rejects snake_case semantic ops', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t7d', {
      brief: { topic: 'Reject snake case' },
    })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    const reviseTool = getTool(capturedTools, 'indream_video_workflow_revise')

    for (const type of ['bind_asset', 'set_storyboard', 'rewrite_scene_copy']) {
      const result = await reviseTool.execute('t7e-' + type, {
        artifactId,
        ops: [{ type }],
      })
      const details = result?.details as { status?: string; message?: string }
      expect(details.status).toBe('failed')
      expect(details.message || '').toContain('kebab-case')
    }
  })
})

// ============================================================================
// Scene submit + scene list
// ============================================================================

describe('indream_video_workflow_scene_submit + scene_list', () => {
  it('records scene submission', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t8a', {
      brief: { topic: 'Submission test' },
    })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    const sbTool = getTool(capturedTools, 'indream_video_workflow_set_storyboard')
    await sbTool.execute('t8b', {
      artifactId,
      storyboard: {
        scenes: [{ sceneId: 's01', durationMs: 2000, intent: 'intro', blockRef: 'block:title-card', slots: {}, copy: {} }],
      },
    })

    const submitTool = getTool(capturedTools, 'indream_video_workflow_scene_submit')
    await submitTool.execute('t8c', {
      artifactId,
      sceneId: 's01',
      sparse: { tracks: { text: [{ '$ref': 'block:title-card' }] } },
    })

    const listTool = getTool(capturedTools, 'indream_video_workflow_scene_list')
    const listResult = await listTool.execute('t8d', { artifactId })
    const details = listResult?.details as { scenes: Array<{ sceneId: string; submitted: boolean }> }
    const scene = details.scenes.find((s) => s.sceneId === 's01')
    expect(scene?.submitted).toBe(true)
  })

  it('rejects mismatched sparse.sceneId', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    registerIndreamTools(api, { createClient: () => buildClientStub() })

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t8e', {
      brief: { topic: 'Submission mismatch' },
    })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    const sbTool = getTool(capturedTools, 'indream_video_workflow_set_storyboard')
    await sbTool.execute('t8f', {
      artifactId,
      storyboard: {
        scenes: [{ sceneId: 's01', durationMs: 2000, intent: 'intro', blockRef: 'block:title-card', slots: {}, copy: {} }],
      },
    })

    const submitTool = getTool(capturedTools, 'indream_video_workflow_scene_submit')
    const result = await submitTool.execute('t8g', {
      artifactId,
      sceneId: 's01',
      sparse: { sceneId: 's02', tracks: { text: [{ '$ref': 'block:title-card' }] } },
    })
    const details = result?.details as { status?: string; message?: string }
    expect(details.status).toBe('failed')
    expect(details.message || '').toContain('must match top-level sceneId')
  })
})

describe('illustration scene submit flow', () => {
  it('builds an illustration clip from search result name submitted in sparse asset binding', async () => {
    const { api, capturedTools } = createMockApi({ apiKey: 'test-key' })
    const client = buildClientStub()
    client.editor.validate = vi.fn(async (editorState) => {
      const illustrationItem = (
        editorState as unknown as {
          items: Record<string, Record<string, unknown>>
        }
      ).items['s01-illus']

      if (
        !illustrationItem ||
        illustrationItem.type !== 'illustration' ||
        illustrationItem.illustrationName !== 'IAiChat'
      ) {
        return {
          valid: false,
          errors: [
            {
              errorCode: 'EDITOR_ILLUSTRATION_NOT_FOUND',
              message: 'Unsupported illustration',
            },
          ],
        }
      }

      return { valid: true, errors: [] }
    })

    registerIndreamTools(api, { createClient: () => client })

    const searchTool = getTool(capturedTools, 'indream_illustrations_search')
    const searchResult = await searchTool.execute('t8-illustration-search', { q: 'chat' })
    const illustrationName = (
      searchResult?.details as { items: string[] }
    ).items[0]

    const initTool = getTool(capturedTools, 'indream_video_workflow_init')
    const initResult = await initTool.execute('t8-illustration-init', {
      brief: { topic: 'Illustration flow' },
    })
    const artifactId = (initResult?.details as Record<string, unknown>).artifactId as string

    const storyboardTool = getTool(capturedTools, 'indream_video_workflow_set_storyboard')
    await storyboardTool.execute('t8-illustration-storyboard', {
      artifactId,
      storyboard: {
        scenes: [
          {
            sceneId: 's01',
            durationMs: 3000,
            intent: 'illustration',
            blockRef: 'custom',
            slots: {},
            copy: {},
          },
        ],
      },
    })

    const submitTool = getTool(capturedTools, 'indream_video_workflow_scene_submit')
    await submitTool.execute('t8-illustration-submit', {
      artifactId,
      sceneId: 's01',
      sparse: {
        tracks: {
          decoration: [
            {
              id: 's01-illus',
              type: 'illustration',
              startMs: 0,
              durationMs: 3000,
              asset: {
                type: 'illustration',
                illustrationName,
              },
              illustrationColor: '#ff6600',
              size: { width: 0.28, height: 0.28 },
              position: { x: 0.62, y: 0.2 },
            },
          ],
        },
      },
    })

    const buildTool = getTool(capturedTools, 'indream_video_workflow_build')
    const buildResult = await buildTool.execute('t8-illustration-build', {
      artifactId,
    })
    const buildDetails = buildResult?.details as {
      ok?: boolean
      status?: string
      errors?: unknown[]
    }
    const validatedEditorState = (
      client.editor.validate as unknown as {
        mock: { calls: Array<[unknown]> }
      }
    ).mock.calls[0]?.[0] as {
      items: Record<string, Record<string, unknown>>
    }
    const compiledIllustrationItem = validatedEditorState.items['s01-illus']

    expect(buildDetails.ok).toBe(true)
    expect(compiledIllustrationItem.type).toBe('illustration')
    expect(compiledIllustrationItem.illustrationName).toBe('IAiChat')
    expect(compiledIllustrationItem.color).toBe('#ff6600')
  })
})

describe('expandStoryboard timeline offsets', () => {
  it('accumulates previous scene duration into clip startTicks', () => {
    const storyboard: IStoryboardV6 = {
      version: 'v6',
      routeMode: 'product-demo',
      output: {
        ratio: '9:16',
        fps: 30,
        format: 'mp4',
        scale: 1,
      },
      scenes: [
        {
          sceneId: 's01',
          durationMs: 2000,
          intent: 'intro',
          blockRef: 'custom',
          slots: {},
          copy: {},
          customSparse: {
            sceneId: 's01',
            tracks: {
              main: [
                {
                  id: 's01-title',
                  type: 'text',
                  startMs: 0,
                  durationMs: 2000,
                  text: { content: 'Scene 1' },
                },
              ],
            },
          },
        },
        {
          sceneId: 's02',
          durationMs: 3000,
          intent: 'detail',
          blockRef: 'custom',
          slots: {},
          copy: {},
          customSparse: {
            sceneId: 's02',
            tracks: {
              main: [
                {
                  id: 's02-title',
                  type: 'text',
                  startMs: 250,
                  durationMs: 2750,
                  text: { content: 'Scene 2' },
                },
              ],
            },
          },
        },
      ],
      globalStyle: {
        theme: 'dark',
        accentColor: '#3366ff',
        backgroundColor: '#000000',
      },
      reviewContracts: {
        enforceTrackOverlapFree: false,
        enforceSceneDurationMatch: true,
        enforceCtaSingleLine: true,
      },
    }

    const editorState = expandStoryboard(storyboard)
    const firstItem = editorState.items['s01-title'] as { startTicks: number }
    const secondItem = editorState.items['s02-title'] as { startTicks: number }

    expect(firstItem.startTicks).toBe(msToTicks(0))
    expect(secondItem.startTicks).toBe(msToTicks(2250))
  })
})

describe('expandStoryboard track layout', () => {
  it('packs gallery carousel scenes into one reusable media track and preserves item animations', () => {
    const storyboard = createStoryboard([
      createFullFrameMediaScene({
        sceneId: 's01',
        assetId: 'asset-1',
        durationMs: 1500,
        animation: { in: 'fade' },
      }),
      createFullFrameMediaScene({
        sceneId: 's02',
        assetId: 'asset-2',
        durationMs: 1500,
      }),
      createFullFrameMediaScene({
        sceneId: 's03',
        assetId: 'asset-3',
        durationMs: 1500,
      }),
      createFullFrameMediaScene({
        sceneId: 's04',
        assetId: 'asset-4',
        durationMs: 1500,
      }),
      createFullFrameMediaScene({
        sceneId: 's05',
        assetId: 'asset-5',
        durationMs: 1500,
        animation: { out: 'zoom-in' },
      }),
    ])

    const editorState = expandStoryboard(storyboard)
    const tracks = editorState.tracks as Array<{ items: string[] }>
    const firstItem = editorState.items['s01-media'] as {
      startTicks: number
      animations?: { in?: { type?: string } }
    }
    const lastItem = editorState.items['s05-media'] as {
      startTicks: number
      animations?: { out?: { type?: string } }
    }
    const animationMap = buildAnimationMap(editorState)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].items).toEqual([
      's01-media',
      's02-media',
      's03-media',
      's04-media',
      's05-media',
    ])
    expect(firstItem.startTicks).toBe(msToTicks(0))
    expect(lastItem.startTicks).toBe(msToTicks(6000))
    expect(firstItem.animations?.in?.type).toBe('fade')
    expect(lastItem.animations?.out?.type).toBe('zoom-in')
    expect(animationMap.overlaps).toHaveLength(0)
  })

  it('splits overlapping clips from the same logical track into new physical lanes', () => {
    const storyboard = createStoryboard([
      {
        sceneId: 's01',
        durationMs: 2200,
        intent: 'layout-check',
        blockRef: 'custom',
        slots: {},
        copy: {},
        customSparse: {
          sceneId: 's01',
          tracks: {
            shared: [
              {
                id: 'clip-a',
                type: 'text',
                startMs: 0,
                durationMs: 1000,
                text: { content: 'A' },
              },
              {
                id: 'clip-b',
                type: 'text',
                startMs: 200,
                durationMs: 1000,
                text: { content: 'B' },
              },
              {
                id: 'clip-c',
                type: 'text',
                startMs: 1200,
                durationMs: 800,
                text: { content: 'C' },
              },
            ],
          },
        },
      },
    ])

    const editorState = expandStoryboard(storyboard)
    const tracks = editorState.tracks as Array<{ items: string[] }>
    const animationMap = buildAnimationMap(editorState)

    expect(tracks).toHaveLength(2)
    expect(tracks[0].items).toEqual(['clip-a', 'clip-c'])
    expect(tracks[1].items).toEqual(['clip-b'])
    expect(animationMap.overlaps).toHaveLength(0)
  })

  it('reuses the same physical media lane across scenes instead of creating scene-specific tracks', () => {
    const storyboard = createStoryboard([
      createFullFrameMediaScene({
        sceneId: 's01',
        assetId: 'asset-1',
        durationMs: 1800,
      }),
      createFullFrameMediaScene({
        sceneId: 's02',
        assetId: 'asset-2',
        durationMs: 2200,
      }),
    ])

    const editorState = expandStoryboard(storyboard)
    const tracks = editorState.tracks as Array<{ items: string[] }>
    const secondItem = editorState.items['s02-media'] as { startTicks: number }

    expect(tracks).toHaveLength(1)
    expect(tracks[0].items).toEqual(['s01-media', 's02-media'])
    expect(secondItem.startTicks).toBe(msToTicks(1800))
  })

  it('orders tracks by display priority so text and overlay stay above full-frame media', () => {
    const storyboard = createStoryboard([
      {
        sceneId: 's01',
        durationMs: 3000,
        intent: 'hero',
        blockRef: 'block:hero-card',
        slots: {
          primary: {
            type: 'asset',
            assetId: 'asset-primary',
          },
        },
        copy: {
          headline: 'Front headline',
          subheadline: 'Front subtitle',
        },
      },
    ])

    const editorState = expandStoryboard(storyboard)
    const tracks = editorState.tracks as Array<{ items: string[] }>
    const topTrackItems = tracks.slice(0, 2).flatMap((track) => track.items)
    const overlayTrack = tracks[tracks.length - 2]
    const mediaTrack = tracks[tracks.length - 1]
    const animationMap = buildAnimationMap(editorState)

    expect(new Set(topTrackItems)).toEqual(new Set(['s01-headline', 's01-sub']))
    expect(overlayTrack.items).toEqual(['s01-overlay'])
    expect(mediaTrack.items).toEqual(['s01-bg'])
    expect(animationMap.overlaps).toHaveLength(0)
  })
})

describe('compiled workflow chain', () => {
  it('builds, reviews, commits, and creates a project from compiled artifact', async () => {
    const flow = await setupCommittedWorkflow()

    const submitDetails = flow.submitResult?.details as {
      summary?: { submittedScenes?: string[] }
    }
    expect(submitDetails.summary?.submittedScenes).toContain('s01')

    const buildDetails = flow.buildResult?.details as {
      ok?: boolean
      status?: string
      editorStateHash?: string
    }
    expect(buildDetails.ok).toBe(true)
    expect(buildDetails.editorStateHash).toMatch(/^[a-f0-9]{16}$/)

    const reviewDetails = flow.reviewResult?.details as {
      reviewSummary?: {
        status?: string
        diagnostics?: Array<{ code?: string }>
      }
    }
    expect(reviewDetails.reviewSummary?.status).toBe('ok')
    expect(
      (reviewDetails.reviewSummary?.diagnostics || []).some(
        (diagnostic) => diagnostic.code === 'BINDING_RESOLUTION_FAILED'
      )
    ).toBe(false)

    const commitDetails = flow.commitResult?.details as {
      status?: string
      compiledArtifactId?: string
      workflowArtifactId?: string
    }
    expect(commitDetails.status).toBe('ok')
    expect(commitDetails.compiledArtifactId).toMatch(/^vc-/)
    expect(commitDetails.workflowArtifactId).toBe(flow.artifactId)

    const createTool = getTool(flow.capturedTools, 'indream_video_projects_create', flow.ctx)
    const createResult = await createTool.execute('t9-create', {
      artifactId: commitDetails.compiledArtifactId,
    })
    const createDetails = createResult?.details as {
      project?: { projectId?: string }
      artifactId?: string
    }
    expect(createDetails.project?.projectId).toBe('project_123')
    expect(createDetails.artifactId).toBe(commitDetails.compiledArtifactId)

    const createCalls = (
      flow.client.projects.create as unknown as {
        mock: { calls: Array<[Record<string, unknown>]> }
      }
    ).mock.calls
    const createPayload = createCalls[0]?.[0] as {
      editorState?: IStoryboardV6
    }
    const animationMap = buildAnimationMap(createPayload.editorState as never)
    const compiledTracks = (createPayload.editorState as unknown as {
      tracks: Array<{ items: string[] }>
    }).tracks

    expect(animationMap.overlaps).toHaveLength(0)
    expect(compiledTracks[compiledTracks.length - 1].items).toEqual(['s01-bg'])
  })

  it('rejects workflow artifact ids for project creation with a clear error', async () => {
    const flow = await setupCommittedWorkflow()

    const createTool = getTool(flow.capturedTools, 'indream_video_projects_create', flow.ctx)
    const createResult = await createTool.execute('t9-vw-error', {
      artifactId: flow.artifactId,
    })
    const details = createResult?.details as { status?: string; message?: string }
    expect(details.status).toBe('failed')
    expect(details.message || '').toContain('compiled artifactId')
    expect(details.message || '').toContain('indream_video_workflow_commit')
  })

  it('rehydrates compiled artifacts from workspace persistence', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'indream-plugin-tools-'))
    const flow = await setupCommittedWorkflow({ workspaceDir })

    const commitDetails = flow.commitResult?.details as {
      compiledArtifactId?: string
    }
    const createTool = getTool(flow.capturedTools, 'indream_video_projects_create', flow.ctx)
    const createResult = await createTool.execute('t9-rehydrate', {
      artifactId: commitDetails.compiledArtifactId,
    })
    const details = createResult?.details as {
      project?: { projectId?: string }
      artifactId?: string
    }
    expect(details.project?.projectId).toBe('project_123')
    expect(details.artifactId).toBe(commitDetails.compiledArtifactId)
  })
})
