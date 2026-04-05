# Validation and Repair Guide

## Repair priorities

1. Preserve the user's intent.
2. Change the minimum number of fields needed to satisfy validation.
3. Prefer supported replacements over deleting creative features.
4. Validate again after each meaningful repair pass.
5. Do not export until validation returns `valid: true`.

## Common failures

### Unsupported effect value

Symptoms:

- `EDITOR_EFFECT_TYPE_INVALID`
- validation path points at `items.*.effectType`

Fix:

- call `indream_editor_capabilities`
- replace the invalid value with a supported effect type
- preserve the original timing window unless the user asked to remove the effect

### Unsupported filter value

Symptoms:

- `EDITOR_FILTER_TYPE_INVALID`
- validation path points at `items.*.filterType`

Fix:

- call `indream_editor_capabilities`
- replace the invalid value with a supported filter type
- preserve `intensity` and any valid `params`

### Unsupported transition

Symptoms:

- `EDITOR_TRANSITION_TYPE_INVALID`
- validation path points at `transitions.*.type`

Fix:

- replace the transition type with a capability-supported value
- keep `fromClipId`, `toClipId`, and `durationTicks` if they are otherwise valid

### Transition clips are not adjacent

Symptoms:

- `EDITOR_TRANSITION_CLIP_NOT_ADJACENT`
- the transition references clips that exist but skip over another clip

Fix:

- ensure `fromClipId` and `toClipId` are neighbors in the same `track.items[]`
- if the clips are intentionally separate scenes, move the transition to the actual neighboring pair or remove it

### Missing asset

Symptoms:

- validation path points to `assetId`
- item references an asset key that does not exist

Fix:

- ensure the referenced asset key exists under `assets`
- ensure the nested `assets[*].id` matches that key
- ensure the asset type matches the item type

### Missing required geometry or playback fields

Symptoms:

- validator points at `top`, `left`, `width`, `height`, `scaleX`, `scaleY`, `opacity`, `rotation`, `playbackRate`, or fade fields

Fix:

- restore the missing required properties with a valid static animated-number-track or scalar value
- remember that audio items still require the base geometry fields

### Invalid text or subtitle style object

Symptoms:

- validator points at `fontStyle`, `background`, `captionAnimations`, or alignment fields

Fix:

- ensure `fontStyle` contains both `variant` and `weight`
- ensure `align` is one of `left`, `center`, `right`
- ensure `direction` is `ltr` or `rtl`
- ensure background objects include `color`, `horizontalPadding`, and `borderRadius`
- ensure caption animation names are supported

### Template item mismatch

Symptoms:

- validator points at `schemaVersion`, `templateId`, `templateCategory`, or `nodes`

Fix:

- confirm `schemaVersion` is exactly `2`
- ensure `nodes` has at least two entries
- ensure each node has a `type`
- if the real template contract is unknown, replace the `text-template` item with standard `text` and `image` items

## Schema troubleshooting workflow

When the validator output is not enough:

1. Open `references/editor-state.v1.schema.json`.
2. Search for the item or asset definition that matches the failing path, such as:
   - `imageItem`
   - `videoItem`
   - `captionsItem`
   - `transition`
   - `globalBackground`
3. Confirm the required fields and enum values.
4. Compare the failing payload against a known-good pattern in the other references.
5. Re-run `indream_editor_validate`.

## Safe repair habits

- Keep IDs stable while repairing.
- Do not regenerate the entire JSON when only one field is invalid.
- Preserve timing and track order unless the failure is caused by timing or adjacency.
- Preserve optional design choices such as crop, border radius, subtitle styling, and animation when they are already valid.
