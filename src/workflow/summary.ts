import { createHash } from 'node:crypto'
import type {
  IWorkflowArtifact,
  IWorkflowArtifactSummary,
  IStoryboardV6,
  TWorkflowGate,
} from './types'

export const hashStoryboard = (storyboard: IStoryboardV6): string =>
  createHash('sha256').update(JSON.stringify(storyboard)).digest('hex').slice(0, 16)

export const summarizeStoryboard = (params: {
  storyboard: IStoryboardV6
  currentGate: TWorkflowGate
  submittedSceneIds: string[]
}): IWorkflowArtifactSummary => {
  const { storyboard, currentGate, submittedSceneIds } = params

  const unresolvedRequiredBindings: string[] = []
  for (const scene of storyboard.scenes) {
    for (const [slotKey, binding] of Object.entries(scene.slots)) {
      if (binding.type === 'asset' && !binding.assetId) {
        unresolvedRequiredBindings.push(`${scene.sceneId}:${slotKey}`)
      }
    }
  }

  return {
    routeMode: storyboard.routeMode,
    gate: currentGate,
    gateStatuses: [],
    sceneCount: storyboard.scenes.length,
    totalDurationMs: storyboard.scenes.reduce((sum, s) => sum + s.durationMs, 0),
    submittedScenes: submittedSceneIds,
    unresolvedRequiredBindings,
    scenes: storyboard.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      intent: scene.intent,
      blockRef: scene.blockRef,
      durationMs: scene.durationMs,
      slotsFilled: Object.entries(scene.slots)
        .filter(([, b]) => b.type === 'illustration' || (b.type === 'asset' && !!b.assetId))
        .map(([k]) => k),
      copyKeys: Object.entries(scene.copy)
        .filter(([, v]) => !!v)
        .map(([k]) => k),
    })),
  }
}

export const buildArtifactStatusText = (artifact: IWorkflowArtifact): string => {
  const { summary, currentGate, latestReview } = artifact
  const lines = [
    `Gate: ${currentGate}`,
    `Scenes: ${summary.sceneCount} (${summary.submittedScenes.length} submitted)`,
    `Duration: ${(summary.totalDurationMs / 1000).toFixed(1)}s`,
    `Review: ${latestReview.status} (${latestReview.blockingCount} errors, ${latestReview.warningCount} warnings)`,
  ]
  if (summary.unresolvedRequiredBindings.length > 0) {
    lines.push(`Unresolved bindings: ${summary.unresolvedRequiredBindings.join(', ')}`)
  }
  return lines.join('\n')
}
