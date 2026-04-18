import type { TVideoRatio } from '../workflow/types'

export const TIMEBASE_TICKS_PER_SECOND = 240000 as const

export const msToTicks = (ms: number): number =>
  Math.max(0, Math.round((ms / 1000) * TIMEBASE_TICKS_PER_SECOND))

export const secondsToTicks = (seconds: number): number =>
  Math.max(0, Math.round(seconds * TIMEBASE_TICKS_PER_SECOND))

export type TAnimatedNumberTrack = {
  value: number
  keyframes: Array<{ timeTicks: number; value: number }>
}

export const animatedScalar = (value: number): TAnimatedNumberTrack => ({
  value,
  keyframes: [],
})

export const DEFAULT_COMPOSITION_DIMENSIONS: Record<
  TVideoRatio,
  { width: number; height: number }
> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  custom: { width: 1920, height: 1080 },
}

export const GEOMETRY_FULL_FRAME = (
  compositionWidth: number,
  compositionHeight: number
) => ({
  top: animatedScalar(0),
  left: animatedScalar(0),
  width: animatedScalar(compositionWidth),
  height: animatedScalar(compositionHeight),
  scaleX: animatedScalar(1),
  scaleY: animatedScalar(1),
  opacity: animatedScalar(1),
})

export const TIMELINE_ITEM_BASE_DEFAULTS = {
  isDraggingInTimeline: false,
}

export const IMAGE_ITEM_DEFAULTS = {
  keepAspectRatio: true,
  borderRadius: animatedScalar(0),
  rotation: animatedScalar(0),
}

export const VIDEO_ITEM_DEFAULTS = {
  keepAspectRatio: true,
  borderRadius: animatedScalar(0),
  rotation: animatedScalar(0),
  videoStartFromInSeconds: 0,
  decibelAdjustment: animatedScalar(0),
  playbackRate: 1,
  audioFadeInDurationInSeconds: 0,
  audioFadeOutDurationInSeconds: 0,
}

export const GIF_ITEM_DEFAULTS = {
  keepAspectRatio: true,
  borderRadius: animatedScalar(0),
  rotation: animatedScalar(0),
  gifStartFromInSeconds: 0,
  playbackRate: 1,
}

export const LOTTIE_ITEM_DEFAULTS = {
  keepAspectRatio: true,
  rotation: animatedScalar(0),
  lottieStartFromInSeconds: 0,
  playbackRate: 1,
}

export const AUDIO_ITEM_DEFAULTS = {
  audioStartFromInSeconds: 0,
  decibelAdjustment: animatedScalar(0),
  playbackRate: 1,
  audioFadeInDurationInSeconds: 0,
  audioFadeOutDurationInSeconds: 0,
}

export const TEXT_FONT_DEFAULTS = {
  fontFamily: 'Inter',
  fontStyle: { variant: 'normal', weight: '500' },
  fontSize: 64,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#ffffff',
  align: 'center' as const,
  direction: 'ltr' as const,
  strokeWidth: 0,
  strokeColor: '#000000',
}

export const TEXT_ITEM_DEFAULTS = {
  ...TEXT_FONT_DEFAULTS,
  resizeOnEdit: true,
  background: null as null | {
    color: string
    horizontalPadding: number
    borderRadius: number
  },
}

export const CAPTIONS_ITEM_DEFAULTS = {
  fontFamily: 'Inter',
  fontStyle: { variant: 'normal', weight: '600' },
  fontSize: 56,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'center' as const,
  color: '#ffffff',
  highlightColor: '#ffcc00',
  strokeWidth: 0,
  strokeColor: '#000000',
  direction: 'ltr' as const,
  pageDurationInMilliseconds: 2500,
  maxLines: 2,
  contentStartOffsetMs: 0,
  source: 'auto' as const,
  captionGroupId: null as string | null,
  background: null as null | {
    color: string
    horizontalPadding: number
    borderRadius: number
  },
}

export const SOLID_ITEM_DEFAULTS = {
  color: '#000000',
  shape: 'rectangle' as const,
  keepAspectRatio: false,
  borderRadius: animatedScalar(0),
  rotation: animatedScalar(0),
}

export const ILLUSTRATION_ITEM_DEFAULTS = {
  color: '#ffffff',
  keepAspectRatio: true,
  rotation: animatedScalar(0),
}

export const EFFECT_ITEM_DEFAULTS = {
  intensity: 0.5,
}

export const FILTER_ITEM_DEFAULTS = {
  intensity: 0.5,
}

export const CHART_ITEM_DEFAULTS = {
  keepAspectRatio: false,
  themeColor: '#3b82f6',
  animationDurationTicks: secondsToTicks(1),
  rotation: animatedScalar(0),
}

export const DEFAULT_GLOBAL_BACKGROUND = { type: 'color' as const, color: '#000000', gradient: null }
