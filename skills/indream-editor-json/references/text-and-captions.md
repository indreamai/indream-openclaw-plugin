# Text, Captions, and Templates

## Text item

Use `text` for normal titles, lower thirds, bullet callouts, labels, quote cards, and simple animated copy.

Required fields:

- `type: "text"`
- `text`
- `color`
- `align`
- `fontFamily`
- `fontStyle`
- `fontSize`
- `lineHeight`
- `letterSpacing`
- `resizeOnEdit`
- `direction`
- `strokeWidth`
- `strokeColor`
- full base geometry fields

Common optional fields:

- `background`
- `rotation`
- `animations`
- `captionAnimations`

Practical defaults:

- `align`: `left` for blocks of copy, `center` for hero text
- `direction`: `ltr` unless the content is actually right-to-left
- `resizeOnEdit`: `true` for editable text overlays
- `strokeWidth`: `0` unless the user asked for outline text
- `background`: `null` unless the text needs a pill, chip, or readable subtitle box

## Caption animation support on text

Text items can use subtitle-style animation types through `captionAnimations`.
Supported schema values:

- `converge`
- `elastic-pop`
- `typewriter`
- `lay-down`
- `center-type-out`
- `curtain-close`
- `jitter`
- `rainbow`
- `sweep-shine`

Use them when the user wants:

- kinetic lyric text
- punchy social captions
- animated slogans
- text-only subtitle effects

Avoid stacking too many different caption animation types in one short clip unless the user clearly wants a flashy style.

## Captions item

Use `captions` when the user has a real subtitle asset and wants timed subtitle playback.

Required fields:

- `type: "captions"`
- `assetId`
- `fontFamily`
- `fontStyle`
- `lineHeight`
- `letterSpacing`
- `fontSize`
- `align`
- `color`
- `highlightColor`
- `strokeWidth`
- `strokeColor`
- `direction`
- `pageDurationInMilliseconds`
- `maxLines`
- `contentStartOffsetMs`
- `source`
- `captionGroupId`
- `background`
- full base geometry fields

Production-safe authoring fields:

- `animations`
- Use `animations: {}` when no clip-level container motion is needed.

Important subtitle rules:

- `source` must be one of `manual`, `auto`, or `upload`.
- `auto` defaults to word-timing behavior.
- `manual` and `upload` default to line-timing behavior unless the linked caption asset explicitly says otherwise.
- `captionGroupId` can be `null` for a standalone subtitle item.
- Reuse one stable non-null `captionGroupId` when multiple `captions` items belong to the same subtitle sequence.
- `background` can be `null` or an object with:
  - `color`
  - `horizontalPadding`
  - `borderRadius`
- `animations` affects the outer subtitle container.
- `captionAnimations` affects the inner text rendering and grapheme-level text behavior.
- `captionAnimations` is optional and is not allowed when the linked caption asset uses `timingGranularity: "word"`.
  If the user wants subtitle animation, prefer `timingGranularity: "line"` for the caption asset.
- `pageDurationInMilliseconds` groups word-timed captions into readable subtitle pages when the linked caption asset uses `timingGranularity: "word"`.
- `highlightColor` is mainly useful for word-timed playback where the active word or token should stand out.
- `contentStartOffsetMs` is required and must be a non-negative number.
  It represents the lead-in between the caption item start and the caption content local zero point.
- Subtitle clip timing is controlled by the item timeline window together with `contentStartOffsetMs`.
  Do not invent any additional item-level playback offset fields.
- For production authoring, start with one short `captionAnimations.in` on `captions` items and add more layers only after a real export probe.
  Dense combinations can validate but still be a worse default for renderer stability.

Practical guidance:

- Use `captions` for real subtitle timing.
- Use `text` for static or manually timed overlay copy.
- Use `highlightColor` primarily when the subtitle style calls for active word or phrase emphasis.
- Keep `pageDurationInMilliseconds` aligned with the intended subtitle pagination behavior, especially for word-timed captions.
- Keep `assets[*].captions[].startMs/endMs/timestampMs` local to the owning `captions` item start time. If one subtitle sequence spans multiple items, each item should use caption timing rebased to its own local zero point.
- Use `contentStartOffsetMs` when the subtitle clip should appear slightly earlier than the first timed word or line.
  Left-edge extension should increase this lead-in instead of rewriting caption token timing.
- Make sure the `captions` item duration fully covers the intended visible subtitle window. It is valid for the clip to remain active after the last word when the subtitle item should stay on screen slightly longer than the timed text.

## Caption asset and captions item pairing

The clean subtitle workflow is:

1. store subtitle timing data in a `caption` asset under `assets`
2. reference that asset from a `captions` item
3. style the `captions` item for readability and animation

This is better than manually creating one text item per subtitle line unless the user explicitly wants handcrafted timing.

## Word-timed caption asset fragment

Relevant fragment only.
For word-timed subtitles, `assets[*].captions[]` is a flat list of words or tokens.
Each caption time is local to the owning `captions` item, not an absolute composition timestamp.
Do not store grouped `cues` objects inside the editor asset.
Each caption entry should use this leaf structure:

- `text` is required
- `startMs` is required
- `endMs` is required and must be greater than `startMs`
- `timestampMs` is optional and may be `null`
- `confidence` is optional and may be `null`

```json
{
  "assets": {
    "asset-caption-words": {
      "id": "asset-caption-words",
      "type": "caption",
      "filename": "captions.json",
      "size": 512,
      "remoteUrl": null,
      "remoteKey": null,
      "mimeType": "application/json",
      "timingGranularity": "word",
      "captions": [
        {
          "text": "Hello ",
          "startMs": 0,
          "endMs": 420,
          "timestampMs": 0,
          "confidence": 0.98
        },
        {
          "text": "world",
          "startMs": 420,
          "endMs": 900,
          "timestampMs": 420,
          "confidence": 0.96
        }
      ]
    }
  },
  "items": {
    "item-caption-words": {
      "id": "item-caption-words",
      "type": "captions",
      "assetId": "asset-caption-words",
      "source": "auto",
      "pageDurationInMilliseconds": 1200,
      "contentStartOffsetMs": 0,
      "animations": {}
    }
  }
}
```

## Text-template item

Use `text-template` only when you have a real template contract.

Required fields:

- `type: "text-template"`
- `schemaVersion: 2`
- `templateId`
- `templateCategory`
- `nodes`
- full base geometry fields

Notes:

- `nodes` must contain exactly 1 `image` node.
- `nodes` must contain 1 to 3 `text` nodes.
- No other node types are valid here.
- `image` nodes should use the stable fields `id`, `type`, `imageType`, `imageComponentId`, `imageLottieJson`, `x`, `y`, `width`, `height`, and `opacity`.
- `text` nodes should use the stable fields `id`, `type`, `x`, `y`, `width`, `height`, `text`, `color`, `align`, `fontFamily`, `fontStyle`, `fontSize`, `lineHeight`, `letterSpacing`, `direction`, `strokeWidth`, `strokeColor`, and `background`.

When to avoid `text-template`:

- the request is just "make a bold title card"
- the template ID is unknown
- the node structure is not supplied by a product system
- the same result can be achieved with normal `text`, `image`, and `solid` items

## Subtitle styling patterns

### Clean spoken subtitles

Use:

- medium or semibold weight
- centered alignment
- modest background pill or dark translucent box
- minimal outline
- one gentle caption animation or none

### Emphasized social captions

Use:

- larger font size
- stronger highlight color
- short `captionAnimations.in`
- optional extra motion only after a real export check confirms the composition is stable

### Title-card text

Use:

- `text` item, not `captions`
- optional `captionAnimations` for headline motion
- optional `animations` for clip-level entry and exit

## Text snippet

```json
{
  "id": "item-title-1",
  "type": "text",
  "text": "Launch title",
  "color": "#ffffff",
  "align": "center",
  "fontFamily": "TikTok Sans",
  "fontStyle": {
    "variant": "normal",
    "weight": "600"
  },
  "fontSize": 72,
  "lineHeight": 1.1,
  "letterSpacing": 0,
  "resizeOnEdit": true,
  "direction": "ltr",
  "strokeWidth": 0,
  "strokeColor": "#000000",
  "background": null,
  "animations": {},
  "rotation": { "value": 0, "keyframes": [] },
  "startTicks": 0,
  "durationTicks": 120,
  "top": { "value": 160, "keyframes": [] },
  "left": { "value": 160, "keyframes": [] },
  "width": { "value": 960, "keyframes": [] },
  "height": { "value": 240, "keyframes": [] },
  "scaleX": { "value": 1, "keyframes": [] },
  "scaleY": { "value": 1, "keyframes": [] },
  "opacity": { "value": 1, "keyframes": [] },
  "isDraggingInTimeline": false
}
```
