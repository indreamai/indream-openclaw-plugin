import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { IAssetAnalysis } from './types'

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.indream', 'analysis')

let cacheDir = DEFAULT_CACHE_DIR

export const setCacheDir = (dir: string) => {
  cacheDir = dir
}

const ensureCacheDir = () => {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
}

const cacheFilePath = (assetId: string) =>
  path.join(cacheDir, `${assetId}.json`)

export const readAnalysisCache = (assetId: string): IAssetAnalysis | null => {
  try {
    const p = cacheFilePath(assetId)
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw) as IAssetAnalysis
  } catch {
    return null
  }
}

export const writeAnalysisCache = (analysis: IAssetAnalysis): void => {
  try {
    ensureCacheDir()
    const p = cacheFilePath(analysis.assetId)
    fs.writeFileSync(p, JSON.stringify(analysis, null, 2), 'utf-8')
  } catch {
    // Non-fatal — analysis still returned to caller
  }
}

export const invalidateAnalysisCache = (assetId: string): void => {
  try {
    const p = cacheFilePath(assetId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {
    // Ignore
  }
}
