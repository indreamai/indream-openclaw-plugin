export type TSafeZone = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type TBgLuminance = 'light' | 'dark' | 'mixed'

export type TComposition =
  | 'centered'
  | 'rule-of-thirds'
  | 'portrait'
  | 'full-bleed'

export interface IAssetAnalysis {
  assetId: string
  analyzedAt: string
  source: 'local-sharp' | 'indream-api'
  width: number
  height: number
  durationInSeconds: number | null
  hasAudio: boolean | null
  dominantColors: string[]
  bgLuminance: TBgLuminance
  subjectBbox: { x: number; y: number; w: number; h: number } | null
  textSafeZones: TSafeZone[]
  hasEmbeddedText: boolean | null
  composition: TComposition | null
}

export interface IAssetSidecar {
  assetId: string
  fileKey: string | null
  analysis: IAssetAnalysis
}
