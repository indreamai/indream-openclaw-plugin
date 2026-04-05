# Practical Recipes

Use these as planning patterns, not as rigid templates.

## Recipe: sequential slideshow with transitions

Use when the user wants:

- multiple still images
- one after another
- gentle scene changes

Recommended structure:

- one visual track with back-to-back image or solid items
- transitions between each adjacent pair
- optional text overlay track for titles

Recommended motion:

- subtle `fade` or `zoom-in` clip animation
- `fade` transition unless the user wants a stronger effect

## Recipe: talking-head short with subtitles

Use when the user wants:

- primary video
- styled subtitles
- optional title and CTA overlays

Recommended structure:

- one track for the main `video` item
- one track for a `captions` item
- optional overlay track for title card or end card
- optional `audio` item for background music

Recommended motion:

- minimal clip animation on the main video
- one readable subtitle style
- optional `captionAnimations.in` for energy

## Recipe: product promo with layered visuals

Use when the user wants:

- a hero image or video
- decorative shapes
- motion callouts
- logo or feature badges

Recommended structure:

- main media track
- one overlay track for `solid` and `illustration` items
- one overlay track for `text` items
- optional filter or effect items for emphasis windows

Recommended motion:

- slide or zoom clip animations on text and badges
- keyframed movement for callout entrances
- transitions only between major scene changes

## Recipe: text-only kinetic promo

Use when the user wants:

- no footage
- bold text-driven storytelling
- heavy subtitle-like motion

Recommended structure:

- `solid` background item or `globalBackground`
- multiple `text` items on one or more tracks
- optional `illustration` or `chart` items

Recommended motion:

- `captionAnimations` on headline text
- keyframed position and opacity for custom pacing
- occasional effect windows for emphasis

## Recipe: clean data slide

Use when the user wants:

- business metrics
- clean title and body copy
- consistent visual colors

Recommended structure:

- background `solid` or `globalBackground`
- one `chart` item
- one or more `text` items
- optional `illustration` item

Recommended motion:

- modest clip animation on chart and title
- avoid flashy caption animation unless the visual tone allows it

## Recipe: template-driven cover

Use when the user wants:

- a known reusable template
- exact template-driven nodes

Recommended structure:

- one `text-template` item with validated `nodes`
- optional supporting tracks for extra text or stickers if the product supports them

Important:

- only use this recipe when the template contract is known
- otherwise fall back to standard `text`, `image`, and `solid` items
