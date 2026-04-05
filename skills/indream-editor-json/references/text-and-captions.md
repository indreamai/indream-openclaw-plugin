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
- `captionStartInSeconds`
- `maxLines`
- `source`
- `captionGroupId`
- `background`
- full base geometry fields

Important subtitle rules:

- `source` must be one of `manual`, `auto`, or `upload`.
- `captionGroupId` can be `null`.
- `background` can be `null` or an object with:
  - `color`
  - `horizontalPadding`
  - `borderRadius`
- `captionAnimations` is not allowed when the linked caption asset uses `timingGranularity: "word"`.
  If the user wants subtitle animation, prefer `timingGranularity: "line"` for the caption asset.
- For production authoring, start with one short `captionAnimations.in` on `captions` items and add more layers only after a real export probe.
  Dense combinations can validate but still be a worse default for renderer stability.

Practical guidance:

- Use `captions` for real subtitle timing.
- Use `text` for static or manually timed overlay copy.
- Use `highlightColor` only when the subtitle style calls for word or phrase emphasis.
- Keep `pageDurationInMilliseconds` aligned with the intended subtitle pagination behavior.
- Make sure the `captions` item duration fully covers the subtitle asset timing window after applying `captionStartInSeconds`.
  A validation pass may still succeed when the subtitle data slightly overruns the clip, but real export can fail at render time.

## Caption asset and captions item pairing

The clean subtitle workflow is:

1. store subtitle timing data in a `caption` asset under `assets`
2. reference that asset from a `captions` item
3. style the `captions` item for readability and animation

This is better than manually creating one text item per subtitle line unless the user explicitly wants handcrafted timing.

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

- `nodes` must contain at least two entries.
- Each node must have a `type` of `image` or `text`.
- The schema keeps nodes intentionally flexible, but that does not mean you should invent arbitrary template contracts.

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
