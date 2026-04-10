# Structure and Principles

## Mental model

Indream editor JSON is easiest to author when you treat it as five linked layers:

1. `assets`
   Source media and source subtitle data.
2. `items`
   Timeline instances that place assets, text, shapes, effects, filters, and charts in time.
3. `tracks`
   Ordered clip lists that define which items belong together on one timeline lane.
4. `transitions`
   Same-track joins between adjacent clips.
5. Optional top-level extras
   `outputRatio`, `globalBackground`, `deletedAssets`, and any valid metadata already present in an existing draft.

## Required top-level fields

- `compositionWidth`
- `compositionHeight`
- `timebaseTicksPerSecond`
- `tracks`
- `assets`
- `items`
- `transitions`

`timebaseTicksPerSecond` must always be `240000`.

## Composition sizing

Rules from the schema:

- `compositionWidth`: integer from `50` to `1920`
- `compositionHeight`: integer from `50` to `1920`
- `outputRatio`: optional, one of `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `custom`

Practical authoring guidance:

- Use concrete width and height first.
- Add `outputRatio` when the user asked for a standard aspect ratio or when it improves readability.
- If the user says "vertical short video", `1080 x 1920` with `outputRatio: "9:16"` is a clear default.
- If the user says "YouTube landscape", `1920 x 1080` with `outputRatio: "16:9"` is a clear default.

## Build order

Write editor JSON in this order:

1. lock composition width, height, ratio, and high-level scene count
2. create or map all assets
3. create each item with full required fields
4. place item IDs into tracks
5. add transitions only after track order is stable
6. add optional global background and preserve existing valid metadata only when needed
7. validate

## Stable ID strategy

Prefer readable and stable IDs such as:

- `track-main`
- `track-captions`
- `asset-hero-video`
- `item-hero-video`
- `item-lower-third`
- `transition-scene-1-2`

Do not rename valid IDs during repair unless the failure is caused by an ID mismatch.

## Static and animated number tracks

Many numeric item properties are not raw numbers.
They must use the animated number track shape:

```json
{
  "value": 1,
  "keyframes": []
}
```

Use static tracks by default.
Add keyframes only when the user actually wants motion such as:

- slide-in or slide-out movement
- zooms
- fades driven by `opacity`
- rotating badges or callouts

Example:

```json
{
  "opacity": {
    "value": 1,
    "keyframes": [
      { "timeTicks": 0, "value": 0 },
      { "timeTicks": 24, "value": 1 }
    ]
  }
}
```

## Track timing and stacking

Same-track items may touch edge-to-edge, but they must never overlap in time.
If two visuals need to be visible at once, put them on different tracks instead of forcing overlap inside one track.

Track order also controls front-to-back stacking.
Earlier tracks render above later tracks.
Place opaque backgrounds, long-running fills, or full-screen media on lower tracks so they do not hide overlays that still need to be seen.

## Track planning patterns

### Sequential slideshow

Use one primary track when the timeline is a simple sequence of back-to-back scenes.
This is the easiest place to add transitions.

### Layered promo

Use separate logical tracks when the timeline has:

- a primary footage layer
- a text or subtitle overlay layer
- decorative shapes or stickers
- music or narration

### Subtitle-driven video

Use:

- one primary video track
- one captions track with a `captions` item
- optional overlay text track for title cards and callouts

## Transition rules

Transitions belong in `transitions`, not in `items`.
Each transition must:

- reference one `trackId`
- use `fromClipId` and `toClipId` that are adjacent in that track
- connect clips that touch edge-to-edge in time
- use a supported transition type
- act as the seam motion for that cut rather than as a general motion layer

Do not create transitions across different tracks.
Do not pair a transition with a redundant incoming clip entry animation at the same seam unless the user explicitly wants both.

## Optional top-level sections

### `globalBackground`

Use when the entire composition needs a background treatment.
Supported stable forms:

- `none`
- `color`: requires `color`; `gradient` may be `null`
- `blur`: requires `level`
- `image`: requires `imageUrl` and `source`; `imageAssetId` may be `null`

### `brandRuntime`

This field can appear in existing drafts.
If present, keep the stable object shape:

- `brandId`
- `logoX`
- `logoY`
- `managedItemIds`
- `managedAssetIds`
- `introShiftInFrames`
- `overlayTrackId`
- `underlayTrackId`

Preserve it if it is already present and valid, but do not treat it as a new authoring surface for this Open API skill.

### `deletedAssets`

Usually preserve this from an existing draft.
Each entry should use:

- `assetId`
- `remoteUrl`
- `remoteKey`
- `statusAtDeletion`, where `type` is the stable discriminator and `error` is only needed for failure states

Do not populate it during a fresh authoring pass unless you are deliberately editing asset deletion state.
