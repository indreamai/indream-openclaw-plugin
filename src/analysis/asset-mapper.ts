import { normalizeAssetTypeName, type IOpenApiAssetRecord } from '../tools/shared'

export interface IManagedPlanAsset {
  assetId?: string
  type?: string
  filename?: string
  mimeType?: string
  size?: number | null
  remoteUrl?: string | null
  remoteKey?: string | null
  width?: number | null
  height?: number | null
  durationInSeconds?: number | null
  hasAudioTrack?: boolean | null
  loopBehavior?: 'finite' | 'loop' | null
  captions?: Array<Record<string, unknown>>
  timingGranularity?: 'word' | 'line' | null
  resourceType?: 'lottie' | 'svg' | null
  resourceJson?: Record<string, unknown> | null
  resourceComponentId?: string | null
  materialConfig?: Record<string, unknown> | null
}

export interface IResolvedManagedAsset extends IManagedPlanAsset {
  id: string
  type: string
  filename: string
  mimeType: string
  size: number
}

export const EDITOR_ASSET_TYPE_VALUES = [
  'image',
  'video',
  'gif',
  'audio',
  'caption',
  'lottie',
] as const

export type TEditorAssetType = (typeof EDITOR_ASSET_TYPE_VALUES)[number]
export type TVisualEditorAssetType = Extract<
  TEditorAssetType,
  'image' | 'video' | 'gif' | 'lottie'
>

export type TEditorAssetMappingErrorCode =
  | 'ASSET_TYPE_UNSUPPORTED'
  | 'ASSET_EDITOR_SCHEMA_INVALID'

export interface IEditorAssetMappingError {
  code: TEditorAssetMappingErrorCode
  message: string
  hint?: string
}

export type TEditorAssetMappingResult =
  | {
      ok: true
      assetType: TEditorAssetType
      asset: IResolvedManagedAsset
    }
  | {
      ok: false
      error: IEditorAssetMappingError
    }

const VISUAL_EDITOR_ASSET_TYPE_SET = new Set<TVisualEditorAssetType>([
  'image',
  'video',
  'gif',
  'lottie',
])

type TResourceType = 'lottie' | 'svg'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readPositiveNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

const readResourceType = (value: unknown) =>
  value === 'lottie' || value === 'svg' ? value : undefined

const readLoopBehavior = (value: unknown) =>
  value === 'finite' || value === 'loop' ? value : undefined

const readTimingGranularity = (value: unknown) =>
  value === 'word' || value === 'line' ? value : undefined

const readCaptionEntries = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isRecord)
}

const readOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const readOptionalBoolean = (value: unknown) => {
  return typeof value === 'boolean' ? value : undefined
}

const buildUnsupportedTypeResult = (
  rawType: unknown,
  hintPrefix: string
): TEditorAssetMappingResult => {
  const receivedType = readOptionalString(rawType) || '<empty>'
  return {
    ok: false,
    error: {
      code: 'ASSET_TYPE_UNSUPPORTED',
      message:
        'Unsupported asset type "' +
        receivedType +
        '". Supported types: ' +
        EDITOR_ASSET_TYPE_VALUES.join(', ') +
        ', svg.',
      hint:
        hintPrefix +
        ' Use assets with type in: ' +
        EDITOR_ASSET_TYPE_VALUES.join(', ') +
        ', svg.',
    },
  }
}

const buildSchemaInvalidResult = (
  message: string,
  hint?: string
): TEditorAssetMappingResult => ({
  ok: false,
  error: {
    code: 'ASSET_EDITOR_SCHEMA_INVALID',
    message,
    hint,
  },
})

const resolveEditorAssetType = (
  rawType: unknown,
  defaultType?: TEditorAssetType
): { assetType: TEditorAssetType; resourceType?: TResourceType } | null => {
  const normalized = normalizeAssetTypeName(rawType)
  if (!normalized) {
    return defaultType ? { assetType: defaultType } : null
  }

  if (
    normalized === 'image' ||
    normalized === 'video' ||
    normalized === 'gif' ||
    normalized === 'audio' ||
    normalized === 'caption'
  ) {
    return {
      assetType: normalized,
    }
  }

  if (normalized === 'captions') {
    return {
      assetType: 'caption',
    }
  }

  if (normalized === 'lottie') {
    return {
      assetType: 'lottie',
      resourceType: 'lottie',
    }
  }

  if (normalized === 'svg') {
    return {
      assetType: 'lottie',
      resourceType: 'svg',
    }
  }

  return null
}

const mapByType = (params: {
  base: {
    id: string
    filename: string
    mimeType: string
    size: number
    remoteUrl?: string | null
    remoteKey?: string | null
  }
  raw: {
    type: unknown
    width?: unknown
    height?: unknown
    durationInSeconds?: unknown
    hasAudioTrack?: unknown
    loopBehavior?: unknown
    captions?: unknown
    timingGranularity?: unknown
    resourceType?: unknown
    resourceJson?: unknown
    resourceComponentId?: unknown
    materialConfig?: unknown
  }
  defaultType?: TEditorAssetType
  fallbackDimensions?: { width: number; height: number }
  fallbackDurationInSeconds?: number
  hintPrefix: string
}): TEditorAssetMappingResult => {
  const resolved = resolveEditorAssetType(params.raw.type, params.defaultType)
  if (!resolved) {
    return buildUnsupportedTypeResult(params.raw.type, params.hintPrefix)
  }

  const width =
    readPositiveNumber(params.raw.width) ||
    readPositiveNumber(params.fallbackDimensions?.width)
  const height =
    readPositiveNumber(params.raw.height) ||
    readPositiveNumber(params.fallbackDimensions?.height)
  const durationInSeconds =
    readPositiveNumber(params.raw.durationInSeconds) ||
    readPositiveNumber(params.fallbackDurationInSeconds)
  const hasAudioTrack = readOptionalBoolean(params.raw.hasAudioTrack) ?? false
  const loopBehavior = readLoopBehavior(params.raw.loopBehavior) || 'loop'
  const captions = readCaptionEntries(params.raw.captions)
  const timingGranularity =
    readTimingGranularity(params.raw.timingGranularity) || 'line'
  const resourceType =
    readResourceType(params.raw.resourceType) || resolved.resourceType || 'lottie'

  if (resolved.assetType === 'image') {
    if (!width || !height) {
      return buildSchemaInvalidResult(
        'Image asset requires positive width and height.',
        params.hintPrefix + ' Ensure image metadata contains width and height.'
      )
    }
    return {
      ok: true,
      assetType: 'image',
      asset: {
        ...params.base,
        type: 'image',
        width,
        height,
      },
    }
  }

  if (resolved.assetType === 'video') {
    if (!width || !height || !durationInSeconds) {
      return buildSchemaInvalidResult(
        'Video asset requires positive width, height, and durationInSeconds.',
        params.hintPrefix +
          ' Ensure video metadata contains width/height/duration and fallback is disabled for missing fields.'
      )
    }
    return {
      ok: true,
      assetType: 'video',
      asset: {
        ...params.base,
        type: 'video',
        width,
        height,
        durationInSeconds,
        hasAudioTrack,
      },
    }
  }

  if (resolved.assetType === 'gif') {
    if (!width || !height || !durationInSeconds) {
      return buildSchemaInvalidResult(
        'GIF asset requires positive width, height, and durationInSeconds.',
        params.hintPrefix +
          ' Ensure gif metadata contains width/height/duration.'
      )
    }
    return {
      ok: true,
      assetType: 'gif',
      asset: {
        ...params.base,
        type: 'gif',
        width,
        height,
        durationInSeconds,
        loopBehavior,
      },
    }
  }

  if (resolved.assetType === 'audio') {
    if (!durationInSeconds) {
      return buildSchemaInvalidResult(
        'Audio asset requires positive durationInSeconds.',
        params.hintPrefix + ' Ensure audio metadata contains duration.'
      )
    }
    return {
      ok: true,
      assetType: 'audio',
      asset: {
        ...params.base,
        type: 'audio',
        durationInSeconds,
      },
    }
  }

  if (resolved.assetType === 'caption') {
    return {
      ok: true,
      assetType: 'caption',
      asset: {
        ...params.base,
        type: 'caption',
        captions,
        timingGranularity,
      },
    }
  }

  if (!width || !height || !durationInSeconds) {
    return buildSchemaInvalidResult(
      'Lottie asset requires positive width, height, and durationInSeconds.',
      params.hintPrefix + ' Ensure lottie metadata contains width/height/duration.'
    )
  }

  return {
    ok: true,
    assetType: 'lottie',
    asset: {
      ...params.base,
      type: 'lottie',
      width,
      height,
      durationInSeconds,
      resourceType,
      resourceJson: isRecord(params.raw.resourceJson)
        ? params.raw.resourceJson
        : null,
      resourceComponentId:
        readOptionalString(params.raw.resourceComponentId) || null,
      materialConfig: isRecord(params.raw.materialConfig)
        ? params.raw.materialConfig
        : null,
    },
  }
}

export const isVisualEditorAssetType = (
  value: string
): value is TVisualEditorAssetType => {
  return VISUAL_EDITOR_ASSET_TYPE_SET.has(value as TVisualEditorAssetType)
}

export const mapOpenApiAssetToEditorAsset = (params: {
  id: string
  alias: string
  asset: IOpenApiAssetRecord
}): TEditorAssetMappingResult => {
  return mapByType({
    base: {
      id: params.id,
      filename: params.asset.filename || params.alias + '.bin',
      mimeType: params.asset.mimetype || 'application/octet-stream',
      size: params.asset.size ?? 0,
      remoteUrl: params.asset.fileUrl,
      remoteKey: params.asset.fileKey,
    },
    raw: {
      type: params.asset.type,
      width: params.asset.width,
      height: params.asset.height,
      durationInSeconds: params.asset.duration,
      hasAudioTrack: params.asset.hasAudioTrack,
      loopBehavior: params.asset.loopBehavior,
      captions: params.asset.captions,
      timingGranularity: params.asset.timingGranularity,
      resourceType: params.asset.resourceType,
      resourceJson: params.asset.resourceJson,
      resourceComponentId: params.asset.resourceComponentId,
      materialConfig: params.asset.materialConfig,
    },
    hintPrefix:
      'OpenAPI asset to editor asset mapping failed for alias "' +
      params.alias +
      '".',
  })
}

export const mapManagedAssetToEditorAsset = (params: {
  id: string
  alias: string
  asset: IManagedPlanAsset
}): TEditorAssetMappingResult => {
  return mapByType({
    base: {
      id: params.id,
      filename: params.asset.filename || params.alias + '.bin',
      mimeType: params.asset.mimeType || 'application/octet-stream',
      size: params.asset.size ?? 0,
      remoteUrl: params.asset.remoteUrl ?? null,
      remoteKey: params.asset.remoteKey ?? null,
    },
    raw: {
      type: params.asset.type,
      width: params.asset.width,
      height: params.asset.height,
      durationInSeconds: params.asset.durationInSeconds,
      hasAudioTrack: params.asset.hasAudioTrack,
      loopBehavior: params.asset.loopBehavior,
      captions: params.asset.captions,
      timingGranularity: params.asset.timingGranularity,
      resourceType: params.asset.resourceType,
      resourceJson: params.asset.resourceJson,
      resourceComponentId: params.asset.resourceComponentId,
      materialConfig: params.asset.materialConfig,
    },
    defaultType: 'image',
    fallbackDimensions: { width: 1920, height: 1080 },
    fallbackDurationInSeconds: 5,
    hintPrefix:
      'Managed asset to editor asset mapping failed for alias "' +
      params.alias +
      '".',
  })
}
