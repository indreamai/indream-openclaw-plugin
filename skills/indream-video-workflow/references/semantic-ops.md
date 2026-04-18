# Semantic Ops Reference

All ops are passed as an array to `indream_video_workflow_revise`.

## Gate / phase

| op.type | Required fields | Gate reset |
|---|---|---|
| `advance-gate` | gate, notes? | — |
| `set-design` | content (string) | design → all downstream |
| `set-script` | content (string) | script → all downstream |
| `set-storyboard` | storyboard (Partial<IStoryboardV6>) | storyboard → all downstream |

## Brief / scene metadata

| op.type | Required fields | Gate reset |
|---|---|---|
| `replace-brief-fields` | patch (Partial<IWorkflowBrief>) | — |
| `rewrite-scene-copy` | sceneId, copy (Partial<IStoryboardCopy>) | layout |
| `retime-scene` | sceneId, durationMs | layout |
| `reorder-scenes` | sceneIds (string[]) | storyboard |
| `split-scene` | sceneId, nextSceneId, splitDurationMs, copyPatch? | storyboard |
| `merge-scenes` | sceneIds ([id,id]), nextSceneId | storyboard |

## Block-level

| op.type | Required fields | Gate reset |
|---|---|---|
| `set-scene-block` | sceneId, blockRef | layout |
| `set-scene-block-override` | sceneId, override (Record) | layout |

## Bindings

| op.type | Required fields | Gate reset |
|---|---|---|
| `bind-asset` | slotKey, binding ({type,assetId}\|{type,illustrationName}), sceneId? | layout |
| `set-transition` | sceneId, transition ({type,durationMs?}\|null) | layout |

## Geometry / visual

| op.type | Required fields | Gate reset |
|---|---|---|
| `set-clip-geometry` | sceneId, clipId, position?({x,y}), scale?, rotation?, opacity? | layout |
| `set-clip-asset-crop` | sceneId, clipId, crop ({mode?,left?,top?,right?,bottom?}) | layout |
| `set-text-color` | sceneId, clipId, color (hex) | layout |
| `set-track-z-order` | sceneId, trackOrder (string[]) | layout |
| `insert-clip` | sceneId, trackId, clip (ISparseClip) | layout |
| `remove-clip` | sceneId, clipId | layout |
| `apply-sparse-patch` | sceneId, patch (ISparseSceneFragment) | layout |

## Fan-out / rebuild

| op.type | Required fields | Effect |
|---|---|---|
| `rebuild-scene-from-storyboard` | sceneId, reason? | Clears scene from submittedSceneIds; host should re-run sub-agent |

## Example — multiple ops in one revise call

```json
[
  { "type": "rewrite-scene-copy", "sceneId": "s03", "copy": { "cta": "Shop Now" } },
  { "type": "retime-scene", "sceneId": "s03", "durationMs": 4000 },
  { "type": "bind-asset", "sceneId": "s03", "slotKey": "primary", "binding": { "type": "asset", "assetId": "abc123" } }
]
```
