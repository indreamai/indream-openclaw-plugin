import type { IIndreamClientLike } from '../tools/shared'
import type {
  IWorkflowArtifact,
  IWorkflowReviewSummary,
  IWorkflowReviewDiagnostic,
  TWorkflowReviewFocus,
} from './types'
import { buildAnimationMap, diagnoseAnimationMap } from './animation-map'
import { compileWorkflowArtifact } from './compile'
import type { IResolvedWorkflowSlotBinding } from './bindings'

const filterByFocus = (
  diagnostics: IWorkflowReviewDiagnostic[],
  focus: TWorkflowReviewFocus
): IWorkflowReviewDiagnostic[] => {
  if (focus === 'all') return diagnostics
  if (focus === 'assets') {
    return diagnostics.filter(
      (d) => d.code.includes('BINDING') || d.code.includes('ASSET')
    )
  }
  if (focus === 'script') {
    return diagnostics.filter(
      (d) => d.code.includes('COPY') || d.code.includes('TEXT') || d.code.includes('SCRIPT')
    )
  }
  if (focus === 'animation') {
    return diagnostics.filter(
      (d) => d.code.includes('ANIMATION_MAP') || d.code.includes('TRACK')
    )
  }
  if (focus === 'layout') {
    return diagnostics.filter(
      (d) =>
        d.code.includes('CTA') ||
        d.code.includes('TRACK') ||
        d.code.includes('LAYOUT') ||
        d.code.includes('ANIMATION_MAP')
    )
  }
  return diagnostics
}

export const reviewWorkflow = async (params: {
  client: IIndreamClientLike
  artifact: IWorkflowArtifact
  focus?: TWorkflowReviewFocus
}): Promise<IWorkflowReviewSummary> => {
  const { client, artifact, focus = 'all' } = params
  const diagnostics: IWorkflowReviewDiagnostic[] = []
  const appliedRepairs: string[] = []

  const compileSubmittedScenesOnly =
    artifact.storyboard.scenes.length > 0 &&
    artifact.storyboard.scenes.every((scene) => artifact.submittedSceneIds.includes(scene.sceneId))

  // 1. Resolve bindings + compile pipeline
  let compileResult: Awaited<ReturnType<typeof compileWorkflowArtifact>> | null = null
  try {
    compileResult = await compileWorkflowArtifact({
      client,
      artifact,
    })
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'EXPAND_FAILED',
      path: '$',
      message: `Expander failed: ${error instanceof Error ? error.message : String(error)}`,
      fixStrategy: 'Check storyboard scene blockRef and slot definitions.',
    })
  }

  const bindings: Map<string, IResolvedWorkflowSlotBinding> =
    compileResult?.bindings ?? new Map<string, IResolvedWorkflowSlotBinding>()

  for (const [, b] of bindings.entries()) {
    if (b.error) {
      diagnostics.push({
        severity: 'error',
        code: 'BINDING_RESOLUTION_FAILED',
        path: `slots.${b.slotKey}`,
        message: `Slot "${b.slotKey}": ${b.error.message}`,
        fixStrategy: 'Check asset ID and re-bind with bind-asset op.',
      })
    }
  }

  // 2. Check unresolved required bindings
  for (const key of artifact.summary.unresolvedRequiredBindings) {
    diagnostics.push({
      severity: 'error',
      code: 'BINDING_REQUIRED_UNRESOLVED',
      path: `slots.${key}`,
      message: `Required slot "${key}" has no asset binding.`,
      fixStrategy: 'Upload an asset and use bind-asset op.',
    })
  }

  // 3. Expand + validate editorState
  if (
    compileResult &&
    compileSubmittedScenesOnly &&
    !diagnostics.some((diagnostic) => diagnostic.code.startsWith('BINDING_'))
  ) {
    if (!compileResult.valid || compileResult.validationErrors.length > 0) {
      diagnostics.push({
        severity: 'error',
        code: 'EDITOR_STATE_VALIDATION',
        path: '$',
        message:
          compileResult.validationErrors.length > 0
            ? 'editor.validate failed: ' +
              JSON.stringify(compileResult.validationErrors).slice(0, 300)
            : 'editor.validate returned valid=false.',
        fixStrategy: 'Inspect expanded editorState structure.',
      })
    }

    // 4. Animation-map analysis
    const animMap = buildAnimationMap(compileResult.editorState)
    const animDiags = diagnoseAnimationMap(animMap, artifact.storyboard.reviewContracts)
    for (const d of animDiags) {
      diagnostics.push({
        severity: d.severity,
        code: d.code,
        path: d.trackId ? `tracks.${d.trackId}` : '$',
        message: d.message,
      })
    }
  }

  // 5. Scene copy checks
  for (const scene of artifact.storyboard.scenes) {
    const { copy, sceneId } = scene
    if (artifact.storyboard.reviewContracts.enforceCtaSingleLine && copy.cta) {
      if (copy.cta.includes('\n') || copy.cta.length > 60) {
        diagnostics.push({
          severity: 'error',
          code: 'COPY_CTA_TOO_LONG',
          path: `scenes.${sceneId}.copy.cta`,
          sceneId,
          message: `CTA text in scene ${sceneId} is too long or multi-line.`,
          fixStrategy: 'Shorten CTA to ≤60 chars, single line. Use rewrite-scene-copy op.',
          suggestedOps: [
            { type: 'rewrite-scene-copy', sceneId, copy: { cta: copy.cta.split('\n')[0].slice(0, 60) } },
          ],
        })
      }
    }
  }

  const filtered = filterByFocus(diagnostics, focus)
  const blockingCount = filtered.filter((d) => d.severity === 'error').length
  const warningCount = filtered.filter((d) => d.severity === 'warning').length

  return {
    status: blockingCount > 0 ? 'failed' : 'ok',
    blockingCount,
    warningCount,
    diagnostics: filtered,
    appliedRepairs,
  }
}
