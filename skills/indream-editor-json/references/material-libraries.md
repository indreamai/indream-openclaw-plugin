# Material Libraries and Sticker Compatibility

## Hand-drawn vector material library

The safest Open API representation for the hand-drawn vector material library is the `illustration` item.

Use it when the user wants:

- playful SVG-like artwork
- decorative vector accents
- product-friendly hand-drawn scenes
- explainer or infographic support art

Required fields:

- `type: "illustration"`
- `illustrationName`
- `color`
- `keepAspectRatio`
- `rotation`
- full base geometry fields

Always choose `illustrationName` from `indream_editor_capabilities`.

## Useful illustration categories

The live illustration library is large.
Use a small curated subset unless the user explicitly asks for a specific name.

Good examples from the live capability set:

- Greeting and welcome:
  - `IHello`
  - `IWelcome`
  - `IWelcomeAboard`
- Product and launch:
  - `IProductDemo`
  - `IProductExplainer`
  - `ILaunchDay`
  - `ILaunchEvent`
- Charts and analytics:
  - `ICharts`
  - `IGrowthChart`
  - `IDataAnalysis`
  - `IAnalytics`
- Content and media:
  - `IContentCreator`
  - `IVideoTutorial`
  - `IOnlineVideo`

## Sticker support in the current Open API

Sticker support exists, but it is not fully symmetrical across the editor runtime and the open API schema.

Current compatibility facts:

- the current open API schema exposes `stickerId` and `stickerVersion` on `image` items
- the editor runtime also carries sticker metadata on `lottie` items in some internal flows
- the current open API capabilities payload does not expose a sticker catalog or importable sticker definitions

That means you should not invent sticker identifiers.

## Safe sticker authoring rules

Only add `stickerId` and `stickerVersion` when one of these is true:

- the values come from an existing editor draft
- the values come from an internal sticker import flow
- the user explicitly supplied known-good sticker metadata

If none of that is available, use one of these safe fallbacks instead:

- a normal `image` item for a static sticker-like badge
- a `lottie` item for an animated badge
- an `illustration` item for a curated vector decoration

## Open API-safe fallback patterns

### Static sticker-like badge

Use an `image` item backed by a transparent PNG asset.
Do not attach fake sticker metadata.

### Animated sticker-like badge

Use a `lottie` item backed by a real lottie asset.
Do not attach sticker metadata unless it came from a trusted source.

### Library illustration

Use an `illustration` item when the user wants decorative hand-drawn art and no specific sticker catalog entry is required.

## Practical guidance for the skill

- Prefer `illustration` for reusable hand-drawn vector art.
- Prefer uploaded image overlays for portable sticker-like decorations.
- Treat real sticker metadata as compatibility-sensitive and source-dependent.
