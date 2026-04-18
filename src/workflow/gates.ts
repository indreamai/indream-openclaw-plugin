import type {
  TWorkflowGate,
  IGateStatus,
  IWorkflowArtifact,
} from './types'

export const GATE_ORDER: TWorkflowGate[] = [
  'capture',
  'design',
  'script',
  'storyboard',
  'build',
  'static',
  'snapshot',
  'commit',
]

export const gateIndex = (gate: TWorkflowGate): number =>
  GATE_ORDER.indexOf(gate)

export const isGatePassed = (
  gateStatuses: IGateStatus[],
  gate: TWorkflowGate
): boolean => {
  return gateStatuses.some((s) => s.gate === gate && s.passed)
}

export const currentGateIndex = (gateStatuses: IGateStatus[]): number => {
  let maxPassed = -1
  for (const s of gateStatuses) {
    if (s.passed) {
      const idx = gateIndex(s.gate)
      if (idx > maxPassed) maxPassed = idx
    }
  }
  return maxPassed
}

export interface IGateAdvanceResult {
  ok: boolean
  error?: string
  nextGate?: TWorkflowGate
  updatedStatuses: IGateStatus[]
}

export const advanceGate = (
  artifact: IWorkflowArtifact,
  targetGate: TWorkflowGate,
  notes?: string
): IGateAdvanceResult => {
  const targetIdx = gateIndex(targetGate)
  if (targetIdx < 0) {
    return {
      ok: false,
      error: `Unknown gate: ${targetGate}`,
      updatedStatuses: artifact.gateStatuses,
    }
  }

  // Check prerequisites
  const prereqError = checkPrerequisites(artifact, targetGate)
  if (prereqError) {
    return {
      ok: false,
      error: prereqError,
      updatedStatuses: artifact.gateStatuses,
    }
  }

  const now = new Date().toISOString()
  const updated = artifact.gateStatuses.filter((s) => s.gate !== targetGate)
  updated.push({
    gate: targetGate,
    passed: true,
    updatedAt: now,
    artifactPath: null,
    notes,
  })

  const nextIdx = targetIdx + 1
  const nextGate = nextIdx < GATE_ORDER.length ? GATE_ORDER[nextIdx] : undefined

  return {
    ok: true,
    nextGate,
    updatedStatuses: updated,
  }
}

const checkPrerequisites = (
  artifact: IWorkflowArtifact,
  gate: TWorkflowGate
): string | null => {
  const { storyboard, gateStatuses } = artifact

  switch (gate) {
    case 'capture':
      return null

    case 'design':
      return null

    case 'script':
      if (!isGatePassed(gateStatuses, 'design')) {
        return 'Gate "design" must be passed before advancing to "script".'
      }
      return null

    case 'storyboard':
      if (!isGatePassed(gateStatuses, 'script')) {
        return 'Gate "script" must be passed before advancing to "storyboard".'
      }
      return null

    case 'build': {
      if (!isGatePassed(gateStatuses, 'storyboard')) {
        return 'Gate "storyboard" must be passed before advancing to "build".'
      }
      const unresolvedBindings = artifact.summary.unresolvedRequiredBindings
      if (unresolvedBindings.length > 0) {
        return `Unresolved required bindings: ${unresolvedBindings.join(', ')}.`
      }
      return null
    }

    case 'static': {
      if (!isGatePassed(gateStatuses, 'build')) {
        return 'Gate "build" must be passed before advancing to "static".'
      }
      const notSubmitted = storyboard.scenes
        .map((s) => s.sceneId)
        .filter((id) => !artifact.submittedSceneIds.includes(id))
      if (notSubmitted.length > 0) {
        return `Scenes not yet submitted: ${notSubmitted.join(', ')}.`
      }
      return null
    }

    case 'snapshot':
      if (!isGatePassed(gateStatuses, 'static')) {
        return 'Gate "static" must be passed before advancing to "snapshot".'
      }
      if (artifact.latestReview.blockingCount > 0) {
        return `${artifact.latestReview.blockingCount} blocking review error(s) must be resolved first.`
      }
      return null

    case 'commit':
      if (!isGatePassed(gateStatuses, 'static')) {
        return 'Gate "static" must be passed before committing.'
      }
      if (artifact.latestReview.blockingCount > 0) {
        return `${artifact.latestReview.blockingCount} blocking review error(s) must be resolved first.`
      }
      return null

    default:
      return null
  }
}

export const getGateStatus = (
  gateStatuses: IGateStatus[],
  gate: TWorkflowGate
): IGateStatus | null => {
  return gateStatuses.find((s) => s.gate === gate) ?? null
}

export const buildGateStatusSummary = (gateStatuses: IGateStatus[]): string => {
  return GATE_ORDER.map((g) => {
    const s = getGateStatus(gateStatuses, g)
    const icon = s?.passed ? '✓' : '○'
    return `${icon} ${g}`
  }).join('  ')
}
