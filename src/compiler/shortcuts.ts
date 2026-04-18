import type { IKeyframeShortcut } from '../workflow/types'
import { msToTicks } from './defaults'
import type { TAnimatedNumberTrack } from './defaults'

/**
 * Expand an IKeyframeShortcut (from sparse JSON) into an animatedNumberTrack.
 * Keyframe t values are 0-1 fractions of clip duration (durationMs).
 */
export const expandShortcut = (
  shortcut: IKeyframeShortcut,
  durationMs: number
): TAnimatedNumberTrack => {
  const durationTicks = msToTicks(durationMs)

  if (typeof shortcut === 'number') {
    return { value: shortcut, keyframes: [] }
  }

  if (Array.isArray(shortcut)) {
    if (shortcut.length === 0) return { value: 0, keyframes: [] }
    if (shortcut.length === 1) return { value: shortcut[0], keyframes: [] }
    const step = 1 / (shortcut.length - 1)
    return {
      value: shortcut[0],
      keyframes: shortcut.slice(1).map((v, i) => ({
        timeTicks: Math.round((i + 1) * step * durationTicks),
        value: v,
      })),
    }
  }

  if ('from' in shortcut && 'to' in shortcut) {
    return {
      value: shortcut.from,
      keyframes: [{ timeTicks: durationTicks, value: shortcut.to }],
    }
  }

  // Already fully specified: { value, keyframes: [{t, v}] }
  return {
    value: shortcut.value,
    keyframes: shortcut.keyframes.map(({ t, v }) => ({
      timeTicks: Math.round(t * durationTicks),
      value: v,
    })),
  }
}

export const expandOptionalShortcut = (
  shortcut: IKeyframeShortcut | undefined,
  defaultValue: number,
  durationMs: number
): TAnimatedNumberTrack =>
  shortcut !== undefined
    ? expandShortcut(shortcut, durationMs)
    : { value: defaultValue, keyframes: [] }
