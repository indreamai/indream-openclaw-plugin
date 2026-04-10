# Scene Template Catalog

These templates are meant to be copied, adapted, and validated.
They cover common user requests while demonstrating real editor-state patterns.

## Template list

1. `templates/hello-world.json`
   Minimal hello world scene with a single centered text layer on a background.

2. `templates/gallery-carousel.json`
   Image-only gallery carousel with clip-to-clip transitions and no extra overlay layers.

3. `templates/product-intro.json`
   Product hero scene with image media, geometric shapes, illustration support art, and an opening effect.

4. `templates/subtitle-promo.json`
   Vertical subtitle promo with one video clip and auto-generated subtitle tracks from the source audio.

5. `templates/chart-showcase.json`
   Data-driven showcase with multiple chart types, transitions, supporting copy, and timed look changes.

6. `templates/illustration-board.json`
   Hand-drawn vector collage scene built from the live illustration library and geometric decorations.

## How to use the catalog

1. Pick the closest template for the user's request.
2. Replace assets, copy, colors, and timing.
3. Keep the required field shapes intact.
4. Validate the edited state.
5. If validation fails, repair the smallest possible part of the JSON.

## Selection guidance

- Use `hello-world` for the absolute minimum valid hello world export.
- Use `gallery-carousel` for image-only slideshows that just need sequencing and transitions.
- Use `product-intro` for launch, e-commerce, and feature callouts.
- Use `subtitle-promo` for simple video-plus-auto-subtitle edits.
- Use `chart-showcase` for analytics, dashboard, and business storytelling.
- Use `illustration-board` for hand-drawn vector compositions.
