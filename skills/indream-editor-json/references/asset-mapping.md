# Asset Mapping

Use `indream_assets_upload` when the user provides a local file path or a remote media URL.
Use `indream_projects_list_assets` when the user already has assets attached to an Indream project.

## Recommended ID strategy

The most reliable pattern is to reuse the uploaded `editorAssetMapping.assetId` as:

- the key under `assets`
- the nested `assets[*].id`
- the item-level `assetId`

That avoids accidental mismatches.

## Upload result fields that matter for editor JSON

The upload tool returns:

- `assetId`
- `type`
- `filename`
- `mimetype`
- `fileUrl`
- `fileKey`
- `width`
- `height`
- `duration`
- `editorAssetMapping.assetId`
- `editorAssetMapping.remoteUrl`
- `editorAssetMapping.remoteKey`

## Standard mapping pattern

```json
{
  "assets": {
    "asset_test": {
      "id": "asset_test",
      "type": "image",
      "filename": "hero.png",
      "size": 1024,
      "remoteUrl": "https://cdn.example.com/uploads/hero.png",
      "remoteKey": "uploads/hero.png",
      "mimeType": "image/png",
      "width": 1280,
      "height": 720
    }
  },
  "items": {
    "item-image-hero": {
      "id": "item-image-hero",
      "type": "image",
      "assetId": "asset_test"
    }
  }
}
```

## Asset catalog

### Image asset

Required shape:

- `type: "image"`
- `id`
- `filename`
- `size`
- `mimeType`
- `width`
- `height`
- `remoteUrl` and `remoteKey` are usually present for uploaded media

### Video asset

Required shape:

- `type: "video"`
- `durationInSeconds`
- `hasAudioTrack`
- `width`
- `height`

### GIF asset

Required shape:

- `type: "gif"`
- `durationInSeconds`
- `width`
- `height`
- `loopBehavior: "finite" | "loop"`

### Audio asset

Required shape:

- `type: "audio"`
- `durationInSeconds`

### Caption asset

Required shape:

- `type: "caption"`
- `timingGranularity: "word" | "line"`
- `captions`

Notes:

- Caption records are intentionally flexible in the schema.
- Preserve caption entries from the source whenever possible instead of rewriting them.
- Caption assets may have `remoteUrl` and `remoteKey` set to `null`.

Line-timed caption asset:

- each `captions[]` entry is usually one subtitle line or cue
- preserve `text`, `startMs`, and `endMs`

Word-timed caption asset:

- `captions[]` must be a flat per-word or per-token list
- preserve `text`, `startMs`, and `endMs` for every word or token
- preserve optional `timestampMs` and `confidence` when the source provides them
- do not embed grouped `cues` objects inside the editor asset
- if the source JSON arrives as `cues[].words[]`, flatten those word entries into `assets[*].captions[]` when building editor JSON

### Lottie asset

Required shape:

- `type: "lottie"`
- `durationInSeconds`
- `width`
- `height`
- `resourceType: "lottie" | "svg"`

Common optional fields:

- `resourceJson`
- `resourceComponentId`
- `materialConfig`

## Item-to-asset relationships

- `image` items require an `image` asset.
- `video` items require a `video` asset.
- `gif` items require a `gif` asset.
- `lottie` items require a `lottie` asset.
- `audio` items require an `audio` asset.
- `captions` items require a `caption` asset.
- `text`, `text-template`, `solid`, `illustration`, `effect`, `filter`, and `chart` items do not require assets unless a template node or design workflow explicitly depends on them.

## Practical rules

- When in doubt, keep asset map keys equal to the actual asset ID returned by the upload tool.
- Do not reference a project asset unless it is actually present in `assets`.
- Do not guess missing `width`, `height`, or `durationInSeconds`. Use the upload or project asset payload.
- If a request depends on subtitles, prefer a real `caption` asset plus a `captions` item instead of simulating subtitles with dozens of manually timed text items.
