import {
  mapOpenApiAssetToEditorAsset,
  type IResolvedManagedAsset,
} from '../analysis/asset-mapper'
import {
  normalizeOpenApiAssetRecord,
  type IIndreamClientLike,
  type IOpenApiAssetRecord,
} from '../tools/shared'
import type { IStoryboardV6, TWorkflowBinding } from './types'
import type { IAssetAnalysis } from '../analysis/types'

export interface IResolvedWorkflowSlotBinding {
  slotKey: string
  binding: TWorkflowBinding
  asset?: IOpenApiAssetRecord
  editorAsset?: IResolvedManagedAsset
  analysis?: IAssetAnalysis
  error?: {
    code: string
    message: string
  }
}

export const resolveStoryboardBindings = async (params: {
  client: IIndreamClientLike
  storyboard: IStoryboardV6
  /** Optional cache: assetId → IAssetAnalysis */
  analysisCache?: Map<string, IAssetAnalysis>
}): Promise<Map<string, IResolvedWorkflowSlotBinding>> => {
  const result = new Map<string, IResolvedWorkflowSlotBinding>()

  // Collect all unique asset bindings across all scenes
  const assetBindings = new Map<string, TWorkflowBinding>()
  for (const scene of params.storyboard.scenes) {
    for (const [slotKey, binding] of Object.entries(scene.slots)) {
      const key = `${scene.sceneId}:${slotKey}`
      assetBindings.set(key, binding)
    }
  }

  for (const [key, binding] of assetBindings.entries()) {
    const slotKey = key.split(':').slice(1).join(':')

    if (binding.type === 'illustration') {
      result.set(key, { slotKey, binding })
      continue
    }

    try {
      const rawAsset = await params.client.assets.get(binding.assetId)
      const asset = normalizeOpenApiAssetRecord(rawAsset, 'binding.' + slotKey)
      const mapped = mapOpenApiAssetToEditorAsset({
        id: asset.assetId,
        alias: slotKey,
        asset,
      })
      if (!mapped.ok) {
        result.set(key, {
          slotKey,
          binding,
          asset,
          error: { code: mapped.error.code, message: mapped.error.message },
        })
        continue
      }
      result.set(key, {
        slotKey,
        binding,
        asset,
        editorAsset: mapped.asset,
        analysis: params.analysisCache?.get(binding.assetId),
      })
    } catch (error) {
      result.set(key, {
        slotKey,
        binding,
        error: {
          code: 'ASSET_LOOKUP_FAILED',
          message: error instanceof Error ? error.message : 'Asset lookup failed.',
        },
      })
    }
  }

  return result
}

/** Build the assets Map used by the Expander: editorAssetId → IResolvedManagedAsset */
export const buildExpanderAssetsMap = (
  bindings: Map<string, IResolvedWorkflowSlotBinding>
): Map<string, IResolvedManagedAsset> => {
  const map = new Map<string, IResolvedManagedAsset>()
  for (const b of bindings.values()) {
    if (b.editorAsset) {
      map.set(b.editorAsset.id, b.editorAsset)
    }
  }
  return map
}
