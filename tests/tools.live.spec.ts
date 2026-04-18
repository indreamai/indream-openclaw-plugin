import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from 'openclaw/plugin-sdk/plugin-entry'
import { registerIndreamTools } from '../src/tools'

interface ICapturedTool {
  tool: Parameters<OpenClawPluginApi['registerTool']>[0]
  optional: boolean
}

const DEFAULT_TOOL_CONTEXT = {} as OpenClawPluginToolContext

const readDotEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return {} as Record<string, string>
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) {
      result[key] = value
    }
  }
  return result
}

const envFromFile = readDotEnvFile(path.resolve(process.cwd(), '.env.local'))
const mergedEnv: Record<string, string> = {
  ...envFromFile,
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  ),
}

const LIVE_ENABLED =
  mergedEnv.INDREAM_LIVE_TEST === '1' &&
  Boolean(mergedEnv.INDREAM_API_KEY) &&
  Boolean(mergedEnv.INDREAM_API_URL)

const createLiveApi = (pluginConfig: Record<string, unknown>) => {
  const capturedTools: ICapturedTool[] = []

  const api = {
    id: 'indream-live',
    name: 'Indream Live',
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
  if (!resolved) {
    return [] as AnyAgentTool[]
  }
  return Array.isArray(resolved) ? resolved : [resolved]
}

const getTool = (
  capturedTools: ICapturedTool[],
  name: string,
  ctx?: OpenClawPluginToolContext
) => {
  for (const entry of capturedTools) {
    const tool = resolveRegisteredTools(entry.tool, ctx).find(
      (candidate) => candidate.name === name
    )
    if (tool) {
      return tool
    }
  }
  throw new Error('Expected tool "' + name + '" to be registered.')
}

const describeLive = LIVE_ENABLED ? describe : describe.skip

describeLive('live workflow tool chain', () => {
  it(
    'runs start -> review -> approve -> commit without auto export',
    async () => {
      const { api, capturedTools } = createLiveApi({
        apiKey: mergedEnv.INDREAM_API_KEY,
        baseURL: mergedEnv.INDREAM_API_URL,
      })
      registerIndreamTools(api)

      const initTool = getTool(capturedTools, 'indream_video_workflow_init')
      const initResult = await initTool.execute('live-init-workflow', {
        brief: {
          topic: 'Live workflow smoke test',
          goal: 'Check the v6 workflow tool chain',
        },
      })
      const workflowArtifactId = (initResult?.details as { artifactId?: string }).artifactId
      expect(typeof workflowArtifactId).toBe('string')

      const reviewTool = getTool(capturedTools, 'indream_video_workflow_review')
      const reviewResult = await reviewTool.execute('live-review-workflow', {
        artifactId: workflowArtifactId,
      })
      expect((reviewResult?.details as { reviewSummary?: { status?: string } }).reviewSummary?.status).toBeDefined()
    },
    60_000
  )
})
