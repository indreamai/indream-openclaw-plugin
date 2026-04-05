# Core Timeline Items

Every item must include:

- `id`
- `type`
- `startTicks`
- `durationTicks`
- `isDraggingInTimeline`

Most visible items also require animated geometry fields:

- `top`
- `left`
- `width`
- `height`
- `scaleX`
- `scaleY`
- `opacity`

Use `{ "value": number, "keyframes": [] }` for static fields.

## Image item

Use for still images, posters, product shots, screenshots, and cutouts.

Required fields:

- `type: "image"`
- `assetId`
- `keepAspectRatio`
- `borderRadius`
- `rotation`
- full base geometry fields

Common optional fields:

- `cropLeft`
- `cropTop`
- `cropRight`
- `cropBottom`
- `animations`
- `stickerId`
- `stickerVersion`

## Video item

Use for normal footage and motion clips with optional embedded audio.

Required fields:

- `type: "video"`
- `assetId`
- `keepAspectRatio`
- `borderRadius`
- `rotation`
- `videoStartFromInSeconds`
- `decibelAdjustment`
- `playbackRate`
- `audioFadeInDurationInSeconds`
- `audioFadeOutDurationInSeconds`
- full base geometry fields

Common optional fields:

- `cropLeft`
- `cropTop`
- `cropRight`
- `cropBottom`
- `animations`

Practical notes:

- Use `playbackRate: 1` unless the user asked for speed changes.
- Use `decibelAdjustment` as an animated number track even for static volume.
- Keep `audioFadeInDurationInSeconds` and `audioFadeOutDurationInSeconds` at `0` unless the user asked for fades.

## GIF item

Use for looping motion graphics stored as GIF.

Required fields:

- `type: "gif"`
- `assetId`
- `keepAspectRatio`
- `borderRadius`
- `rotation`
- `gifStartFromInSeconds`
- `playbackRate`
- full base geometry fields

Common optional fields:

- `cropLeft`
- `cropTop`
- `cropRight`
- `cropBottom`
- `animations`

## Lottie item

Use for Lottie or SVG-based animated assets.

Required fields:

- `type: "lottie"`
- `assetId`
- `keepAspectRatio`
- `rotation`
- `lottieStartFromInSeconds`
- `playbackRate`
- full base geometry fields

Common optional fields:

- `animations`

## Audio item

Use for music tracks, narration, or voice-over.

Required fields:

- `type: "audio"`
- `assetId`
- `audioStartFromInSeconds`
- `decibelAdjustment`
- `playbackRate`
- `audioFadeInDurationInSeconds`
- `audioFadeOutDurationInSeconds`
- full base geometry fields

Practical notes:

- Audio items still inherit the base item geometry fields from the schema.
- Use harmless static defaults for geometry when the item is audio-only.
- Keep `opacity` at `1` and geometry at stable defaults unless a house convention says otherwise.

## Solid item

Use for color cards, full-screen backgrounds, blocks, lower thirds, separators, and shape masks.

Required fields:

- `type: "solid"`
- `color`
- `shape`
- `keepAspectRatio`
- `borderRadius`
- `rotation`
- full base geometry fields

Supported `shape` values:

- `rectangle`
- `circle`
- `triangle`
- `star`

Common optional fields:

- `animations`

## Illustration item

Use for product illustrations or decorative vector-like library art.

Required fields:

- `type: "illustration"`
- `illustrationName`
- `color`
- `keepAspectRatio`
- `rotation`
- full base geometry fields

Common optional fields:

- `animations`

Important:

- `illustrationName` should come from `indream_editor_capabilities` or from a known existing draft.

## Effect item

Use for timeline-scoped visual effects that apply over a time range.

Required fields:

- `type: "effect"`
- `effectType`
- `intensity`
- `startTicks`
- `durationTicks`
- `isDraggingInTimeline`

Supported schema values:

- `flash-to-black`
- `blur`
- `blurred-opening`
- `fade-in`
- `fade-out`

Common optional fields:

- `params`

Practical notes:

- Effects are timeline items, not transitions.
- Effects do not require `assetId`.
- Use capability results as the source of truth if the runtime exposes a narrower or richer allowed set.

## Filter item

Use for timed look treatments that apply over a time range.

Required fields:

- `type: "filter"`
- `filterType`
- `intensity`
- `startTicks`
- `durationTicks`
- `isDraggingInTimeline`

Supported schema values:

- `verdant-glow`
- `cyberpunk-neon`
- `vaporwave-blue`
- `sunset-orange`
- `lemon-cyan`
- `absolute-red`
- `sakura-pink`
- `twilight-dusk`

Common optional fields:

- `params`

Practical notes:

- `params.blend` is a common example pattern, but do not invent unknown parameter names.
- Keep filter windows aligned with the exact clips or moments the user described.

## Chart item

Use for data-driven visualizations.

Required fields:

- `type: "chart"`
- `chartType`
- `themeColor`
- `data`
- `animationDurationTicks`
- `keepAspectRatio`
- `rotation`
- full base geometry fields

Common optional fields:

- `animations`

Practical notes:

- `chartType` is a free string in the schema, but the current editor implementation uses these practical values:
  - `line`
  - `bar`
  - `area`
  - `pie`
  - `radar`
  - `scatter`
- Use the user's requested chart type when they specify it.
- If the user asked for a generic chart and no product-specific convention exists, `bar` is a safe default because it appears in fixtures and product code.
- Keep `data` close to the user's source numbers instead of transforming it unnecessarily.
