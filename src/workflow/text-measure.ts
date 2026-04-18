export interface ITextMeasureInput {
  text: string
  fontFamily: string
  fontSize: number
  fontWeight?: number | string
  lineHeight?: number
  containerWidth: number
}

export interface ITextMeasureResult {
  lineCount: number
  estimatedHeight: number
  exceedsContainer: boolean
  containerHeight: number
}

/**
 * Estimates line count and height using character-width heuristics.
 * @remotion/layout-utils measureText is browser-only; this runs in Node.js.
 */
export const measureTextLines = (
  input: ITextMeasureInput,
  maxContainerHeight: number
): ITextMeasureResult => {
  const avgCharWidth = input.fontSize * 0.55
  const charsPerLine = Math.max(1, Math.floor(input.containerWidth / avgCharWidth))
  const words = input.text.split(/\s+/).filter(Boolean)
  let currentLineLen = 0
  let lineCount = 1
  for (const word of words) {
    if (currentLineLen === 0) {
      currentLineLen = word.length
    } else if (currentLineLen + 1 + word.length > charsPerLine) {
      lineCount++
      currentLineLen = word.length
    } else {
      currentLineLen += 1 + word.length
    }
  }
  const lineHeight = input.lineHeight ?? 1.2
  const estimatedHeight = lineCount * input.fontSize * lineHeight
  return {
    lineCount,
    estimatedHeight,
    exceedsContainer: estimatedHeight > maxContainerHeight,
    containerHeight: maxContainerHeight,
  }
}

export interface ITextOverflowDiagnostic {
  clipId: string
  sceneId: string
  text: string
  lineCount: number
  estimatedHeight: number
  containerHeight: number
}

export const detectTextOverflows = (
  scenes: Array<{
    sceneId: string
    clips: Array<{
      id: string
      type: string
      text?: string
      fontSize?: number
      fontFamily?: string
      fontWeight?: number | string
      lineHeight?: number
      containerWidth?: number
      containerHeight?: number
    }>
  }>
): ITextOverflowDiagnostic[] => {
  const overflows: ITextOverflowDiagnostic[] = []
  for (const scene of scenes) {
    for (const clip of scene.clips) {
      if (clip.type !== 'text' || !clip.text) continue
      const containerWidth = clip.containerWidth ?? 1920 * 0.8
      const containerHeight = clip.containerHeight ?? 200
      const result = measureTextLines(
        {
          text: clip.text,
          fontFamily: clip.fontFamily ?? 'Inter',
          fontSize: clip.fontSize ?? 64,
          fontWeight: clip.fontWeight ?? 500,
          lineHeight: clip.lineHeight ?? 1.2,
          containerWidth,
        },
        containerHeight
      )
      if (result.exceedsContainer) {
        overflows.push({
          clipId: clip.id,
          sceneId: scene.sceneId,
          text: clip.text,
          lineCount: result.lineCount,
          estimatedHeight: result.estimatedHeight,
          containerHeight,
        })
      }
    }
  }
  return overflows
}
