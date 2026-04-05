# Scene Template Catalog

These templates are meant to be copied, adapted, and validated.
They cover common user requests while demonstrating real editor-state patterns.

## Template list

1. `templates/hello-world.json`
   Minimal greeting scene with a solid background, centered text, clip animation, and caption animation.

2. `templates/gallery-carousel.json`
   Three-image carousel with transitions, overlay copy, and a timed filter window.

3. `templates/product-intro.json`
   Product hero scene with image media, geometric shapes, illustration support art, and an opening effect.

4. `templates/subtitle-promo.json`
   Vertical promo scene with a caption asset, styled subtitles, title copy, and subtitle animation.

5. `templates/chart-showcase.json`
   Data-driven showcase with multiple chart types, transitions, supporting copy, and timed look changes.

6. `templates/illustration-board.json`
   Hand-drawn vector collage scene built from the live illustration library and geometric decorations.

7. `templates/keyframe-motion-lab.json`
   Motion-focused scene that demonstrates single-keyframe entry motion, scale changes, opacity ramps, and timed effects.

## How to use the catalog

1. Pick the closest template for the user's request.
2. Replace assets, copy, colors, and timing.
3. Keep the required field shapes intact.
4. Validate the edited state.
5. If validation fails, repair the smallest possible part of the JSON.

## Selection guidance

- Use `hello-world` for the absolute minimum valid scene.
- Use `gallery-carousel` for album-style slideshows and travel reels.
- Use `product-intro` for launch, e-commerce, and feature callouts.
- Use `subtitle-promo` for short-form caption-heavy edits.
- Use `chart-showcase` for analytics, dashboard, and business storytelling.
- Use `illustration-board` for hand-drawn vector compositions.
- Use `keyframe-motion-lab` when the user wants custom motion beyond standard clip animations.
