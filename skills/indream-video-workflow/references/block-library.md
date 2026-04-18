# Block Library

Use `indream_video_workflow_block_list` to get live list. Use `indream_video_workflow_block_read` to get the full skeleton JSON for a specific block.

## Available Blocks

| ID | Description | Best ratios | Required slots |
|---|---|---|---|
| `block:hero-card` | Full-frame hero: media + headline at bottom | all | primary |
| `block:split-layout` | Left/right split: media + text panel | 16:9, 4:3, 1:1 | primary |
| `block:cta-primary` | Strong CTA: large headline + badge | all | none |
| `block:title-card` | Opening title with accent bar | all | none |
| `block:end-card` | Closing card with brand message | all | none |
| `block:caption-centered` | Narration scene: video bg + centered captions | all | primary, captions |
| `block:list-stack` | Vertically stacked bullet list | 16:9, 9:16 | none |
| `block:quote-card` | Pull-quote with attribution | all | none (portrait optional) |
| `block:compare-split` | Before/after A/B two-panel comparison | 16:9, 1:1 | left, right |
| `block:illustration-board` | Illustration centered on color bg | all | none |

## Selection guidance

- **speech-edit**: prefer `block:caption-centered` for narration scenes.
- **product-demo**: prefer `block:hero-card` (intro), `block:split-layout` (feature detail), `block:cta-primary` (end).
- **explainer**: prefer `block:title-card` (intro), `block:list-stack` or `block:illustration-board` (concept), `block:cta-primary` (close).
- For custom layouts, set `blockRef: "custom"` and provide `customSparse`.

## Overridable fields

Every block exposes `overridableFields`. Use `set-scene-block-override` op or the `blockOverride` storyboard field to customize:
- `headline`, `subheadline`, `body`, `ctaText` — copy text
- `accentColor` — hex color matching brand
- `bgColor` — background hex
- `overlayOpacity` — media overlay strength (0–1)
- `illustrationName`, `illustrationColor` — for illustration blocks
