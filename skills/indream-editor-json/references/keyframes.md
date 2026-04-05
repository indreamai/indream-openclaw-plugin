# Adding Keyframes

## Mental model

Animated number tracks always use:

```json
{
  "value": 120,
  "keyframes": []
}
```

- `value` is the base value the item rests on
- `keyframes` inject time-based overrides

## Single-keyframe rule of thumb

If the item should end at one stable value but begin from another value, a single keyframe is often enough.

Example:

```json
{
  "left": {
    "value": 120,
    "keyframes": [
      { "timeTicks": 0, "value": -220 }
    ]
  }
}
```

Interpretation:

- at the start of the clip, the item begins off-screen at `-220`
- it settles to the base `value` of `120`

This is the cleanest way to add one entrance keyframe without redesigning the whole item.

## Common single-keyframe patterns

### One entrance move

```json
{
  "top": {
    "value": 280,
    "keyframes": [
      { "timeTicks": 0, "value": 360 }
    ]
  }
}
```

### One entrance scale pop

```json
{
  "scaleX": {
    "value": 1,
    "keyframes": [
      { "timeTicks": 0, "value": 0.7 }
    ]
  },
  "scaleY": {
    "value": 1,
    "keyframes": [
      { "timeTicks": 0, "value": 0.7 }
    ]
  }
}
```

### One fade-out target

```json
{
  "opacity": {
    "value": 0,
    "keyframes": [
      { "timeTicks": 0, "value": 1 }
    ]
  }
}
```

## When to use two or more keyframes instead

Use more than one keyframe when the item needs:

- a hold before movement starts
- multiple motion phases
- a bounce or overshoot
- a mid-clip change instead of a simple start-to-rest interpolation

## Keyframe authoring rules

- keep `timeTicks` inside the item duration
- add keyframes to only the properties that need motion
- prefer one property change at a time when debugging
- if the motion is just a simple entry or exit, compare whether a clip animation would be cleaner than custom keyframes
