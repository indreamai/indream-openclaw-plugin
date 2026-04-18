---
name: indream-video-workflow
description: Create, revise, review, approve, commit, and explicitly export Indream video workflows using the 8-Gate v6 system.
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

# Indream Video Workflow (v6)

Use this skill to produce reviewable, gate-tracked video workflow artifacts.

## Workflow — 8 Gates

1. **G0 Capture** — Upload assets via `indream_assets_upload`. Inspect returned `analysis` (dominantColors, bgLuminance, textSafeZones). Note any null fields for API-pending data.
2. **G1 Design** — Call `indream_video_workflow_set_design` with a color palette, typography, and tone brief. **Hard gate** — no later work proceeds without this.
3. **G2 Script** — Call `indream_video_workflow_set_script` with full narration / copy.
4. **G3 Storyboard** — Call `indream_video_workflow_set_storyboard` with a compact per-scene array. Each scene: `sceneId`, `intent`, `blockRef`, `durationMs`, `slots`, `copy`.
5. **G4 Build** — For each scene, spawn a sub-agent (via host Agent tool) with the scene's storyboard row + DESIGN.md summary + the block skeleton from `indream_video_workflow_block_read`. Sub-agent outputs Sparse JSON via `indream_video_workflow_scene_submit`.
6. **G5 Static** — Call `indream_video_workflow_review`. Fix errors via `indream_video_workflow_revise` semantic ops. Advance with `indream_video_workflow_gate_advance`.
7. **G6 Snapshot** — Call `indream_video_workflow_snapshot`. Returns `pending-api` until backend is ready — skip to G7 if not available.
8. **G7 Commit** — Call `indream_video_workflow_commit`, then `indream_video_projects_create` or `indream_video_projects_sync`, then `indream_video_exports_create`.

## Rules

- Keep conversation on workflow artifacts, scene summaries, diagnostics, and semantic ops.
- Never send raw `editorState` or full scene arrays back into the workflow.
- Use `indream_assets_upload` and `indream_assets_get` for asset binding inputs. Check `analysis` on the returned record before binding.
- Use `indream_illustrations_search` only when you need a precise illustration name.
- Before fixing a review diagnostic, read `fixStrategy` and `suggestedOps` first.
- Only export after explicit user request.

## References

- [gates.md](references/gates.md) — Gate prerequisites and artifact products
- [block-library.md](references/block-library.md) — Available blocks and selection guidance
- [sparse-json-guide.md](references/sparse-json-guide.md) — Sparse JSON syntax and keyframe shortcuts
- [sub-agent-fanout.md](references/sub-agent-fanout.md) — G4 sub-agent prompt template
- [asset-analysis.md](references/asset-analysis.md) — IAssetAnalysis fields and decision guide
- [animation-map.md](references/animation-map.md) — Animation map diagnostic fields
- [semantic-ops.md](references/semantic-ops.md) — Full op reference with examples
