import type { TEditorStateV1 } from '@indreamai/client'

export interface ITrackLane {
  trackId: string
  clips: Array<{
    clipId: string
    type: string
    startMs: number
    endMs: number
  }>
}

export interface IDeadZone {
  trackId: string
  startMs: number
  endMs: number
  durationMs: number
}

export interface IOverlap {
  trackId: string
  clipA: string
  clipB: string
  overlapMs: number
}

export interface IElementLifecycle {
  clipId: string
  trackId: string
  type: string
  enterMs: number
  exitMs: number
  hasAnimIn: boolean
  hasAnimOut: boolean
}

export interface IAnimationMapStats {
  totalDurationMs: number
  trackCount: number
  clipCount: number
}

export interface IAnimationMap {
  gantt: ITrackLane[]
  deadZones: IDeadZone[]
  overlaps: IOverlap[]
  lifecycles: IElementLifecycle[]
  stats: IAnimationMapStats
}

const TICKS_PER_MS = 240000 / 1000

const ticksToMs = (ticks: number): number => Math.round(ticks / TICKS_PER_MS)

const DEAD_ZONE_THRESHOLD_MS = 800

export const buildAnimationMap = (editorState: TEditorStateV1): IAnimationMap => {
  const state = editorState as unknown as Record<string, unknown>
  const tracks = (state.tracks as Array<{ id: string; items: string[] }>) ?? []
  const items = (state.items as Record<string, Record<string, unknown>>) ?? {}

  const gantt: ITrackLane[] = []
  const deadZones: IDeadZone[] = []
  const overlaps: IOverlap[] = []
  const lifecycles: IElementLifecycle[] = []

  let maxEndMs = 0

  for (const track of tracks) {
    const lane: ITrackLane = { trackId: track.id, clips: [] }

    const trackClips = (track.items ?? [])
      .map((itemId) => {
        const item = items[itemId]
        if (!item) return null
        const startMs = ticksToMs(Number(item.startTicks ?? 0))
        const durationMs = ticksToMs(Number(item.durationTicks ?? 0))
        return {
          clipId: itemId,
          type: typeof item.type === 'string' ? item.type : 'unknown',
          startMs,
          endMs: startMs + durationMs,
        }
      })
      .filter(Boolean) as ITrackLane['clips']

    trackClips.sort((a, b) => a.startMs - b.startMs)
    lane.clips = trackClips
    gantt.push(lane)

    // Track max timeline end
    for (const clip of trackClips) {
      if (clip.endMs > maxEndMs) maxEndMs = clip.endMs
    }

    // Detect overlaps within track
    for (let i = 0; i < trackClips.length - 1; i++) {
      const a = trackClips[i]
      const b = trackClips[i + 1]
      if (b.startMs < a.endMs) {
        overlaps.push({
          trackId: track.id,
          clipA: a.clipId,
          clipB: b.clipId,
          overlapMs: a.endMs - b.startMs,
        })
      }
    }

    // Detect dead zones (gaps ≥ threshold between clips)
    for (let i = 0; i < trackClips.length - 1; i++) {
      const gap = trackClips[i + 1].startMs - trackClips[i].endMs
      if (gap >= DEAD_ZONE_THRESHOLD_MS) {
        deadZones.push({
          trackId: track.id,
          startMs: trackClips[i].endMs,
          endMs: trackClips[i + 1].startMs,
          durationMs: gap,
        })
      }
    }

    // Lifecycle entries
    for (const clip of trackClips) {
      const item = items[clip.clipId] ?? {}
      const animations = item.animations as { in?: unknown; out?: unknown } | undefined
      lifecycles.push({
        clipId: clip.clipId,
        trackId: track.id,
        type: clip.type,
        enterMs: clip.startMs,
        exitMs: clip.endMs,
        hasAnimIn: !!animations?.in,
        hasAnimOut: !!animations?.out,
      })
    }
  }

  return {
    gantt,
    deadZones,
    overlaps,
    lifecycles,
    stats: {
      totalDurationMs: maxEndMs,
      trackCount: tracks.length,
      clipCount: lifecycles.length,
    },
  }
}

export interface IAnimationMapDiagnostic {
  severity: 'error' | 'warning'
  code: string
  trackId?: string
  clipId?: string
  message: string
}

export const diagnoseAnimationMap = (
  map: IAnimationMap,
  contracts: {
    enforceTrackOverlapFree: boolean
    enforceSceneDurationMatch: boolean
  }
): IAnimationMapDiagnostic[] => {
  const diagnostics: IAnimationMapDiagnostic[] = []

  if (contracts.enforceTrackOverlapFree) {
    for (const overlap of map.overlaps) {
      diagnostics.push({
        severity: 'error',
        code: 'ANIMATION_MAP_TRACK_OVERLAP',
        trackId: overlap.trackId,
        message: `Clips ${overlap.clipA} and ${overlap.clipB} overlap by ${overlap.overlapMs}ms in track ${overlap.trackId}.`,
      })
    }
  }

  for (const zone of map.deadZones) {
    diagnostics.push({
      severity: 'warning',
      code: 'ANIMATION_MAP_DEAD_ZONE',
      trackId: zone.trackId,
      message: `Dead zone of ${zone.durationMs}ms in track ${zone.trackId} (${zone.startMs}–${zone.endMs}ms).`,
    })
  }

  return diagnostics
}
