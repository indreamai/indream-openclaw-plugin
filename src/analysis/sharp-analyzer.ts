import type { IAssetAnalysis, TBgLuminance, TSafeZone, TComposition } from './types'

interface ISharpImg {
  metadata(): Promise<{ width?: number; height?: number }>
  resize(opts: { width: number; height: number; fit: string }): ISharpImg
  raw(): ISharpImg
  toBuffer(opts: { resolveWithObject: true }): Promise<{
    data: Buffer
    info: { width: number; height: number; channels: number }
  }>
}
type SharpModule = (input: Buffer | string) => ISharpImg

let sharpModule: SharpModule | null = null

const loadSharp = async (): Promise<SharpModule | null> => {
  if (sharpModule) return sharpModule
  try {
    const mod = await import('sharp')
    sharpModule = mod.default as unknown as SharpModule
    return sharpModule
  } catch {
    return null
  }
}

interface IRgb { r: number; g: number; b: number }

const luminance = ({ r, g, b }: IRgb): number =>
  0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255)

const rgbToHex = ({ r, g, b }: IRgb): string =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

// Simple k-means (k=5) on downsampled pixel buffer
const kMeansColors = (pixels: Buffer, k = 5, iters = 10): IRgb[] => {
  const pts: IRgb[] = []
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    pts.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] })
  }
  if (pts.length === 0) return [{ r: 0, g: 0, b: 0 }]

  // Initialize centroids by sampling evenly
  const step = Math.max(1, Math.floor(pts.length / k))
  const centroids: IRgb[] = Array.from({ length: k }, (_, i) => ({ ...pts[i * step] }))

  for (let iter = 0; iter < iters; iter++) {
    const clusters: IRgb[][] = Array.from({ length: k }, () => [])
    for (const pt of pts) {
      let best = 0
      let bestDist = Infinity
      for (let ci = 0; ci < k; ci++) {
        const c = centroids[ci]
        const d = (pt.r - c.r) ** 2 + (pt.g - c.g) ** 2 + (pt.b - c.b) ** 2
        if (d < bestDist) { bestDist = d; best = ci }
      }
      clusters[best].push(pt)
    }
    for (let ci = 0; ci < k; ci++) {
      const cl = clusters[ci]
      if (cl.length === 0) continue
      centroids[ci] = {
        r: Math.round(cl.reduce((s, p) => s + p.r, 0) / cl.length),
        g: Math.round(cl.reduce((s, p) => s + p.g, 0) / cl.length),
        b: Math.round(cl.reduce((s, p) => s + p.b, 0) / cl.length),
      }
    }
  }

  // Sort by cluster size (descending) — return largest clusters first
  return centroids
}

const classifyLuminance = (lum: number): TBgLuminance => {
  if (lum > 0.65) return 'light'
  if (lum < 0.35) return 'dark'
  return 'mixed'
}

const inferComposition = (width: number, height: number): TComposition => {
  const ratio = width / height
  if (ratio < 0.75) return 'portrait'
  return 'centered'
}

const inferTextSafeZones = (
  bgLuminance: TBgLuminance,
  composition: TComposition
): TSafeZone[] => {
  if (composition === 'portrait') return ['bottom', 'top']
  if (bgLuminance === 'light') return ['bottom', 'top']
  return ['bottom', 'top', 'left', 'right', 'center']
}

export interface ISharpAnalysisInput {
  assetId: string
  buffer: Buffer
  mimeType?: string
  width?: number
  height?: number
  durationInSeconds?: number | null
  hasAudio?: boolean | null
}

export const analyzeImageBuffer = async (
  input: ISharpAnalysisInput
): Promise<IAssetAnalysis | null> => {
  const sharp = await loadSharp()
  if (!sharp) return null

  try {
    const img = sharp(input.buffer)
    const { width = input.width ?? 0, height = input.height ?? 0 } = await img.metadata()

    // Downsample to ≤100×100 for fast analysis
    const thumb = img.resize({ width: 100, height: 100, fit: 'inside' })
    const { data, info } = await thumb.raw().toBuffer({ resolveWithObject: true })

    // Dominant colors via k-means
    const centroids = kMeansColors(data, 5)
    const dominantColors = centroids.map(rgbToHex)

    // BG luminance: sample four corners of thumbnail
    const cornerPx: IRgb[] = []
    const w = info.width
    const h = info.height
    const ch = info.channels
    const readPx = (x: number, y: number): IRgb => {
      const off = (y * w + x) * ch
      return { r: data[off], g: data[off + 1], b: data[off + 2] }
    }
    cornerPx.push(readPx(0, 0), readPx(w - 1, 0), readPx(0, h - 1), readPx(w - 1, h - 1))
    // Also center
    cornerPx.push(readPx(Math.floor(w / 2), Math.floor(h / 2)))

    const avgLum = cornerPx.reduce((s, px) => s + luminance(px), 0) / cornerPx.length
    const bgLuminance = classifyLuminance(avgLum)
    const composition = inferComposition(width, height)
    const textSafeZones = inferTextSafeZones(bgLuminance, composition)

    return {
      assetId: input.assetId,
      analyzedAt: new Date().toISOString(),
      source: 'local-sharp',
      width,
      height,
      durationInSeconds: input.durationInSeconds ?? null,
      hasAudio: input.hasAudio ?? null,
      dominantColors,
      bgLuminance,
      subjectBbox: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, // conservative center fallback
      textSafeZones,
      hasEmbeddedText: null,
      composition,
    }
  } catch {
    return null
  }
}

export const isSharpAvailable = async (): Promise<boolean> => {
  const sharp = await loadSharp()
  return sharp !== null
}
