import { describe, expect, it } from 'vitest'
import {
  mapManagedAssetToEditorAsset,
  mapOpenApiAssetToEditorAsset,
} from '../src/analysis/asset-mapper'
import type { IOpenApiAssetRecord } from '../src/tools/shared'

const createOpenApiAsset = (
  overrides: Partial<IOpenApiAssetRecord>
): IOpenApiAssetRecord => ({
  assetId: 'asset-default',
  type: 'IMAGE',
  source: 'UPLOAD',
  filename: 'asset-default.bin',
  mimetype: 'application/octet-stream',
  size: 1024,
  fileUrl: 'https://cdn.example.com/asset-default.bin',
  fileKey: 'uploads/asset-default.bin',
  width: 1920,
  height: 1080,
  duration: 6,
  hasAudioTrack: null,
  loopBehavior: null,
  captions: undefined,
  timingGranularity: null,
  resourceType: null,
  resourceJson: null,
  resourceComponentId: null,
  materialConfig: null,
  ...overrides,
})

describe('editor asset mapper', () => {
  it('maps all supported OpenAPI asset types to valid editor asset variants', () => {
    const samples: Array<{ type: string; assertType: string }> = [
      { type: 'IMAGE', assertType: 'image' },
      { type: 'VIDEO', assertType: 'video' },
      { type: 'GIF', assertType: 'gif' },
      { type: 'AUDIO', assertType: 'audio' },
      { type: 'CAPTION', assertType: 'caption' },
      { type: 'LOTTIE', assertType: 'lottie' },
    ]

    for (const sample of samples) {
      const mapped = mapOpenApiAssetToEditorAsset({
        id: 'editor-' + sample.assertType,
        alias: 'alias-' + sample.assertType,
        asset: createOpenApiAsset({
          assetId: 'asset-' + sample.assertType,
          type: sample.type,
          filename: 'asset-' + sample.assertType + '.bin',
          mimetype:
            sample.assertType === 'video'
              ? 'video/mp4'
              : sample.assertType === 'audio'
                ? 'audio/mpeg'
                : sample.assertType === 'caption'
                  ? 'application/json'
                  : 'image/png',
          captions:
            sample.assertType === 'caption'
              ? [{ text: 'Hello', startMs: 0, endMs: 500 }]
              : undefined,
        }),
      })
      expect(mapped.ok).toBe(true)
      if (mapped.ok) {
        expect(mapped.asset.type).toBe(sample.assertType)
      }
    }
  })

  it('defaults video hasAudioTrack to false when metadata is missing', () => {
    const mapped = mapOpenApiAssetToEditorAsset({
      id: 'editor-video',
      alias: 'alias-video',
      asset: createOpenApiAsset({
        type: 'VIDEO',
        hasAudioTrack: null,
      }),
    })
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.asset.type).toBe('video')
      expect(mapped.asset.hasAudioTrack).toBe(false)
    }
  })

  it('rejects unsupported types instead of silently falling back to image', () => {
    const mapped = mapOpenApiAssetToEditorAsset({
      id: 'editor-unknown',
      alias: 'alias-unknown',
      asset: createOpenApiAsset({
        type: 'MODEL_3D',
      }),
    })
    expect(mapped.ok).toBe(false)
    if (!mapped.ok) {
      expect(mapped.error.code).toBe('ASSET_TYPE_UNSUPPORTED')
    }
  })

  it('maps managed assets with strict type handling and defaults', () => {
    const mapped = mapManagedAssetToEditorAsset({
      id: 'managed-video',
      alias: 'managed-video',
      asset: {
        type: 'video',
        filename: 'managed-video.mp4',
        mimeType: 'video/mp4',
        size: 1024,
        remoteUrl: 'https://cdn.example.com/managed-video.mp4',
        remoteKey: 'uploads/managed-video.mp4',
        width: 1280,
        height: 720,
        durationInSeconds: 5,
      },
    })

    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.asset.type).toBe('video')
      expect(mapped.asset.hasAudioTrack).toBe(false)
    }
  })
})
