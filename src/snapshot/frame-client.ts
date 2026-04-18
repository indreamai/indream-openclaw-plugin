import type { TEditorStateV1 } from '@indreamai/client'

export interface IFrameRequest {
  timestamps: number[]
  maxDimension?: number
}

export interface IFrameResult {
  timestamp: number
  imageUrl: string
}

export interface ISnapshotResult {
  ok: true
  frames: IFrameResult[]
}

export interface ISnapshotPending {
  ok: false
  reason: 'pending-api'
  message: string
}

export type TSnapshotResponse = ISnapshotResult | ISnapshotPending

/**
 * Request preview frames from Indream backend.
 * Returns pending-api until backend implements POST /v1/editor/preview-frame.
 */
export const requestPreviewFrames = (
  _editorState: TEditorStateV1,
  _request: IFrameRequest,
  _client: { previewFrame?: (...args: unknown[]) => Promise<unknown> }
): TSnapshotResponse => {
  return {
    ok: false,
    reason: 'pending-api',
    message:
      'Snapshot API not yet available. Backend must implement POST /v1/editor/preview-frame. ' +
      'This gate can be skipped for now by advancing directly to commit.',
  }
}
