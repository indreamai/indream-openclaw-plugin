import { createHash } from 'node:crypto'
import type { TEditorStateV1 } from '@indreamai/client'
import { expandStoryboard } from '../compiler/expand'
import type { IIndreamClientLike } from '../tools/shared'
import { buildExpanderAssetsMap, resolveStoryboardBindings } from './bindings'
import type { IWorkflowArtifact } from './types'

export interface ICompileWorkflowArtifactResult {
  bindings: Awaited<ReturnType<typeof resolveStoryboardBindings>>
  editorState: TEditorStateV1
  editorStateHash: string
  valid: boolean
  validationErrors: unknown[]
}

export const hashEditorState = (editorState: TEditorStateV1) =>
  createHash('sha256').update(JSON.stringify(editorState)).digest('hex').slice(0, 16)

export const compileWorkflowArtifact = async (params: {
  client: IIndreamClientLike
  artifact: IWorkflowArtifact
}): Promise<ICompileWorkflowArtifactResult> => {
  // Keep build, review, and commit on the same compile order so the same
  // storyboard cannot expand differently across phases.
  const bindings = await resolveStoryboardBindings({
    client: params.client,
    storyboard: params.artifact.storyboard,
  })
  const editorState = expandStoryboard(params.artifact.storyboard, {
    assets: buildExpanderAssetsMap(bindings),
  })
  const validation = await params.client.editor.validate(editorState)
  const validationRecord =
    typeof validation === 'object' && validation !== null && !Array.isArray(validation)
      ? (validation as Record<string, unknown>)
      : {}

  return {
    bindings,
    editorState,
    editorStateHash: hashEditorState(editorState),
    valid: validationRecord.valid === undefined ? true : Boolean(validationRecord.valid),
    validationErrors: Array.isArray(validationRecord.errors) ? validationRecord.errors : [],
  }
}
