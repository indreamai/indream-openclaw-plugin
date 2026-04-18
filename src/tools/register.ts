import { Type } from '@sinclair/typebox'
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import { analyzeImageBuffer, isSharpAvailable } from '../analysis/sharp-analyzer'
import { readAnalysisCache, writeAnalysisCache } from '../analysis/cache'
import { mapOpenApiAssetToEditorAsset } from '../analysis/asset-mapper'
import { artifactStore } from '../artifacts/store'
import { searchIllustrations, pickIllustrationName } from '../materials/illustrations'
import { createErrorResult } from '../results'
import { resolveUploadSource } from '../upload-source'
import { listBlocks, getBlock } from '../compiler/blocks/index'
import { expandStoryboard } from '../compiler/expand'
import { applySemanticOp } from '../workflow/ops'
import { routeWorkflowMode } from '../workflow/router'
import { reviewWorkflow } from '../workflow/reviewer'
import { compileWorkflowArtifact } from '../workflow/compile'
import { summarizeStoryboard, hashStoryboard, buildArtifactStatusText } from '../workflow/summary'
import { advanceGate, buildGateStatusSummary } from '../workflow/gates'
import { requestPreviewFrames } from '../snapshot/frame-client'
import {
  WORKFLOW_GATE_VALUES,
  WORKFLOW_REVIEW_FOCUS_VALUES,
  WORKFLOW_ROUTE_MODE_VALUES,
  WORKFLOW_BINDING_TYPE_VALUES,
  type IWorkflowBrief,
  type IStoryboardV6,
  type ISparseSceneFragment,
  type ISparseClip,
  type TWorkflowSemanticOp,
  type TWorkflowBinding,
} from '../workflow/types'
import {
  EXPORT_FORMAT_VALUES,
  EXPORT_RATIO_VALUES,
  FPS_VALUES,
  buildRegisteredCollection,
  ensureClient,
  executeWithClient,
  filterCapabilitiesPayload,
  normalizeOpenApiAssetRecord,
  assertAssetMetadataReady,
  readOptionalInteger,
  readOptionalLiteralString,
  readOptionalString,
  readOptionalStringArray,
  readOptionalStringRecord,
  readRecord,
  readRequiredNumber,
  readRequiredString,
  withDefaultLabel,
  type IIndreamClientLike,
  type IIndreamToolDeps,
  type IRegisterToolRecord,
  type IRegisteredToolsSummary,
  type TLooseTool,
  type TLooseToolFactory,
} from './shared'

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const ratioEnumSchema = Type.Unsafe<(typeof EXPORT_RATIO_VALUES)[number]>({
  type: 'string',
  enum: [...EXPORT_RATIO_VALUES],
})
const formatEnumSchema = Type.Unsafe<(typeof EXPORT_FORMAT_VALUES)[number]>({
  type: 'string',
  enum: [...EXPORT_FORMAT_VALUES],
})
const fpsEnumSchema = Type.Unsafe<(typeof FPS_VALUES)[number]>({
  type: 'number',
  enum: [...FPS_VALUES],
})
const workflowModeSchema = Type.Unsafe<(typeof WORKFLOW_ROUTE_MODE_VALUES)[number]>({
  type: 'string',
  enum: [...WORKFLOW_ROUTE_MODE_VALUES],
})
const workflowGateSchema = Type.Unsafe<(typeof WORKFLOW_GATE_VALUES)[number]>({
  type: 'string',
  enum: [...WORKFLOW_GATE_VALUES],
})
const workflowFocusSchema = Type.Unsafe<(typeof WORKFLOW_REVIEW_FOCUS_VALUES)[number]>({
  type: 'string',
  enum: [...WORKFLOW_REVIEW_FOCUS_VALUES],
})

const illustrationSearchQuerySchema = Type.String({
  minLength: 2,
  pattern: '^\\S+$',
})

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const stripEditorState = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripEditorState(entry))
  }
  if (!isRecord(value)) {
    return value
  }
  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'editorState') continue
    next[key] = stripEditorState(entry)
  }
  return next
}

const readWorkflowBinding = (rawValue: unknown, path: string): TWorkflowBinding => {
  if (!isRecord(rawValue)) {
    throw new Error(path + ' must be a binding object.')
  }

  const bindingRecord =
    isRecord(rawValue.resolveBinding) ? readRecord(rawValue.resolveBinding) : rawValue
  const bindingType = readOptionalString(bindingRecord, 'type')
  if (
    !bindingType ||
    !WORKFLOW_BINDING_TYPE_VALUES.includes(
      bindingType as (typeof WORKFLOW_BINDING_TYPE_VALUES)[number]
    )
  ) {
    throw new Error(
      path + '.type must be one of: ' + WORKFLOW_BINDING_TYPE_VALUES.join(', ')
    )
  }

  if (bindingType === 'asset') {
    return {
      type: 'asset',
      assetId: readRequiredString(bindingRecord, 'assetId'),
    }
  }

  return {
    type: 'illustration',
    illustrationName: readRequiredString(bindingRecord, 'illustrationName'),
  }
}

// ---------------------------------------------------------------------------
// Brief / storyboard readers
// ---------------------------------------------------------------------------

const readWorkflowBrief = (rawValue: unknown): IWorkflowBrief => {
  const record = readRecord(rawValue)
  const topic = readRequiredString(record, 'topic')
  return {
    topic,
    goal: readOptionalString(record, 'goal'),
    audience: readOptionalString(record, 'audience'),
    ratio: readOptionalLiteralString(record, 'ratio', EXPORT_RATIO_VALUES),
    fps:
      typeof record.fps === 'number'
        ? record.fps === 30 || record.fps === 60
          ? record.fps
          : undefined
        : undefined,
    durationTargetSeconds:
      typeof record.durationTargetSeconds === 'number' &&
      Number.isFinite(record.durationTargetSeconds)
        ? record.durationTargetSeconds
        : undefined,
    tone: readOptionalString(record, 'tone'),
    cta: readOptionalString(record, 'cta'),
    transcript: readOptionalString(record, 'transcript'),
  }
}

const readStoryboard = (rawValue: unknown): Partial<IStoryboardV6> => {
  if (!isRecord(rawValue)) {
    throw new Error('storyboard must be an object.')
  }

  if (!Array.isArray(rawValue.scenes)) {
    return rawValue as Partial<IStoryboardV6>
  }

  const rawScenes = rawValue.scenes as unknown[]

  return {
    ...rawValue,
    scenes: rawScenes.map((scene, sceneIndex): Record<string, unknown> => {
      if (!isRecord(scene) || !isRecord(scene.slots)) {
        return isRecord(scene) ? scene : {}
      }

      // Accept the resolveBinding wrapper returned by the upload tool, but
      // normalize it to the standard kebab-case workflow binding shape.
      const slots = Object.fromEntries(
        Object.entries(scene.slots).map(([slotKey, binding]) => [
          slotKey,
          readWorkflowBinding(
            binding,
            `storyboard.scenes[${sceneIndex}].slots.${slotKey}`
          ),
        ])
      )

      return {
        ...scene,
        slots,
      }
    }),
  } as unknown as Partial<IStoryboardV6>
}

const readSparseScene = (rawValue: unknown): ISparseSceneFragment => {
  if (!isRecord(rawValue)) {
    throw new Error('sparse must be an object with sceneId and tracks.')
  }
  const sceneId = readRequiredString(rawValue, 'sceneId')
  const tracksRaw = (rawValue).tracks
  if (!isRecord(tracksRaw)) {
    throw new Error('sparse.tracks must be an object.')
  }
  return {
    sceneId,
    tracks: tracksRaw as unknown as Record<string, ISparseClip[]>,
  }
}

const readSceneSubmitSparse = (
  rawValue: unknown,
  sceneId: string
): ISparseSceneFragment => {
  if (!isRecord(rawValue)) {
    throw new Error('sparse must be an object with optional sceneId and tracks.')
  }

  const sparseSceneId = readOptionalString(rawValue, 'sceneId')
  if (sparseSceneId && sparseSceneId !== sceneId) {
    throw new Error(
      `sparse.sceneId must match top-level sceneId. Received ${sparseSceneId}, expected ${sceneId}.`
    )
  }

  const tracksRaw = rawValue.tracks
  if (!isRecord(tracksRaw)) {
    throw new Error('sparse.tracks must be an object.')
  }

  return {
    sceneId,
    tracks: tracksRaw as unknown as Record<string, ISparseClip[]>,
  }
}

const resolveCompiledArtifact = (artifactId: string) => {
  if (artifactId.startsWith('vw-')) {
    throw new Error(
      'artifactId must be a compiled artifactId (vc-*). Run indream_video_workflow_commit first.'
    )
  }
  return artifactStore.getCompiled(artifactId)
}

// ---------------------------------------------------------------------------
// SemanticOp reader (thin v6 version — full op list from types)
// ---------------------------------------------------------------------------

const readSemanticOps = (rawValue: unknown): TWorkflowSemanticOp[] => {
  if (!Array.isArray(rawValue) || rawValue.length === 0) {
    throw new Error('ops must be a non-empty array.')
  }
  return rawValue.map((entry, index) => {
    const record = readRecord(entry)
    const type = readRequiredString(record, 'type')

    // Guard against raw blob injection
    if ('editorState' in record || 'timelineIr' in record) {
      throw new Error(
        'Raw editorState/timelineIr patches are not supported. Use semantic ops only.'
      )
    }

    switch (type) {
      case 'advance-gate':
        return {
          type,
          gate: readRequiredString(record, 'gate') as TWorkflowSemanticOp & { type: 'advance-gate' } extends { gate: infer G } ? G : never,
          notes: readOptionalString(record, 'notes'),
        } as TWorkflowSemanticOp

      case 'set-design':
        return { type, content: readRequiredString(record, 'content') } as TWorkflowSemanticOp

      case 'set-script':
        return { type, content: readRequiredString(record, 'content') } as TWorkflowSemanticOp

      case 'set-storyboard':
        return { type, storyboard: readStoryboard(record.storyboard) } as TWorkflowSemanticOp

      case 'replace-brief-fields': {
        const patch: Partial<IWorkflowBrief> = {
          topic: readOptionalString(record, 'topic'),
          goal: readOptionalString(record, 'goal'),
          audience: readOptionalString(record, 'audience'),
          ratio: readOptionalLiteralString(record, 'ratio', EXPORT_RATIO_VALUES),
          fps:
            typeof record.fps === 'number' && (record.fps === 30 || record.fps === 60)
              ? record.fps
              : undefined,
          durationTargetSeconds:
            typeof record.durationTargetSeconds === 'number' &&
            Number.isFinite(record.durationTargetSeconds)
              ? record.durationTargetSeconds
              : undefined,
          tone: readOptionalString(record, 'tone'),
          cta: readOptionalString(record, 'cta'),
          transcript: readOptionalString(record, 'transcript'),
        }
        if (Object.values(patch).every((v) => v === undefined)) {
          throw new Error('replace-brief-fields requires at least one brief field.')
        }
        return { type, patch } as TWorkflowSemanticOp
      }

      case 'rewrite-scene-copy':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          copy: readRecord(record.copy),
        } as TWorkflowSemanticOp

      case 'retime-scene':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          durationMs: readRequiredNumber(record, 'durationMs'),
        } as TWorkflowSemanticOp

      case 'reorder-scenes': {
        const sceneIds = readOptionalStringArray(record, 'sceneIds')
        if (!sceneIds || sceneIds.length === 0) {
          throw new Error('sceneIds is required for reorder-scenes.')
        }
        return { type, sceneIds } as TWorkflowSemanticOp
      }

      case 'split-scene':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          nextSceneId: readRequiredString(record, 'nextSceneId'),
          splitDurationMs: readRequiredNumber(record, 'splitDurationMs'),
          copyPatch: isRecord(record.copyPatch) ? (record.copyPatch) : undefined,
        } as TWorkflowSemanticOp

      case 'merge-scenes': {
        const sceneIds = readOptionalStringArray(record, 'sceneIds')
        if (!sceneIds || sceneIds.length !== 2) {
          throw new Error('merge-scenes requires exactly 2 sceneIds.')
        }
        return {
          type,
          sceneIds: [sceneIds[0], sceneIds[1]] as [string, string],
          nextSceneId: readRequiredString(record, 'nextSceneId'),
        } as TWorkflowSemanticOp
      }

      case 'set-scene-block':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          blockRef: readRequiredString(record, 'blockRef'),
        } as TWorkflowSemanticOp

      case 'set-scene-block-override':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          override: readRecord(record.override),
        } as TWorkflowSemanticOp

      case 'bind-asset': {
        const bindingRaw = readRecord(record.binding)
        const bindingType = readOptionalString(bindingRaw, 'type')
        if (!bindingType || !WORKFLOW_BINDING_TYPE_VALUES.includes(bindingType as (typeof WORKFLOW_BINDING_TYPE_VALUES)[number])) {
          throw new Error('binding.type must be one of: ' + WORKFLOW_BINDING_TYPE_VALUES.join(', '))
        }
        const binding =
          bindingType === 'asset'
            ? { type: 'asset' as const, assetId: readRequiredString(bindingRaw, 'assetId') }
            : { type: 'illustration' as const, illustrationName: readRequiredString(bindingRaw, 'illustrationName') }
        return {
          type,
          sceneId: readOptionalString(record, 'sceneId'),
          slotKey: readRequiredString(record, 'slotKey'),
          binding,
        } as TWorkflowSemanticOp
      }

      case 'set-transition': {
        const transitionRaw = record.transition
        const transition =
          transitionRaw === null
            ? null
            : {
                type: readRequiredString(readRecord(transitionRaw), 'type'),
                durationMs: readOptionalInteger(readRecord(transitionRaw), 'durationMs'),
              }
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          transition,
        } as TWorkflowSemanticOp
      }

      case 'set-clip-geometry':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          clipId: readRequiredString(record, 'clipId'),
          position: isRecord(record.position)
            ? {
                x: typeof (record.position).x === 'number'
                  ? (record.position).x
                  : undefined,
                y: typeof (record.position).y === 'number'
                  ? (record.position).y
                  : undefined,
              }
            : undefined,
          scale: typeof record.scale === 'number' ? record.scale : undefined,
          rotation: typeof record.rotation === 'number' ? record.rotation : undefined,
          opacity: typeof record.opacity === 'number' ? record.opacity : undefined,
        } as TWorkflowSemanticOp

      case 'set-clip-asset-crop':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          clipId: readRequiredString(record, 'clipId'),
          crop: readRecord(record.crop),
        } as TWorkflowSemanticOp

      case 'set-text-color':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          clipId: readRequiredString(record, 'clipId'),
          color: readRequiredString(record, 'color'),
        } as TWorkflowSemanticOp

      case 'set-track-z-order': {
        const trackOrder = readOptionalStringArray(record, 'trackOrder')
        if (!trackOrder) throw new Error('trackOrder is required for set-track-z-order.')
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          trackOrder,
        } as TWorkflowSemanticOp
      }

      case 'insert-clip':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          trackId: readRequiredString(record, 'trackId'),
          clip: record.clip,
        } as TWorkflowSemanticOp

      case 'remove-clip':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          clipId: readRequiredString(record, 'clipId'),
        } as TWorkflowSemanticOp

      case 'apply-sparse-patch':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          patch: readSparseScene(record.patch),
        } as TWorkflowSemanticOp

      case 'rebuild-scene-from-storyboard':
        return {
          type,
          sceneId: readRequiredString(record, 'sceneId'),
          reason: readOptionalString(record, 'reason'),
        } as TWorkflowSemanticOp

      default:
        throw new Error(
          'Unsupported op at ops[' +
            index +
            '].type: ' +
            type +
            '. Semantic op types must use kebab-case.'
        )
    }
  })
}

// ---------------------------------------------------------------------------
// Binding validation (resolve illustration names, verify asset IDs)
// ---------------------------------------------------------------------------

const validateBindOps = async (params: {
  client: IIndreamClientLike
  ops: TWorkflowSemanticOp[]
}) => {
  for (const op of params.ops) {
    if (op.type !== 'bind-asset') continue
    if (op.binding.type === 'asset') {
      await params.client.assets.get(op.binding.assetId)
      continue
    }
    const resolved = await pickIllustrationName({
      client: params.client,
      illustrationName: op.binding.illustrationName,
    })
    op.binding = { type: 'illustration', illustrationName: resolved.illustrationName }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const registerIndreamTools = (
  api: OpenClawPluginApi,
  deps: IIndreamToolDeps = {}
): IRegisteredToolsSummary => {
  const collections = buildRegisteredCollection()

  const wrapToolWithArtifactWorkspace = (
    tool: TLooseTool | TLooseToolFactory
  ): TLooseToolFactory => {
    return (ctx) => {
      artifactStore.setWorkspaceDir(ctx.workspaceDir || process.cwd())
      return typeof tool === 'function' ? tool(ctx) : tool
    }
  }

  const register = (
    name: string,
    tool: TLooseTool | TLooseToolFactory,
    toolIsOptional = false
  ) => {
    api.registerTool(
      withDefaultLabel(name, wrapToolWithArtifactWorkspace(tool)) as Parameters<
        OpenClawPluginApi['registerTool']
      >[0],
      toolIsOptional ? { optional: true } : undefined
    )
    const collection = toolIsOptional ? collections.optional : collections.required
    collection.push({ name, optional: toolIsOptional })
  }

  // -------------------------------------------------------------------------
  // Misc / capabilities
  // -------------------------------------------------------------------------

  register('indream_editor_capabilities', {
    name: 'indream_editor_capabilities',
    label: 'Editor Capabilities',
    description:
      'Read current editor capabilities. Use this for editor enums/presets only. Returns only requested fields when fields[] is provided.',
    parameters: Type.Object({
      fields: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        const payload = await client.editor.capabilities()
        return filterCapabilitiesPayload(payload, readOptionalStringArray(params, 'fields'))
      })
    },
  })

  // -------------------------------------------------------------------------
  // Illustration search
  // -------------------------------------------------------------------------

  register('indream_illustrations_search', {
    name: 'indream_illustrations_search',
    label: 'Search Illustrations',
    description:
      'Search hand-drawn illustration names by a single-word keyword. Do not pass phrases or full sentences.',
    parameters: Type.Object(
      {
        q: illustrationSearchQuerySchema,
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        return await searchIllustrations({
          client,
          q: readRequiredString(params, 'q'),
          limit: readOptionalInteger(params, 'limit'),
        })
      })
    },
  })

  // -------------------------------------------------------------------------
  // Asset tools
  // -------------------------------------------------------------------------

  register(
    'indream_assets_upload',
    (ctx) => ({
      name: 'indream_assets_upload',
      label: 'Upload Asset',
      description:
        'Upload a local file path or remote HTTP/HTTPS URL. After upload, runs sharp analysis on image assets and writes analysis to cache. Returns asset record with optional analysis fields.',
      parameters: Type.Object({
        filePath: Type.Optional(Type.String()),
        sourceUrl: Type.Optional(Type.String()),
        filename: Type.Optional(Type.String()),
        contentType: Type.Optional(Type.String()),
        projectId: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        try {
          const params = readRecord(rawParams)
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

          // Run sharp analysis for image-type assets
          let analysis = null
          const assetTypeLower = (normalizedAsset.type || '').toLowerCase()
          if (assetTypeLower === 'image' || assetTypeLower === 'gif') {
            const sharpAvailable = await isSharpAvailable()
            if (sharpAvailable) {
              analysis = await analyzeImageBuffer({
                assetId: normalizedAsset.assetId,
                buffer: uploadSource.body,
                mimeType: normalizedAsset.mimetype,
                width: normalizedAsset.width ?? undefined,
                height: normalizedAsset.height ?? undefined,
                durationInSeconds: normalizedAsset.duration ?? undefined,
                hasAudio: normalizedAsset.hasAudioTrack ?? null,
              })
              if (analysis) {
                writeAnalysisCache(analysis)
              }
            }
          }

          const { createJsonResult } = await import('../results')
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
            analysis: analysis ?? undefined,
          })
        } catch (error) {
          return createErrorResult(error)
        }
      },
    }),
    true
  )

  register('indream_assets_get', {
    name: 'indream_assets_get',
    label: 'Get Asset',
    description:
      'Get one reusable asset. Also returns cached image analysis if available. Use this when you need file metadata for a workflow binding.',
    parameters: Type.Object({
      assetId: Type.String(),
    }),
    async execute(_id, rawParams) {
      const params = readRecord(rawParams)
      return await executeWithClient(api, deps, async (client) => {
        const assetId = readRequiredString(params, 'assetId')
        const asset = await client.assets.get(assetId)
        const analysis = readAnalysisCache(assetId)
        if (analysis) {
          return { ...readRecord(asset), analysis }
        }
        return asset
      })
    },
  })

  // -------------------------------------------------------------------------
  // Workflow CRUD tools
  // -------------------------------------------------------------------------

  register('indream_video_workflow_init', {
    name: 'indream_video_workflow_init',
    label: 'Init Video Workflow',
    description:
      'Create a new v6 workflow artifact from a brief. Returns artifactId and initial status summary.',
    parameters: Type.Object(
      {
        brief: Type.Object(
          {
            topic: Type.String(),
            goal: Type.Optional(Type.String()),
            audience: Type.Optional(Type.String()),
            ratio: Type.Optional(ratioEnumSchema),
            fps: Type.Optional(fpsEnumSchema),
            durationTargetSeconds: Type.Optional(Type.Number({ minimum: 1 })),
            tone: Type.Optional(Type.String()),
            cta: Type.Optional(Type.String()),
            transcript: Type.Optional(Type.String()),
          },
          { additionalProperties: false }
        ),
        routeMode: Type.Optional(workflowModeSchema),
        outputFormat: Type.Optional(formatEnumSchema),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const brief = readWorkflowBrief(params.brief)
        const routeMode = routeWorkflowMode(brief, readOptionalString(params, 'routeMode'))
        const outputFormat = readOptionalLiteralString(params, 'outputFormat', EXPORT_FORMAT_VALUES) ?? 'mp4'

        const emptyStoryboard: IStoryboardV6 = {
          version: 'v6',
          routeMode,
          output: {
            ratio: brief.ratio ?? '16:9',
            fps: brief.fps ?? 30,
            durationTargetSeconds: brief.durationTargetSeconds,
            format: outputFormat,
            scale: 1,
          },
          scenes: [],
          globalStyle: {
            theme: 'default',
            accentColor: '#0066FF',
            backgroundColor: '#000000',
          },
          reviewContracts: {
            enforceTrackOverlapFree: true,
            enforceSceneDurationMatch: true,
            enforceCtaSingleLine: true,
          },
        }

        const emptyReview = {
          status: 'ok' as const,
          blockingCount: 0,
          warningCount: 0,
          diagnostics: [],
          appliedRepairs: [],
        }

        const summary = summarizeStoryboard({
          storyboard: emptyStoryboard,
          currentGate: 'capture',
          submittedSceneIds: [],
        })

        // Use a placeholder artifactDir; fileStore will resolve it
        const artifact = artifactStore.createWorkflow({
          routeMode,
          brief,
          storyboard: emptyStoryboard,
          latestReview: emptyReview,
          summary,
          artifactDir: '',
        })

        const payload = {
          artifactId: artifact.artifactId,
          routeMode,
          currentGate: artifact.currentGate,
          gateStatus: buildGateStatusSummary(artifact.gateStatuses),
          summary,
          statusText: buildArtifactStatusText(artifact),
        }

        const { createJsonResult } = await import('../results')
        return createJsonResult(payload)
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_set_design', {
    name: 'indream_video_workflow_set_design',
    label: 'Set Workflow Design',
    description:
      'Write design markdown for a workflow artifact. Applies set-design semantic op and persists to file.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        content: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const content = readRequiredString(params, 'content')

        const artifact = artifactStore.getWorkflow(artifactId)
        const result = applySemanticOp(artifact, { type: 'set-design', content })
        if (!result.ok) {
          throw new Error(result.error ?? 'set-design op failed.')
        }

        // Write file via fileStore when available
        const fileStore = artifactStore.getFileStore()
        if (fileStore) {
          fileStore.writePhaseArtifact(artifactId, 'design', content)
        }

        const { createJsonResult } = await import('../results')
        return createJsonResult({ ok: true, artifactId, gate: result.artifact.currentGate })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_set_script', {
    name: 'indream_video_workflow_set_script',
    label: 'Set Workflow Script',
    description:
      'Write script markdown for a workflow artifact. Applies set-script semantic op and persists to file.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        content: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const content = readRequiredString(params, 'content')

        const artifact = artifactStore.getWorkflow(artifactId)
        const result = applySemanticOp(artifact, { type: 'set-script', content })
        if (!result.ok) {
          throw new Error(result.error ?? 'set-script op failed.')
        }

        const fileStore = artifactStore.getFileStore()
        if (fileStore) {
          fileStore.writePhaseArtifact(artifactId, 'script', content)
        }

        const { createJsonResult } = await import('../results')
        return createJsonResult({ ok: true, artifactId, gate: result.artifact.currentGate })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_set_storyboard', {
    name: 'indream_video_workflow_set_storyboard',
    label: 'Set Workflow Storyboard',
    description:
      'Set the full storyboard object for a workflow artifact. Applies set-storyboard semantic op. Returns updated summary.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        storyboard: Type.Any(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const storyboard = readStoryboard(params.storyboard)

        const artifact = artifactStore.getWorkflow(artifactId)
        const result = applySemanticOp(artifact, { type: 'set-storyboard', storyboard })
        if (!result.ok) {
          throw new Error(result.error ?? 'set-storyboard op failed.')
        }

        const updated = result.artifact
        const summary = summarizeStoryboard({
          storyboard: updated.storyboard,
          currentGate: updated.currentGate,
          submittedSceneIds: updated.submittedSceneIds,
        })

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          ok: true,
          artifactId,
          storyboardHash: hashStoryboard(updated.storyboard),
          summary,
          statusText: buildArtifactStatusText(updated),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_revise', {
    name: 'indream_video_workflow_revise',
    label: 'Revise Video Workflow',
    description:
      'Apply one or more semantic ops to a workflow artifact and return an updated summary.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        ops: Type.Array(Type.Any(), { minItems: 1 }),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        let artifact = artifactStore.getWorkflow(artifactId)

        const ops = readSemanticOps(params.ops)
        const { client } = ensureClient(api, deps)
        await validateBindOps({ client, ops })

        const errors: string[] = []
        for (const op of ops) {
          const result = applySemanticOp(artifact, op)
          if (!result.ok) {
            errors.push(`${op.type}: ${result.error ?? 'unknown error'}`)
          } else {
            artifact = result.artifact
          }
        }

        const summary = summarizeStoryboard({
          storyboard: artifact.storyboard,
          currentGate: artifact.currentGate,
          submittedSceneIds: artifact.submittedSceneIds,
        })

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          artifactId,
          ok: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
          storyboardHash: hashStoryboard(artifact.storyboard),
          gateStatus: buildGateStatusSummary(artifact.gateStatuses),
          summary,
          statusText: buildArtifactStatusText(artifact),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_review', {
    name: 'indream_video_workflow_review',
    label: 'Review Video Workflow',
    description:
      'Run the deterministic reviewer for the current workflow artifact and return compact diagnostics.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        focus: Type.Optional(workflowFocusSchema),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const artifact = artifactStore.getWorkflow(artifactId)
        const { client } = ensureClient(api, deps)

        const focus = readOptionalLiteralString(params, 'focus', WORKFLOW_REVIEW_FOCUS_VALUES) ?? 'all'
        const reviewSummary = await reviewWorkflow({
          client,
          artifact,
          focus,
        })

        artifactStore.updateWorkflow(artifactId, { latestReview: reviewSummary })

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          artifactId,
          reviewSummary,
          gateStatus: buildGateStatusSummary(artifact.gateStatuses),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_gate_advance', {
    name: 'indream_video_workflow_gate_advance',
    label: 'Advance Workflow Gate',
    description:
      'Advance a workflow artifact to the next gate. Gate order: capture → design → script → storyboard → build → static → snapshot → commit.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        gate: workflowGateSchema,
        notes: Type.Optional(Type.String()),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const gate = readOptionalLiteralString(params, 'gate', WORKFLOW_GATE_VALUES)
        if (!gate) {
          throw new Error('gate is required and must be one of: ' + WORKFLOW_GATE_VALUES.join(', '))
        }
        const notes = readOptionalString(params, 'notes')

        const artifact = artifactStore.getWorkflow(artifactId)
        const result = applySemanticOp(artifact, { type: 'advance-gate', gate, notes })
        if (!result.ok) {
          throw new Error(result.error ?? 'advance-gate failed.')
        }

        const updated = result.artifact
        const { createJsonResult } = await import('../results')
        return createJsonResult({
          ok: true,
          artifactId,
          currentGate: updated.currentGate,
          gateStatus: buildGateStatusSummary(updated.gateStatuses),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Scene build tools
  // -------------------------------------------------------------------------

  register('indream_video_workflow_scene_submit', {
    name: 'indream_video_workflow_scene_submit',
    label: 'Submit Scene',
    description:
      'Submit a sparse scene JSON fragment for a workflow artifact scene. Saves the scene and updates submission tracking.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        sceneId: Type.String(),
        sparse: Type.Any(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const sceneId = readRequiredString(params, 'sceneId')
        const sparse = readSceneSubmitSparse(params.sparse, sceneId)

        const artifact = artifactStore.getWorkflow(artifactId)

        // Verify sceneId exists in storyboard
        const sceneExists = artifact.storyboard.scenes.some((s) => s.sceneId === sceneId)
        if (!sceneExists) {
          throw new Error(`Scene "${sceneId}" not found in storyboard.`)
        }

        // Persist via fileStore
        const fileStore = artifactStore.getFileStore()
        if (fileStore) {
          fileStore.writeSceneSparse(artifactId, sceneId, sparse)
        }

        const storyboard = {
          ...artifact.storyboard,
          scenes: artifact.storyboard.scenes.map((scene) =>
            scene.sceneId === sceneId ? { ...scene, customSparse: sparse } : scene
          ),
        }

        // When a scene is submitted, keep sparse in the artifact snapshot as
        // well as on disk so later build/review/commit steps do not read stale
        // storyboard data.
        const submittedSceneIds = artifact.submittedSceneIds.includes(sceneId)
          ? artifact.submittedSceneIds
          : [...artifact.submittedSceneIds, sceneId]

        const updatedArtifact = artifactStore.updateWorkflow(artifactId, {
          storyboard,
          submittedSceneIds,
        })

        const allSceneIds = updatedArtifact.storyboard.scenes.map((s) => s.sceneId)
        const sceneListStatus = allSceneIds.map((sid) => ({
          sceneId: sid,
          submitted: submittedSceneIds.includes(sid),
        }))

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          ok: true,
          artifactId,
          sceneId,
          summary: updatedArtifact.summary,
          sceneListStatus,
          allSubmitted: allSceneIds.every((sid) => submittedSceneIds.includes(sid)),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_scene_list', {
    name: 'indream_video_workflow_scene_list',
    label: 'List Scenes',
    description:
      'List scenes in a workflow artifact with their submission status.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const artifact = artifactStore.getWorkflow(artifactId)

        const scenes = artifact.storyboard.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          intent: scene.intent,
          blockRef: scene.blockRef,
          durationMs: scene.durationMs,
          submitted: artifact.submittedSceneIds.includes(scene.sceneId),
        }))

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          artifactId,
          scenes,
          totalScenes: scenes.length,
          submittedCount: artifact.submittedSceneIds.length,
          allSubmitted: scenes.length > 0 && scenes.every((s) => s.submitted),
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_build', {
    name: 'indream_video_workflow_build',
    label: 'Build Workflow',
    description:
      'Trigger storyboard compilation to editor-state.json. Requires all scenes to be submitted. Returns editorStateHash.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const artifact = artifactStore.getWorkflow(artifactId)

        // Check all scenes are submitted
        const allSceneIds = artifact.storyboard.scenes.map((s) => s.sceneId)
        const notSubmitted = allSceneIds.filter(
          (id) => !artifact.submittedSceneIds.includes(id)
        )
        if (notSubmitted.length > 0) {
          throw new Error(
            'All scenes must be submitted before build. Missing: ' + notSubmitted.join(', ')
          )
        }

        const { client } = ensureClient(api, deps)
        const compileResult = await compileWorkflowArtifact({
          client,
          artifact,
        })

        const fileStore = artifactStore.getFileStore()
        if (fileStore) {
          fileStore.writePhaseArtifact(artifactId, 'editor-state', compileResult.editorState)
        }

        if (!compileResult.valid || compileResult.validationErrors.length > 0) {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            status: 'failed',
            artifactId,
            editorStateHash: compileResult.editorStateHash,
            message: 'editor.validate failed',
            errors: compileResult.validationErrors,
          })
        }

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          ok: true,
          artifactId,
          editorStateHash: compileResult.editorStateHash,
          sceneCount: artifact.storyboard.scenes.length,
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Block tools
  // -------------------------------------------------------------------------

  register('indream_video_workflow_block_list', {
    name: 'indream_video_workflow_block_list',
    label: 'List Blocks',
    description: 'List all available block definitions (id, description, slots, supported ratios).',
    parameters: Type.Object({}),
    async execute(_id, _rawParams) {
      try {
        await Promise.resolve()
        const blocks = listBlocks()
        const { createJsonResult } = await import('../results')
        return createJsonResult({ blocks })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register('indream_video_workflow_block_read', {
    name: 'indream_video_workflow_block_read',
    label: 'Read Block',
    description: 'Get full block definition including skeleton and defaults by block ID.',
    parameters: Type.Object(
      {
        blockId: Type.String(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        await Promise.resolve()
        const params = readRecord(rawParams)
        const blockId = readRequiredString(params, 'blockId')
        const block = getBlock(blockId)
        if (!block) {
          throw new Error('Unknown blockId: ' + blockId)
        }
        const { createJsonResult } = await import('../results')
        return createJsonResult(block)
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Commit / project / export tools
  // -------------------------------------------------------------------------

  register('indream_video_workflow_commit', {
    name: 'indream_video_workflow_commit',
    label: 'Commit Video Workflow',
    description:
      'Run the shared compile pipeline and create a compiled artifact. Requires commit gate to be reachable (no blocking review errors).',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        let artifact = artifactStore.getWorkflow(artifactId)
        const { client } = ensureClient(api, deps)

        // Run full review before commit
        const reviewSummary = await reviewWorkflow({ client, artifact, focus: 'all' })
        artifact = artifactStore.updateWorkflow(artifactId, { latestReview: reviewSummary })
        if (reviewSummary.blockingCount > 0) {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            status: 'failed',
            artifactId,
            reviewSummary,
            message: `${reviewSummary.blockingCount} blocking error(s) must be resolved before commit.`,
          })
        }

        const gateAdvance = advanceGate(artifact, 'commit')
        if (!gateAdvance.ok) {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            status: 'failed',
            artifactId,
            reviewSummary,
            message: gateAdvance.error || 'Commit gate prerequisites are not satisfied.',
          })
        }

        const compileResult = await compileWorkflowArtifact({
          client,
          artifact,
        })
        if (!compileResult.valid || compileResult.validationErrors.length > 0) {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            status: 'failed',
            artifactId,
            message: 'editor.validate failed',
            errors: compileResult.validationErrors,
          })
        }

        const compiledArtifact = artifactStore.createCompiled({
          workflowArtifactId: artifactId,
          editorState: compileResult.editorState,
          reviewSnapshot: reviewSummary,
        })

        // Write editor-state to disk
        const fileStore = artifactStore.getFileStore()
        if (fileStore) {
          fileStore.writePhaseArtifact(artifactId, 'editor-state', compileResult.editorState)
        }

        artifactStore.updateWorkflow(artifactId, {
          currentGate: 'commit',
          gateStatuses: gateAdvance.updatedStatuses,
        })

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          status: 'ok',
          compiledArtifactId: compiledArtifact.artifactId,
          workflowArtifactId: artifactId,
          editorStateHash: compileResult.editorStateHash,
          reviewSummary,
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  register(
    'indream_video_projects_create',
    {
      name: 'indream_video_projects_create',
      label: 'Create Video Project',
      description:
        'Create a persisted project from a compiled workflow artifact. Requires a compiled artifactId.',
      parameters: Type.Object({
        artifactId: Type.String(),
        title: Type.Optional(Type.String()),
        description: Type.Optional(Type.String()),
        idempotencyKey: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          const compiledArtifact = resolveCompiledArtifact(readRequiredString(params, 'artifactId'))
          const workflowArtifact = artifactStore.getWorkflow(compiledArtifact.workflowArtifactId)
          const created = await client.projects.create(
            {
              title: readOptionalString(params, 'title') || workflowArtifact.brief.topic,
              description: readOptionalString(params, 'description') || workflowArtifact.brief.goal || null,
              editorState: compiledArtifact.editorState,
            },
            {
              idempotencyKey: readOptionalString(params, 'idempotencyKey'),
            }
          )
          const project = stripEditorState(created) as Record<string, unknown>
          const projectId = typeof project.projectId === 'string' ? project.projectId : undefined
          if (projectId) {
            artifactStore.bindProject(projectId, workflowArtifact.artifactId, compiledArtifact.artifactId)
          }
          return {
            project,
            artifactId: compiledArtifact.artifactId,
            workflowArtifactId: workflowArtifact.artifactId,
          }
        })
      },
    },
    true
  )

  register(
    'indream_video_projects_sync',
    {
      name: 'indream_video_projects_sync',
      label: 'Sync Video Project',
      description:
        'Sync a persisted project from a compiled workflow artifact. Requires projectId and a compiled artifactId.',
      parameters: Type.Object({
        projectId: Type.String(),
        artifactId: Type.String(),
        stateVersion: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          const compiledArtifact = resolveCompiledArtifact(readRequiredString(params, 'artifactId'))
          const synced = await client.projects.sync(readRequiredString(params, 'projectId'), {
            editorState: compiledArtifact.editorState,
            stateVersion: readOptionalString(params, 'stateVersion'),
          })
          artifactStore.bindProject(
            readRequiredString(params, 'projectId'),
            compiledArtifact.workflowArtifactId,
            compiledArtifact.artifactId
          )
          return {
            project: stripEditorState(synced),
            artifactId: compiledArtifact.artifactId,
            workflowArtifactId: compiledArtifact.workflowArtifactId,
          }
        })
      },
    },
    true
  )

  register(
    'indream_video_exports_create',
    {
      name: 'indream_video_exports_create',
      label: 'Create Video Export',
      description:
        'Create a stateless export from a compiled workflow artifact. Explicit-only — not triggered automatically.',
      parameters: Type.Object({
        artifactId: Type.String(),
        clientTaskId: Type.Optional(Type.String()),
        fps: Type.Optional(fpsEnumSchema),
        compositionWidth: Type.Optional(Type.Integer({ minimum: 1 })),
        compositionHeight: Type.Optional(Type.Integer({ minimum: 1 })),
        ratio: Type.Optional(ratioEnumSchema),
        scale: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
        format: Type.Optional(formatEnumSchema),
        callbackUrl: Type.Optional(Type.String()),
        callbackHeaders: Type.Optional(Type.Record(Type.String(), Type.String())),
        idempotencyKey: Type.Optional(Type.String()),
      }),
      async execute(_id, rawParams) {
        const params = readRecord(rawParams)
        return await executeWithClient(api, deps, async (client) => {
          const compiledArtifact = resolveCompiledArtifact(readRequiredString(params, 'artifactId'))
          const workflowArtifact = artifactStore.getWorkflow(compiledArtifact.workflowArtifactId)
          const output = workflowArtifact.storyboard.output
          return await client.exports.create(
            {
              editorState: compiledArtifact.editorState,
              clientTaskId: readOptionalString(params, 'clientTaskId'),
              fps:
                (typeof params.fps === 'number' && (params.fps === 30 || params.fps === 60)
                  ? params.fps
                  : undefined) || output.fps,
              compositionWidth: readOptionalInteger(params, 'compositionWidth'),
              compositionHeight: readOptionalInteger(params, 'compositionHeight'),
              ratio:
                readOptionalLiteralString(params, 'ratio', EXPORT_RATIO_VALUES) || output.ratio,
              scale:
                typeof params.scale === 'number'
                  ? readRequiredNumber(params, 'scale')
                  : output.scale,
              format:
                readOptionalLiteralString(params, 'format', EXPORT_FORMAT_VALUES) || output.format,
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

  register('indream_exports_get', {
    name: 'indream_exports_get',
    label: 'Get Export',
    description: 'Get one export task snapshot.',
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

  register('indream_exports_download', {
    name: 'indream_exports_download',
    label: 'Download Export',
    description: 'Poll an export task until it reaches a terminal state (completed or failed).',
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

  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  register('indream_video_workflow_snapshot', {
    name: 'indream_video_workflow_snapshot',
    label: 'Workflow Snapshot',
    description:
      'Request preview frame(s) for a workflow artifact at given timestamps (seconds). Returns result or pending-api message.',
    parameters: Type.Object(
      {
        artifactId: Type.String(),
        timestamps: Type.Array(Type.Number(), { minItems: 1 }),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        const params = readRecord(rawParams)
        const artifactId = readRequiredString(params, 'artifactId')
        const timestamps = Array.isArray(params.timestamps)
          ? (params.timestamps as number[]).filter((t) => typeof t === 'number')
          : []
        if (timestamps.length === 0) {
          throw new Error('timestamps must be a non-empty array of numbers.')
        }

        const artifact = artifactStore.getWorkflow(artifactId)
        const editorState = expandStoryboard(artifact.storyboard)
        const { client } = ensureClient(api, deps)

        const result = requestPreviewFrames(
          editorState,
          { timestamps },
          client as unknown as { previewFrame?: (...args: unknown[]) => Promise<unknown> }
        )

        const { createJsonResult } = await import('../results')
        return createJsonResult({ artifactId, ...result })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Asset analysis
  // -------------------------------------------------------------------------

  register('indream_asset_analyze', {
    name: 'indream_asset_analyze',
    label: 'Analyze Asset',
    description:
      'Manually trigger or re-run image analysis for an asset. Re-fetches the asset buffer and runs sharp analysis. Returns analysis result.',
    parameters: Type.Object(
      {
        assetId: Type.String(),
        forceRefresh: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false }
    ),
    async execute(_id, rawParams) {
      try {
        const params = readRecord(rawParams)
        const assetId = readRequiredString(params, 'assetId')
        const forceRefresh = params.forceRefresh === true

        // Check cache first (unless forceRefresh)
        if (!forceRefresh) {
          const cached = readAnalysisCache(assetId)
          if (cached) {
            const { createJsonResult } = await import('../results')
            return createJsonResult({ assetId, fromCache: true, analysis: cached })
          }
        }

        const { client } = ensureClient(api, deps)

        // Fetch asset metadata
        const assetRaw = await client.assets.get(assetId)
        const asset = normalizeOpenApiAssetRecord(assetRaw, 'asset')
        const assetTypeLower = (asset.type || '').toLowerCase()

        if (assetTypeLower !== 'image' && assetTypeLower !== 'gif') {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            assetId,
            analysis: null,
            message: `Analysis is only available for image/gif assets. Asset type: ${asset.type}`,
          })
        }

        const sharpAvailable = await isSharpAvailable()
        if (!sharpAvailable) {
          const { createJsonResult } = await import('../results')
          return createJsonResult({
            assetId,
            analysis: null,
            message: 'sharp is not installed. Run: npm install sharp',
          })
        }

        // Download image buffer
        const fetchFn = deps.fetchFn ?? globalThis.fetch
        const response = await fetchFn(asset.fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to download asset: HTTP ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const analysis = await analyzeImageBuffer({
          assetId,
          buffer,
          mimeType: asset.mimetype,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          durationInSeconds: asset.duration ?? undefined,
          hasAudio: asset.hasAudioTrack ?? null,
        })

        if (analysis) {
          writeAnalysisCache(analysis)
        }

        // Map to editor asset type for convenience
        const editorMappingResult = mapOpenApiAssetToEditorAsset({
          id: assetId,
          alias: asset.filename,
          asset,
        })

        const { createJsonResult } = await import('../results')
        return createJsonResult({
          assetId,
          fromCache: false,
          analysis,
          editorAsset: editorMappingResult.ok ? editorMappingResult.asset : null,
          editorAssetError: !editorMappingResult.ok ? editorMappingResult.error : undefined,
        })
      } catch (error) {
        return createErrorResult(error)
      }
    },
  })

  return collections
}

export type {
  IIndreamClientLike,
  IIndreamToolDeps,
  IRegisterToolRecord,
  IRegisteredToolsSummary,
}
