# Animation Map Diagnostics

The animation map is built automatically during `indream_video_workflow_review` whenever the build gate has been passed. It performs static timeline analysis without any LLM call.

## Diagnostic codes

| Code | Severity | Meaning | Fix |
|---|---|---|---|
| `ANIMATION_MAP_TRACK_OVERLAP` | error | Two clips in the same track overlap in time | Adjust `startMs`/`durationMs` via `set-clip-geometry` or `apply-sparse-patch` |
| `ANIMATION_MAP_DEAD_ZONE` | warning | Track has ≥800ms gap with no clip | Extend adjacent clip or insert filler. Use `insert-clip` op. |
| `EDITOR_STATE_VALIDATION` | error | Schema validation failed from client.editor.validate | Inspect error detail; rebuild scene via `rebuild-scene-from-storyboard` |
| `EXPAND_FAILED` | error | Expander threw during scene build | Check blockRef and slot definitions |

## Review contracts

Set in `storyboard.reviewContracts`:
- `enforceTrackOverlapFree: true` → overlaps become errors
- `enforceSceneDurationMatch: true` → scene duration must match actual clip span
- `enforceCtaSingleLine: true` → CTA copy must be ≤60 chars, no newlines

## Stats fields

After review, `animationMap.stats` contains:
- `totalDurationMs` — full timeline length
- `trackCount` — number of tracks
- `clipCount` — total clips across all tracks
