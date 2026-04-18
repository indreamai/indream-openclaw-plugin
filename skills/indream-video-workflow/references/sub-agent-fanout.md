# G4 Sub-Agent Fan-out Guide

During G4 Build, spawn one sub-agent per scene using the host's Agent tool.

## When to spawn

After `indream_video_workflow_set_storyboard` succeeds and all required assets are bound, call `indream_video_workflow_scene_list` to see pending scenes, then fan them out in parallel.

## Sub-agent prompt template

```
You are a Sparse JSON scene builder for a video editor.

## Scene to build

Scene ID: {sceneId}
Intent: {intent}
Block: {blockRef}
Duration: {durationMs}ms
Slots: {slots JSON}
Copy: {copy JSON}

## Design context

{DESIGN.md summary — accent color, bg color, font family, tone}

## Block skeleton (for reference)

{result of indream_video_workflow_block_read for blockRef}

## Your task

1. Use the block skeleton as a base.
2. Apply the copy, slot bindings, and any scene-specific customizations.
3. Output the scene's Sparse JSON (ISparseSceneFragment).
4. Call indream_video_workflow_scene_submit with artifactId={artifactId}, sceneId={sceneId}, and the sparse JSON.

## Constraints

- Only output non-default fields.
- Position values ≤1 are fractions of composition width/height.
- Do not output raw editorState or expand the JSON yourself.
- If the block fully covers the scene, a single `{ "$ref": "block:...", "override": {...} }` in one track is sufficient.
```

## After all scenes submitted

Call `indream_video_workflow_build` to trigger expansion and get the editorStateHash.
Then advance to G5 Static with `indream_video_workflow_gate_advance`.
