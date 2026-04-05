# Motion, Effects, Filters, and Transitions

## Clip animations

Many visual items can use clip-level `animations` with `in` and `out` keys.

Supported animation types:

- `fade`
- `slide-up`
- `slide-down`
- `slide-left`
- `slide-right`
- `zoom-in`
- `zoom-out`

Animation shape:

```json
{
  "type": "fade",
  "durationTicks": 24,
  "easing": "ease-in-out"
}
```

Supported easing values:

- `linear`
- `ease-in`
- `ease-out`
- `ease-in-out`

Use clip animations for:

- scene entrance or exit
- lower-third fly-ins
- logo pop-ins
- image or product zooms

## Keyframed motion

Use animated number tracks when the user needs motion that clip animations cannot express cleanly, such as:

- moving an item across the screen
- scaling over time
- opacity ramps
- subtle rotation

Example:

```json
{
  "left": {
    "value": 120,
    "keyframes": [
      { "timeTicks": 0, "value": -160 },
      { "timeTicks": 24, "value": 120 }
    ]
  }
}
```

Practical rules:

- Keep keyframe times within the item's duration window.
- Use a small number of keyframes unless the motion genuinely needs more.
- Prefer clip animations for simple in or out motion, and keyframes for custom paths or multi-stage motion.

## Caption animations

`text` and `captions` items support `captionAnimations` with `in`, `out`, and `loop`.

Supported animation names:

- `converge`
- `elastic-pop`
- `typewriter`
- `lay-down`
- `center-type-out`
- `curtain-close`
- `jitter`
- `rainbow`
- `sweep-shine`

Suggested usage:

- `in` for entry emphasis
- `loop` for ongoing energy on short social clips
- `out` for final subtitle departure
- For `captions` items, use one short `in` animation as the production-safe default, then add `loop` or `out` only after a real export probe.

Avoid long looping animations on dense subtitle tracks unless the user explicitly wants a high-energy style.

## Effects

Effect items are time-ranged overlays.

Supported schema effect types:

- `flash-to-black`
- `blur`
- `blurred-opening`
- `fade-in`
- `fade-out`

Use effects for:

- opening blur reveals
- emphasis moments
- flash punctuation
- brief visual bridges between scenes

## Filters

Filter items are time-ranged look treatments.

Supported schema filter types:

- `verdant-glow`
- `cyberpunk-neon`
- `vaporwave-blue`
- `sunset-orange`
- `lemon-cyan`
- `absolute-red`
- `sakura-pink`
- `twilight-dusk`

Use filters for:

- full-scene color treatment
- short stylized moments
- look changes that should not affect the whole timeline

`params.blend` is a common example for partial application, but only use additional params that the product actually supports.

## Transitions

Transitions connect two adjacent clips on the same track.

Required fields:

- `id`
- `trackId`
- `fromClipId`
- `toClipId`
- `type`
- `durationTicks`

Supported transition types:

- `fade`
- `slide`
- `wipe`
- `flip`
- `clock-wipe`
- `iris`

Useful live parameter patterns:

- `slide` with `params.direction`:
  - `from-left`
  - `from-right`
  - `from-top`
  - `from-bottom`
- `wipe` with `params.direction`:
  - `from-left`
  - `from-top-left`
  - `from-top`
  - `from-top-right`
  - `from-right`
  - `from-bottom-right`
  - `from-bottom`
  - `from-bottom-left`
- `flip` with `params.direction`:
  - `from-left`
  - `from-right`
  - `from-top`
  - `from-bottom`

Common optional fields:

- `easing`
- `params`

Transition rules:

- only use transitions between neighboring clips in one `track.items[]`
- do not span clips on different tracks
- do not use transitions as a replacement for effect items
- do not add transitions when the edit is a hard cut unless the user asked for a transition

## Motion design guidelines

### Conservative commercial style

Use:

- one transition family
- light fade or slide-in clip animations
- no more than one persistent filter style
- limited caption animation

### Flashy social short

Use:

- stronger caption animation
- punchy transition choices
- selective filters on highlight moments
- fast but readable motion on text and stickers

### Tutorial or explainer

Use:

- minimal transitions
- consistent lower-third motion
- stable subtitles
- clear chart or annotation animation

## Live defaults worth reusing

Real capability responses currently expose useful defaults that are safe to mirror:

- `blurred-opening` effect often uses `params.maxBlurPx: 24`
- `flash-to-black` effect may use:
  - `brightFrames`
  - `darkFrames`
  - `maxOpacity`
  - `tailDarkFrames`
- filters commonly expose a `blend` value in `params`

Use these only when they match the user's intent.
Do not add extra params blindly when a simpler default gets the job done.
