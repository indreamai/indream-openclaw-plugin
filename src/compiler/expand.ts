import type { TEditorStateV1 } from '@indreamai/client'
import type {
  IStoryboardV6,
  IStoryboardScene,
  ISparseClipInline,
  ISparseSceneFragment,
  TWorkflowBinding,
} from '../workflow/types'
import {
  msToTicks,
  secondsToTicks,
  animatedScalar,
  TIMEBASE_TICKS_PER_SECOND,
  DEFAULT_COMPOSITION_DIMENSIONS,
  IMAGE_ITEM_DEFAULTS,
  VIDEO_ITEM_DEFAULTS,
  GIF_ITEM_DEFAULTS,
  LOTTIE_ITEM_DEFAULTS,
  AUDIO_ITEM_DEFAULTS,
  TEXT_ITEM_DEFAULTS,
  TEXT_FONT_DEFAULTS,
  CAPTIONS_ITEM_DEFAULTS,
  SOLID_ITEM_DEFAULTS,
  ILLUSTRATION_ITEM_DEFAULTS,
  type TAnimatedNumberTrack,
} from './defaults'
import { expandOptionalShortcut } from './shortcuts'
import { getBlock } from './blocks/index'
import type { IResolvedManagedAsset } from './editor-asset-mapper'

export interface IExpandContext {
  compositionWidth: number
  compositionHeight: number
  sceneId: string
  sceneStartMs: number
  durationMs: number
  /** assetId → resolved asset record */
  assets: Map<string, IResolvedManagedAsset>
  /** slotKey → resolved binding for this scene */
  slotBindings: Map<string, TWorkflowBinding>
  /** override values from storyboard (blockOverride + copy) */
  overrides: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Placeholder resolution helpers
// ---------------------------------------------------------------------------

const resolvePlaceholder = (value: unknown, ctx: IExpandContext): unknown => {
  if (typeof value !== 'string') return value
  const s = value.trim()

  const resolveTemplateKey = (key: string): unknown => {
    if (key === 'durationMs') return ctx.durationMs
    if (key === 'compositionWidth') return ctx.compositionWidth
    if (key === 'compositionHeight') return ctx.compositionHeight
    if (key === 'sceneId') return ctx.sceneId
    if (key in ctx.overrides) return ctx.overrides[key]
    if (key.startsWith('slot:')) {
      const slotKey = key.slice(5)
      const binding = ctx.slotBindings.get(slotKey)
      if (!binding) return null
      return binding.type === 'asset' ? binding.assetId : binding.illustrationName
    }
    return undefined
  }

  if (s === '{durationMs}') return ctx.durationMs
  if (s === '{compositionWidth}') return ctx.compositionWidth
  if (s === '{compositionHeight}') return ctx.compositionHeight
  if (s === '{sceneId}') return ctx.sceneId

  // Check overrides first
  const overrideKey = s.replace(/^\{/, '').replace(/\}$/, '')
  if (s.startsWith('{') && s.endsWith('}')) {
    const resolvedValue = resolveTemplateKey(overrideKey)
    if (resolvedValue !== undefined) {
      return resolvedValue
    }
  }

  // Inline template substitution (e.g. "→  {item1}")
  return s.replace(/\{([^}]+)\}/g, (_match: string, key: string) => {
    const resolvedValue = resolveTemplateKey(key)
    if (
      typeof resolvedValue === 'string' ||
      typeof resolvedValue === 'number' ||
      typeof resolvedValue === 'boolean' ||
      typeof resolvedValue === 'bigint'
    ) {
      return String(resolvedValue)
    }
    return ''
  })
}

const resolveDeep = (obj: unknown, ctx: IExpandContext): unknown => {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return resolvePlaceholder(obj, ctx)
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((item) => resolveDeep(item, ctx))
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const resolvedKey = String(resolvePlaceholder(k, ctx))
    result[resolvedKey] = resolveDeep(v, ctx)
  }
  return result
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const expandPosition = (
  position: { x?: unknown; y?: unknown } | undefined,
  compositionWidth: number,
  compositionHeight: number
): { top: TAnimatedNumberTrack; left: TAnimatedNumberTrack } => {
  const x = typeof position?.x === 'number' ? position.x : 0
  const y = typeof position?.y === 'number' ? position.y : 0
  // Values ≤ 1 are treated as fractions; > 1 as absolute pixels
  const left = x <= 1 ? x * compositionWidth : x
  const top = y <= 1 ? y * compositionHeight : y
  return { top: animatedScalar(top), left: animatedScalar(left) }
}

const expandSize = (
  size: { width?: unknown; height?: unknown } | undefined,
  compositionWidth: number,
  compositionHeight: number
): { width: TAnimatedNumberTrack; height: TAnimatedNumberTrack } => {
  const w = typeof size?.width === 'number' ? size.width : 1
  const h = typeof size?.height === 'number' ? size.height : 1
  const width = w <= 1 ? w * compositionWidth : w
  const height = h <= 1 ? h * compositionHeight : h
  return { width: animatedScalar(width), height: animatedScalar(height) }
}

// ---------------------------------------------------------------------------
// Clip expansion
// ---------------------------------------------------------------------------

const expandCrop = (
  crop: ISparseClipInline['crop'],
  _durationMs: number
) => {
  if (!crop) return {}
  return {
    cropLeft: animatedScalar(crop.left ?? 0),
    cropTop: animatedScalar(crop.top ?? 0),
    cropRight: animatedScalar(crop.right ?? 0),
    cropBottom: animatedScalar(crop.bottom ?? 0),
  }
}

const expandAnimation = (anim: ISparseClipInline['animation']) => {
  if (!anim) return {}
  const result: Record<string, unknown> = {}
  if (anim.in) {
    result.animations = {
      ...(result.animations as object | undefined),
      in: { type: anim.in, durationTicks: secondsToTicks(0.4), easing: 'ease-out' },
    }
  }
  if (anim.out) {
    result.animations = {
      ...(result.animations as object | undefined),
      out: { type: anim.out, durationTicks: secondsToTicks(0.4), easing: 'ease-in' },
    }
  }
  return result
}


const buildBaseItem = (
  sparse: ISparseClipInline,
  ctx: IExpandContext
): Record<string, unknown> => {
  const { compositionWidth, compositionHeight } = ctx
  const durationMs = sparse.durationMs
  const pos = expandPosition(sparse.position, compositionWidth, compositionHeight)
  const sz = expandSize(sparse.size, compositionWidth, compositionHeight)

  return {
    id: sparse.id,
    type: sparse.type,
    // startMs in block/custom sparse is scene-local. Add the accumulated duration
    // of previous scenes so clips do not collapse onto the timeline origin.
    startTicks: msToTicks(ctx.sceneStartMs + sparse.startMs),
    durationTicks: msToTicks(durationMs),
    isDraggingInTimeline: false,
    ...pos,
    ...sz,
    scaleX: expandOptionalShortcut(sparse.scale, 1, durationMs),
    scaleY: expandOptionalShortcut(sparse.scale, 1, durationMs),
    opacity: expandOptionalShortcut(sparse.opacity, 1, durationMs),
    zIndex: sparse.zIndex ?? 0,
  }
}

const expandInlineClip = (
  sparse: ISparseClipInline,
  ctx: IExpandContext
): Record<string, unknown> => {
  const base = buildBaseItem(sparse, ctx)
  const durationMs = sparse.durationMs
  const animFields = expandAnimation(sparse.animation)
  const cropFields = expandCrop(sparse.crop, durationMs)
  const rotation = expandOptionalShortcut(sparse.rotation, 0, durationMs)

  switch (sparse.type) {
    case 'image': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...IMAGE_ITEM_DEFAULTS,
        assetId,
        rotation,
        borderRadius: animatedScalar(sparse.borderRadius ?? 0),
        ...cropFields,
        ...animFields,
      }
    }
    case 'video': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...VIDEO_ITEM_DEFAULTS,
        assetId,
        rotation,
        borderRadius: animatedScalar(sparse.borderRadius ?? 0),
        ...cropFields,
        ...animFields,
      }
    }
    case 'gif': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...GIF_ITEM_DEFAULTS,
        assetId,
        rotation,
        borderRadius: animatedScalar(sparse.borderRadius ?? 0),
        ...cropFields,
        ...animFields,
      }
    }
    case 'lottie': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...LOTTIE_ITEM_DEFAULTS,
        assetId,
        rotation,
        ...animFields,
      }
    }
    case 'audio': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...AUDIO_ITEM_DEFAULTS,
        assetId,
      }
    }
    case 'caption': {
      const assetId = resolveAssetId(sparse.asset, ctx)
      return {
        ...base,
        ...CAPTIONS_ITEM_DEFAULTS,
        assetId,
        ...animFields,
      }
    }
    case 'text': {
      const textSpec = sparse.text
      return {
        ...base,
        ...TEXT_ITEM_DEFAULTS,
        text: textSpec?.content ?? '',
        color: textSpec?.color ?? TEXT_ITEM_DEFAULTS.color,
        fontFamily: textSpec?.fontFamily ?? TEXT_FONT_DEFAULTS.fontFamily,
        fontStyle: {
          variant: 'normal',
          weight: String(textSpec?.fontWeight ?? 500),
        },
        fontSize: textSpec?.fontSize ?? TEXT_FONT_DEFAULTS.fontSize,
        lineHeight: textSpec?.lineHeight ?? TEXT_FONT_DEFAULTS.lineHeight,
        align: textSpec?.align ?? TEXT_FONT_DEFAULTS.align,
        rotation,
        ...animFields,
      }
    }
    case 'solid': {
      return {
        ...base,
        ...SOLID_ITEM_DEFAULTS,
        color: sparse.color ?? SOLID_ITEM_DEFAULTS.color,
        rotation,
        ...animFields,
      }
    }
    case 'illustration': {
      return {
        ...base,
        ...ILLUSTRATION_ITEM_DEFAULTS,
        illustrationName: resolveIllustrationName(sparse, ctx),
        color: sparse.illustrationColor ?? ILLUSTRATION_ITEM_DEFAULTS.color,
        rotation,
        ...animFields,
      }
    }
    default:
      return base
  }
}

const resolveAssetId = (
  asset: ISparseClipInline['asset'],
  ctx: IExpandContext
): string => {
  if (!asset) return ''
  if (typeof asset === 'string') return asset
  if ('assetId' in asset) return asset.assetId
  if ('illustrationName' in asset) return ''
  if ('slotKey' in asset) {
    const binding = ctx.slotBindings.get(asset.slotKey)
    return binding?.type === 'asset' ? binding.assetId : ''
  }
  return ''
}

const resolveIllustrationName = (
  sparse: ISparseClipInline,
  ctx: IExpandContext
): string => {
  // Illustration supports both a top-level clip illustrationName and the
  // workflow binding shapes below:
  // 1. asset: { type: 'illustration', illustrationName }
  // 2. asset: { slotKey } + scene.slots[slotKey] = { type: 'illustration', illustrationName }
  // If only the top-level field is read, a binding-based scene_submit payload
  // turns into an empty illustration name during build.
  if (typeof sparse.illustrationName === 'string' && sparse.illustrationName.trim()) {
    return sparse.illustrationName.trim()
  }

  if (!sparse.asset || typeof sparse.asset === 'string') {
    return ''
  }

  if ('illustrationName' in sparse.asset) {
    return typeof sparse.asset.illustrationName === 'string'
      ? sparse.asset.illustrationName.trim()
      : ''
  }

  if ('slotKey' in sparse.asset) {
    const binding = ctx.slotBindings.get(sparse.asset.slotKey)
    return binding?.type === 'illustration' ? binding.illustrationName : ''
  }

  return ''
}

// ---------------------------------------------------------------------------
// Block $ref expansion
// ---------------------------------------------------------------------------

const expandBlockRef = (
  ref: string,
  override: Record<string, unknown> | undefined,
  ctx: IExpandContext
): Array<{ trackId: string; item: Record<string, unknown> }> => {
  const block = getBlock(ref)
  if (!block) {
    console.warn(`[expand] Unknown block ref: ${ref}`)
    return []
  }
  const mergedOverrides = { ...block.defaults, ...ctx.overrides, ...override }
  const expandCtx: IExpandContext = { ...ctx, overrides: mergedOverrides }
  const resolved = resolveDeep(block.skeleton, expandCtx) as {
    tracks: Record<string, unknown[]>
  }
  const result: Array<{ trackId: string; item: Record<string, unknown> }> = []
  for (const [trackId, clips] of Object.entries(resolved.tracks)) {
    for (const clip of clips as ISparseClipInline[]) {
      if (typeof clip === 'object' && clip !== null && 'id' in clip && 'type' in clip) {
        result.push({ trackId, item: expandInlineClip(clip, expandCtx) })
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Scene expansion
// ---------------------------------------------------------------------------

interface IExpandedScene {
  entries: IExpandedTrackEntry[]
  transitions: Record<string, Record<string, unknown>>
}

interface IExpandedTrackEntry {
  logicalTrackId: string
  itemId: string
  item: Record<string, unknown>
  sourceOrder: number
}

interface ITrackLayoutLane {
  endTicks: number
  itemIds: string[]
  lastLogicalTrackId: string
}

const FULL_FRAME_MEDIA_TYPES = new Set(['image', 'video', 'gif', 'lottie'])
const FOREGROUND_TEXT_TYPES = new Set(['text', 'caption'])
const DECORATION_TYPES = new Set(['illustration', 'solid', 'effect', 'filter'])

const readAnimatedScalarValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof (value as { value: unknown }).value === 'number' &&
    Number.isFinite((value as { value: number }).value)
  ) {
    return (value as { value: number }).value
  }
  return null
}

const readItemTicks = (
  item: Record<string, unknown>,
  field: 'startTicks' | 'durationTicks'
): number => {
  const value = item[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

const isFullFrameMediaItem = (
  item: Record<string, unknown>,
  compositionWidth: number,
  compositionHeight: number
): boolean => {
  const type = typeof item.type === 'string' ? item.type : ''
  if (!FULL_FRAME_MEDIA_TYPES.has(type)) return false

  const width = readAnimatedScalarValue(item.width)
  const height = readAnimatedScalarValue(item.height)
  if (width === null || height === null) return false

  return width >= compositionWidth * 0.9 && height >= compositionHeight * 0.9
}

const getTrackTypePriority = (
  item: Record<string, unknown>,
  compositionWidth: number,
  compositionHeight: number
): number => {
  const type = typeof item.type === 'string' ? item.type : ''

  if (FOREGROUND_TEXT_TYPES.has(type)) return 4
  if (DECORATION_TYPES.has(type)) return 3
  if (type === 'audio') return 0
  if (FULL_FRAME_MEDIA_TYPES.has(type)) {
    return isFullFrameMediaItem(item, compositionWidth, compositionHeight) ? 1 : 2
  }
  return 2
}

const layoutExpandedTracks = (
  entries: IExpandedTrackEntry[],
  compositionWidth: number,
  compositionHeight: number
): Array<{ id: string; items: string[]; hidden: boolean; muted: boolean }> => {
  const layerBuckets = new Map<
    string,
    {
      zIndex: number
      typePriority: number
      entries: IExpandedTrackEntry[]
    }
  >()

  for (const entry of entries) {
    const zIndex =
      typeof entry.item.zIndex === 'number' && Number.isFinite(entry.item.zIndex)
        ? entry.item.zIndex
        : 0
    const typePriority = getTrackTypePriority(
      entry.item,
      compositionWidth,
      compositionHeight
    )
    const bucketKey = `${zIndex}:${typePriority}`
    const bucket = layerBuckets.get(bucketKey)
    if (bucket) {
      bucket.entries.push(entry)
      continue
    }
    layerBuckets.set(bucketKey, {
      zIndex,
      typePriority,
      entries: [entry],
    })
  }

  const sortedBuckets = [...layerBuckets.values()].sort(
    (a, b) => b.zIndex - a.zIndex || b.typePriority - a.typePriority
  )

  return sortedBuckets.flatMap((bucket, layerIndex) => {
    const lanes: ITrackLayoutLane[] = []
    const sortedEntries = [...bucket.entries].sort(
      (a, b) =>
        readItemTicks(a.item, 'startTicks') - readItemTicks(b.item, 'startTicks') ||
        a.sourceOrder - b.sourceOrder
    )

    for (const entry of sortedEntries) {
      const startTicks = readItemTicks(entry.item, 'startTicks')
      const durationTicks = readItemTicks(entry.item, 'durationTicks')
      const endTicks = startTicks + durationTicks

      // Distinguish between a logical track and a physical track here.
      // logicalTrackId describes author intent in block/custom sparse input,
      // but it is not the final editorState track. The physical track layout
      // must ensure:
      // 1. No time overlap within the same track.
      // 2. Higher-priority layers appear earlier in the track array.
      // 3. A reusable lane stays aligned with the same logicalTrackId when possible.
      let laneIndex = lanes.findIndex(
        (lane) =>
          lane.endTicks <= startTicks && lane.lastLogicalTrackId === entry.logicalTrackId
      )
      if (laneIndex < 0) {
        laneIndex = lanes.findIndex((lane) => lane.endTicks <= startTicks)
      }

      if (laneIndex < 0) {
        lanes.push({
          endTicks,
          itemIds: [entry.itemId],
          lastLogicalTrackId: entry.logicalTrackId,
        })
        continue
      }

      lanes[laneIndex].itemIds.push(entry.itemId)
      lanes[laneIndex].endTicks = endTicks
      lanes[laneIndex].lastLogicalTrackId = entry.logicalTrackId
    }

    return lanes.map((lane, laneIndex) => ({
      id: `track-layer-${layerIndex}-lane-${laneIndex}`,
      items: lane.itemIds,
      hidden: false,
      muted: false,
    }))
  })
}

const expandScene = (
  scene: IStoryboardScene,
  ctx: Omit<IExpandContext, 'sceneId' | 'durationMs' | 'overrides'>
): IExpandedScene => {
  const overrides: Record<string, unknown> = {
    ...(scene.copy as Record<string, unknown>),
    ...scene.blockOverride,
  }
  const expandCtx: IExpandContext = {
    ...ctx,
    sceneId: scene.sceneId,
    durationMs: scene.durationMs,
    overrides,
    slotBindings: new Map(Object.entries(scene.slots)),
  }

  const entries: IExpandedTrackEntry[] = []
  const transitions: Record<string, Record<string, unknown>> = {}

  const addItem = (trackId: string, item: Record<string, unknown>) => {
    const id = item.id as string
    entries.push({
      logicalTrackId: trackId,
      itemId: id,
      item,
      sourceOrder: entries.length,
    })
  }

  // Determine which sparse fragment to expand
  let sparseFragment: ISparseSceneFragment | null = null

  if (scene.blockRef !== 'custom' && !scene.customSparse) {
    for (const { trackId, item } of expandBlockRef(scene.blockRef, scene.blockOverride, expandCtx)) {
      addItem(trackId, item)
    }
  } else {
    sparseFragment = scene.customSparse ?? null
  }

  if (sparseFragment) {
    for (const [trackId, clips] of Object.entries(sparseFragment.tracks)) {
      for (const clip of clips) {
        if ('$ref' in clip) {
          for (const { trackId: refTrackId, item } of expandBlockRef(clip.$ref, clip.override, expandCtx)) {
            addItem(refTrackId, item)
          }
        } else {
          addItem(trackId, expandInlineClip(clip, expandCtx))
        }
      }
    }
  }

  return {
    entries,
    transitions,
  }
}

// ---------------------------------------------------------------------------
// Top-level storyboard expansion
// ---------------------------------------------------------------------------

export interface IExpandOptions {
  /** Resolved assets map: assetId → IResolvedManagedAsset */
  assets?: Map<string, IResolvedManagedAsset>
}

export const expandStoryboard = (
  storyboard: IStoryboardV6,
  options: IExpandOptions = {}
): TEditorStateV1 => {
  const ratio = storyboard.output.ratio
  const dims = DEFAULT_COMPOSITION_DIMENSIONS[ratio] ?? { width: 1920, height: 1080 }
  const { width: compositionWidth, height: compositionHeight } = dims
  const assets: Map<string, IResolvedManagedAsset> = options.assets ?? new Map<string, IResolvedManagedAsset>()

  const allItems: Record<string, unknown> = {}
  const allTransitions: Record<string, unknown> = {}
  const allAssets: Record<string, unknown> = {}
  const allEntries: IExpandedTrackEntry[] = []

  // Populate assets map into editorState assets
  for (const [assetId, asset] of assets.entries()) {
    allAssets[assetId] = buildEditorAsset(asset)
  }

  const ctxBase = {
    compositionWidth,
    compositionHeight,
    assets,
    sceneStartMs: 0,
    slotBindings: new Map<string, TWorkflowBinding>(),
  }

  let sceneStartMs = 0
  let sourceOrder = 0
  for (const scene of storyboard.scenes) {
    const expanded = expandScene(scene, {
      ...ctxBase,
      sceneStartMs,
    })
    for (const entry of expanded.entries) {
      allItems[entry.itemId] = entry.item
      allEntries.push({
        ...entry,
        sourceOrder,
      })
      sourceOrder += 1
    }
    for (const [tid, trans] of Object.entries(expanded.transitions)) {
      allTransitions[tid] = trans
    }
    sceneStartMs += scene.durationMs
  }

  const allTracks = layoutExpandedTracks(
    allEntries,
    compositionWidth,
    compositionHeight
  )

  return {
    compositionWidth,
    compositionHeight,
    timebaseTicksPerSecond: TIMEBASE_TICKS_PER_SECOND,
    outputRatio: ratio,
    tracks: allTracks,
    assets: allAssets,
    items: allItems,
    transitions: allTransitions,
    globalBackground: {
      type: 'color',
      color: storyboard.globalStyle.backgroundColor ?? '#000000',
      gradient: null,
    },
  } as unknown as TEditorStateV1
}

// ---------------------------------------------------------------------------
// Asset serialization
// ---------------------------------------------------------------------------

const buildEditorAsset = (asset: IResolvedManagedAsset): Record<string, unknown> => {
  const base = {
    id: asset.id,
    filename: asset.filename,
    size: asset.size,
    mimeType: asset.mimeType,
    remoteUrl: asset.remoteUrl ?? null,
    remoteKey: asset.remoteKey ?? null,
  }

  switch (asset.type) {
    case 'image':
      return { ...base, type: 'image', width: asset.width!, height: asset.height! }
    case 'video':
      return {
        ...base,
        type: 'video',
        width: asset.width!,
        height: asset.height!,
        durationInSeconds: asset.durationInSeconds!,
        hasAudioTrack: asset.hasAudioTrack ?? false,
      }
    case 'gif':
      return {
        ...base,
        type: 'gif',
        width: asset.width!,
        height: asset.height!,
        durationInSeconds: asset.durationInSeconds!,
        loopBehavior: asset.loopBehavior ?? 'loop',
      }
    case 'audio':
      return { ...base, type: 'audio', durationInSeconds: asset.durationInSeconds! }
    case 'caption':
      return {
        ...base,
        type: 'caption',
        captions: asset.captions ?? [],
        timingGranularity: asset.timingGranularity ?? 'line',
      }
    case 'lottie':
      return {
        ...base,
        type: 'lottie',
        width: asset.width!,
        height: asset.height!,
        durationInSeconds: asset.durationInSeconds!,
        resourceType: asset.resourceType ?? 'lottie',
        resourceJson: asset.resourceJson ?? null,
        resourceComponentId: asset.resourceComponentId ?? null,
        materialConfig: asset.materialConfig ?? null,
      }
    default:
      return { ...base, type: asset.type }
  }
}
