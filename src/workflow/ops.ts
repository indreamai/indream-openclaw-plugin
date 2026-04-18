import type {
  IWorkflowArtifact,
  IStoryboardV6,
  IStoryboardScene,
  TWorkflowSemanticOp,
  TWorkflowGate,
  IStoryboardCopy,
  ISparseSceneFragment,
} from './types'
import { advanceGate } from './gates'
import { artifactStore } from '../artifacts/store'

// Which approval gates to invalidate based on op category
const GATE_RESET_MAP: Record<string, TWorkflowGate[]> = {
  design: ['design', 'script', 'storyboard', 'build', 'static', 'snapshot', 'commit'],
  script: ['script', 'storyboard', 'build', 'static', 'snapshot', 'commit'],
  storyboard: ['storyboard', 'build', 'static', 'snapshot', 'commit'],
  layout: ['static', 'snapshot', 'commit'],
}

const resetGates = (
  gateStatuses: IWorkflowArtifact['gateStatuses'],
  category: keyof typeof GATE_RESET_MAP
): IWorkflowArtifact['gateStatuses'] => {
  const toReset = new Set(GATE_RESET_MAP[category] ?? [])
  return gateStatuses.map((s) =>
    toReset.has(s.gate) ? { ...s, passed: false, updatedAt: new Date().toISOString() } : s
  )
}

export interface IOpApplyResult {
  ok: boolean
  error?: string
  artifact: IWorkflowArtifact
}

export const applySemanticOp = (
  artifact: IWorkflowArtifact,
  op: TWorkflowSemanticOp
): IOpApplyResult => {
  try {
    const next = applyOp(artifact, op)
    const persisted = artifactStore.updateWorkflow(artifact.artifactId, {
      storyboard: next.storyboard,
      brief: next.brief,
      currentGate: next.currentGate,
      gateStatuses: next.gateStatuses,
      submittedSceneIds: next.submittedSceneIds,
    })
    return { ok: true, artifact: persisted }
  } catch (e) {
    return { ok: false, error: String(e), artifact }
  }
}

const applyOp = (
  artifact: IWorkflowArtifact,
  op: TWorkflowSemanticOp
): IWorkflowArtifact => {
  const sb = artifact.storyboard

  switch (op.type) {
    case 'advance-gate': {
      const result = advanceGate(artifact, op.gate, op.notes)
      if (!result.ok) throw new Error(result.error)
      return {
        ...artifact,
        currentGate: op.gate,
        gateStatuses: result.updatedStatuses,
      }
    }

    case 'set-design':
      return {
        ...artifact,
        storyboard: { ...sb, designRefPath: op.content },
        gateStatuses: resetGates(artifact.gateStatuses, 'design'),
      }

    case 'set-script':
      return {
        ...artifact,
        storyboard: { ...sb, scriptRefPath: op.content },
        gateStatuses: resetGates(artifact.gateStatuses, 'script'),
      }

    case 'set-storyboard':
      return {
        ...artifact,
        storyboard: { ...sb, ...op.storyboard } as IStoryboardV6,
        gateStatuses: resetGates(artifact.gateStatuses, 'storyboard'),
      }

    case 'replace-brief-fields':
      return {
        ...artifact,
        brief: { ...artifact.brief, ...op.patch },
      }

    case 'rewrite-scene-copy': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId
          ? { ...s, copy: { ...s.copy, ...op.copy } as IStoryboardCopy }
          : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'retime-scene': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId ? { ...s, durationMs: op.durationMs } : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'reorder-scenes': {
      const sceneMap = new Map(sb.scenes.map((s) => [s.sceneId, s]))
      const scenes = op.sceneIds.map((id) => {
        const s = sceneMap.get(id)
        if (!s) throw new Error(`Unknown sceneId: ${id}`)
        return s
      })
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'storyboard'),
      }
    }

    case 'split-scene': {
      const idx = sb.scenes.findIndex((s) => s.sceneId === op.sceneId)
      if (idx < 0) throw new Error(`Unknown sceneId: ${op.sceneId}`)
      const orig = sb.scenes[idx]
      const firstDuration = op.splitDurationMs
      const secondDuration = orig.durationMs - firstDuration
      if (secondDuration <= 0) throw new Error('splitDurationMs must be less than scene duration.')
      const first: IStoryboardScene = { ...orig, durationMs: firstDuration }
      const second: IStoryboardScene = {
        ...orig,
        sceneId: op.nextSceneId,
        durationMs: secondDuration,
        copy: { ...orig.copy, ...op.copyPatch },
      }
      const scenes = [...sb.scenes]
      scenes.splice(idx, 1, first, second)
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'storyboard'),
      }
    }

    case 'merge-scenes': {
      const [idA, idB] = op.sceneIds
      const idxA = sb.scenes.findIndex((s) => s.sceneId === idA)
      const idxB = sb.scenes.findIndex((s) => s.sceneId === idB)
      if (idxA < 0 || idxB < 0) throw new Error('Unknown sceneId in merge-scenes.')
      if (Math.abs(idxA - idxB) !== 1) throw new Error('Scenes must be adjacent to merge-scenes.')
      const sceneA = sb.scenes[idxA]
      const sceneB = sb.scenes[idxB]
      const merged: IStoryboardScene = {
        ...sceneA,
        sceneId: op.nextSceneId,
        durationMs: sceneA.durationMs + sceneB.durationMs,
      }
      const scenes = [...sb.scenes]
      scenes.splice(Math.min(idxA, idxB), 2, merged)
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'storyboard'),
      }
    }

    case 'set-scene-block': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId
          ? { ...s, blockRef: op.blockRef, blockOverride: undefined, customSparse: undefined }
          : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'set-scene-block-override': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId
          ? { ...s, blockOverride: { ...s.blockOverride, ...op.override } }
          : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'bind-asset': {
      const { sceneId, slotKey, binding } = op
      if (sceneId) {
        const scenes = sb.scenes.map((s) =>
          s.sceneId === sceneId
            ? { ...s, slots: { ...s.slots, [slotKey]: binding } }
            : s
        )
        return {
          ...artifact,
          storyboard: { ...sb, scenes },
          gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
        }
      }
      const scenes = sb.scenes.map((s) => ({
        ...s,
        slots: { ...s.slots, [slotKey]: binding },
      }))
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'set-transition': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId ? { ...s, transitionOut: op.transition } : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'set-clip-geometry':
    case 'set-clip-asset-crop':
    case 'set-text-color':
    case 'set-track-z-order':
    case 'insert-clip':
    case 'remove-clip': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId ? applyClipLevelOp(s, op) : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'apply-sparse-patch': {
      const scenes = sb.scenes.map((s) =>
        s.sceneId === op.sceneId
          ? { ...s, customSparse: mergeSparsePatch(s.customSparse, op.patch) }
          : s
      )
      return {
        ...artifact,
        storyboard: { ...sb, scenes },
        gateStatuses: resetGates(artifact.gateStatuses, 'layout'),
      }
    }

    case 'rebuild-scene-from-storyboard':
      return {
        ...artifact,
        submittedSceneIds: artifact.submittedSceneIds.filter((id) => id !== op.sceneId),
      }

    default:
      throw new Error(`Unknown op type: ${(op as TWorkflowSemanticOp).type}`)
  }
}

// ---------------------------------------------------------------------------
// Clip-level ops applied to customSparse
// ---------------------------------------------------------------------------

const applyClipLevelOp = (
  scene: IStoryboardScene,
  op: TWorkflowSemanticOp
): IStoryboardScene => {
  const sparse: ISparseSceneFragment = scene.customSparse ?? {
    sceneId: scene.sceneId,
    tracks: {},
  }

  if (op.type === 'insert-clip') {
    const clips = sparse.tracks[op.trackId] ?? []
    return {
      ...scene,
      customSparse: {
        ...sparse,
        tracks: { ...sparse.tracks, [op.trackId]: [...clips, op.clip] },
      },
    }
  }

  if (op.type === 'remove-clip') {
    const tracks = Object.fromEntries(
      Object.entries(sparse.tracks).map(([tid, clips]) => [
        tid,
        clips.filter((c) => ('$ref' in c ? true : c.id !== op.clipId)),
      ])
    )
    return { ...scene, customSparse: { ...sparse, tracks } }
  }

  if (op.type === 'set-track-z-order') {
    return { ...scene, customSparse: sparse }
  }

  const clipId = 'clipId' in op ? op.clipId : null
  if (!clipId) return scene

  const tracks = Object.fromEntries(
    Object.entries(sparse.tracks).map(([tid, clips]) => [
      tid,
      clips.map((clip) => {
        if ('$ref' in clip || clip.id !== clipId) return clip
        if (op.type === 'set-clip-geometry') {
          return {
            ...clip,
            ...(op.position ? { position: { x: op.position.x, y: op.position.y } } : {}),
            ...(op.scale !== undefined ? { scale: op.scale } : {}),
            ...(op.rotation !== undefined ? { rotation: op.rotation } : {}),
            ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
          }
        }
        if (op.type === 'set-clip-asset-crop') {
          return { ...clip, crop: op.crop }
        }
        if (op.type === 'set-text-color') {
          return { ...clip, text: { ...(clip.text ?? { content: '' }), color: op.color } }
        }
        return clip
      }),
    ])
  )
  return { ...scene, customSparse: { ...sparse, tracks } }
}

const mergeSparsePatch = (
  existing: ISparseSceneFragment | undefined,
  patch: ISparseSceneFragment
): ISparseSceneFragment => {
  const base: ISparseSceneFragment = existing ?? { sceneId: patch.sceneId, tracks: {} }
  const tracks = { ...base.tracks }
  for (const [trackId, clips] of Object.entries(patch.tracks)) {
    tracks[trackId] = [...(tracks[trackId] ?? []), ...clips]
  }
  return { ...base, tracks }
}
