---
name: indream-editor-json
description: Plan, build, validate, and repair production-ready Indream editor JSON with complete guidance for media, subtitles, motion, transitions, effects, filters, templates, charts, and schema troubleshooting.
metadata:
  {
    "openclaw":
      {
        "emoji": "🎬",
        "requires":
          {
            "config": ["plugins.entries.indream.config.apiKey"],
          },
      },
  }
---

# Indream Editor JSON

Use this skill when the user wants to create, repair, explain, or optimize Indream editor JSON.

## Goal

Produce editor JSON that is valid for the current Indream schema and capability set, matches the user's creative intent, and is ready for validation and export without guesswork.

## Mandatory workflow

1. Identify the requested deliverable before writing JSON:
   - composition size or output ratio
   - target duration and scene structure
   - available assets, captions, templates, existing draft metadata, and export goals
2. Call `indream_editor_capabilities` before choosing any capability-bound value:
   - transition types
   - effect types
   - filter types
   - illustration names
   - caption animation types
   - any capability-controlled value that may vary by runtime
3. Start from `references/minimal-editor-state.json`, then build in this order:
   - top-level composition fields
   - `assets`
   - `items`
   - `tracks`
   - `transitions`
   - optional `globalBackground` and `deletedAssets`
4. Prefer the structured references in this skill over inventing field names or relying on memory.
5. Run `indream_editor_validate` before any export or project sync step that should persist the new draft.
6. If validation fails, repair the JSON with `references/validation-repair.md`, then validate again.
7. If the validator output is ambiguous or a path is hard to interpret, inspect `references/editor-state.v1.schema.json` directly.

## Planning checklist

- Decide whether the timeline is:
  - single-track sequential
  - multi-track layered
  - subtitle-heavy
  - template-driven
  - motion-driven with animated geometry
- Decide whether the user wants:
  - raster media only
  - video plus music or voice-over
  - subtitles from a caption asset
  - animated text instead of a subtitle asset
  - timed effects or filters
  - clip transitions between adjacent scenes
- Decide whether `text-template` is actually appropriate.
  Use `text-template` only when the required `templateId`, `templateCategory`, and node structure are known.
  Otherwise prefer plain `text`, `image`, `solid`, `illustration`, or `chart` items.
- If the input comes from an existing draft, preserve unrelated valid top-level metadata instead of dropping it casually.

## Authoring rules

- Keep the top-level required keys stable:
  - `compositionWidth`
  - `compositionHeight`
  - `timebaseTicksPerSecond`
  - `tracks`
  - `assets`
  - `items`
  - `transitions`
- `timebaseTicksPerSecond` must always be `240000`.
- Keep IDs stable and readable. Reuse the same IDs across updates instead of regenerating them on every revision.
- Every `track.items[]` entry must exist in `items`.
- Within one track, items may touch edge-to-edge, but they must never overlap in time.
- Every item `assetId` must exist in `assets`.
- Use the upload result from `indream_assets_upload` directly when possible. The simplest stable pattern is to reuse `editorAssetMapping.assetId` as the editor asset key and as the item `assetId`.
- Track order is visual stacking order. Earlier tracks render above later tracks, so do not place a fully opaque upper-track item over content that still needs to remain visible.
- All geometry-like number fields must use the animated number track shape:
  - `{ "value": number, "keyframes": [] }` for static values
  - `{ "value": number, "keyframes": [{ "timeTicks": n, "value": number }] }` for animated values
- Do not omit geometry fields from asset-backed items just because they are audio-like or auxiliary. The schema still requires the base item geometry fields.
- Use `outputRatio` when it helps express user intent, especially when the user asks for a standard aspect ratio such as `16:9` or `9:16`.
- Preserve optional existing fields that are already valid unless the user asks to remove them.
- Do not invent unsupported `effectType`, `filterType`, `transition.type`, `illustrationName`, or caption animation names.
- Do not invent unknown template node contracts. If a template-driven request lacks a real template contract, say so and fall back to regular items.
- Prefer practical static defaults over speculative animation. Only add motion, transitions, or subtitle effects that the user asked for or that are clearly implied.
- Treat transitions as seam motion between adjacent clips on the same track. If a seam already uses a transition, do not also add a redundant entry animation for that same moment unless the user explicitly asks for layered motion.

## Feature coverage

- Timeline structure, ID strategy, composition sizing, static vs animated number tracks:
  - `references/structure-and-principles.md`
- Upload mapping, asset catalog, asset-specific required metadata:
  - `references/asset-mapping.md`
- Material libraries, hand-drawn vector illustrations, and sticker compatibility notes:
  - `references/material-libraries.md`
- Core item catalog for `image`, `video`, `gif`, `lottie`, `audio`, `solid`, `illustration`, `effect`, `filter`, and `chart`:
  - `references/common-items.md`
- Text overlays, subtitle assets, `captions`, `text-template`, and subtitle animation strategy:
  - `references/text-and-captions.md`
- Clip animations, keyframes, transitions, effects, filters, and motion design patterns:
  - `references/motion-effects-and-transitions.md`
- How to add one keyframe to a single property without rewriting the whole item:
  - `references/keyframes.md`
- Practical composition recipes for common user requests:
  - `references/recipes.md`
- Full scene templates and composition blueprints:
  - `references/template-catalog.md`
  - `references/templates/`
- Validation and repair workflow:
  - `references/validation-repair.md`
- Minimal valid starting point:
  - `references/minimal-editor-state.json`
- Full fallback schema for edge-case troubleshooting:
  - `references/editor-state.v1.schema.json`

## Repair loop

1. If `indream_editor_validate` returns `valid: false`, fix the reported `errors[]` one by one.
2. Prefer the server error path and code over assumptions.
3. When an enum value is invalid, replace it with a capability-supported value instead of deleting unrelated fields.
4. When a transition is invalid, check all of the following before changing the type:
   - both clips exist
   - both clips are on the same track
   - `fromClipId` and `toClipId` are adjacent in `track.items[]`
   - the transition `type` is supported
5. When an asset-backed item fails, inspect both the item shape and the referenced asset shape.
6. When the validator path is not enough, search the full fallback schema for the matching definition name or property path.
7. Do not create export tasks until validation returns `valid: true`.

## Missing information rules

- Ask for clarification when the user requests a specific template, illustration, supported effect or transition value, or subtitle source that cannot be inferred from the available data.
- If the user wants a complete draft quickly and a capability-bound value is missing, choose the nearest capability-supported value and state that choice explicitly.
- If the request conflicts with the schema, prioritize a valid JSON result and explain the compromise.

## Reference files

- `references/structure-and-principles.md`
- `references/minimal-editor-state.json`
- `references/asset-mapping.md`
- `references/material-libraries.md`
- `references/common-items.md`
- `references/text-and-captions.md`
- `references/motion-effects-and-transitions.md`
- `references/keyframes.md`
- `references/recipes.md`
- `references/template-catalog.md`
- `references/templates/`
- `references/validation-repair.md`
- `references/editor-state.v1.schema.json`
