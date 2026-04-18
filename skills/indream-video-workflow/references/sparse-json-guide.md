# Sparse JSON Guide

Sub-agents write Sparse JSON — only non-default fields. The Expander fills in defaults.

## ISparseSceneFragment

```json
{
  "sceneId": "s01",
  "tracks": {
    "media": [ ...clips ],
    "text":  [ ...clips ]
  }
}
```

## ISparseClip — two forms

### 1. Block $ref (preferred)

```json
{ "$ref": "block:hero-card", "override": { "headline": "New Title" } }
```

### 2. Inline clip

```json
{
  "id": "s01-bg",
  "type": "image",
  "startMs": 0,
  "durationMs": 3000,
  "asset": { "slotKey": "primary" },
  "size": { "width": 1, "height": 1 },
  "position": { "x": 0, "y": 0 }
}
```

## IKeyframeShortcut — animated properties

```
opacity / scale / rotation accept:
  number           → constant scalar
  [a, b, c]        → evenly distributed keyframes
  { from, to }     → linear from→to over clip duration
  { value, keyframes: [{t, v}] } → explicit (t = fraction 0-1)
```

Examples:
```json
"opacity": 0.8
"opacity": [0, 1]
"scale": { "from": 1, "to": 1.1 }
"opacity": { "value": 0, "keyframes": [{ "t": 0.2, "v": 1 }] }
```

## Position and size units

- Values ≤ 1 → fraction of composition (0.5 = 50%)
- Values > 1 → absolute pixels

```json
"position": { "x": 0.1, "y": 0.72 }
"size": { "width": 0.8, "height": 0.2 }
```

## Clip types

`text`, `image`, `video`, `gif`, `lottie`, `audio`, `caption`, `solid`, `illustration`

## Text spec

```json
"text": {
  "content": "Hello World",
  "fontWeight": 700,
  "fontSize": 80,
  "color": "#ffffff",
  "align": "center",
  "lineHeight": 1.3
}
```

## Asset binding in clips

```json
"asset": { "slotKey": "primary" }   // resolved from scene.slots
"asset": { "assetId": "abc123" }    // direct
```

## Illustration clip (minimum working example)

Use the illustration name returned by `indream_illustrations_search`.

```json
{
  "id": "s01-illus",
  "type": "illustration",
  "startMs": 0,
  "durationMs": 3000,
  "asset": { "type": "illustration", "illustrationName": "IAiChat" },
  "illustrationColor": "#ff6600",
  "size": { "width": 0.28, "height": 0.28 },
  "position": { "x": 0.62, "y": 0.2 }
}
```

`illustrationName` may also be written at clip top-level, but the recommended shape is the `asset` binding form above because it matches the workflow binding model.
