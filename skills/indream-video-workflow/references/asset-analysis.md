# Asset Analysis

Every asset uploaded via `indream_assets_upload` returns an `analysis` object (populated locally by sharp, or null if sharp unavailable).

## IAssetAnalysis fields

| Field | Type | Source | Description |
|---|---|---|---|
| `width` | number | always | Pixel width |
| `height` | number | always | Pixel height |
| `durationInSeconds` | number\|null | video/audio | Duration |
| `hasAudio` | bool\|null | video | Has audio track |
| `dominantColors` | string[] | local-sharp | Top-5 hex colors (k-means) |
| `bgLuminance` | 'light'\|'dark'\|'mixed' | local-sharp | Corner luminance average |
| `subjectBbox` | {x,y,w,h}\|null | local-sharp | Conservative center-60% fallback until ML API |
| `textSafeZones` | string[] | local-sharp | 'top','bottom','left','right','center' |
| `hasEmbeddedText` | bool\|null | pending-api | Returns null until backend OCR |
| `composition` | string\|null | local-sharp | 'centered','portrait', etc. |
| `source` | 'local-sharp'\|'indream-api' | — | Where analysis came from |

## Decision guide

- **bgLuminance = 'light'**: Use dark text or text with stroke. Prefer `accentColor: "#000000"`.
- **bgLuminance = 'dark'**: White or light text is safe. Default overlay may not be needed.
- **textSafeZones**: Place text only in these zones to avoid covering the subject.
- **subjectBbox**: null or center-60% fallback — don't rely on it for ML-level subject detection.
- **dominantColors[0]**: Extract accent color from primary media for consistent brand matching.

## Re-running analysis

Call `indream_asset_analyze` with `assetId` to force a fresh local-sharp pass. Use `forceRefresh: true` to invalidate cache.
