# Gate Reference

Each gate must be explicitly passed with `indream_video_workflow_gate_advance`.

| Gate | Prerequisites | Artifact product | Blocking checks |
|---|---|---|---|
| capture | none | Asset records + analysis cache | — |
| design | — | DESIGN.md | Must call `set-design` first |
| script | design passed | SCRIPT.md | Must call `set-script` first |
| storyboard | script passed | storyboard.json + STORYBOARD.md | Must call `set-storyboard` first |
| build | storyboard passed, no unresolved required bindings | scenes/*.sparse.json | All scenes must be submitted |
| static | build passed, all scenes submitted | animation-map.json, expanded editor-state.json | Review must return status=ok (blockingCount=0) |
| snapshot | static passed | snapshots/ (when API available) | blockingCount must be 0 |
| commit | static passed (snapshot optional) | compiled artifact, project binding | blockingCount must be 0 |

## Gate advancement flow

```
init → capture → design → script → storyboard → build → static → [snapshot] → commit
```

Skipping snapshot is allowed — advance directly from static to commit.

Ops that change design reset `design` and all downstream gates.
Ops that change script reset `script` and all downstream gates.
Ops that change storyboard reset `storyboard` and all downstream gates.
Ops that change layout/geometry reset `static`, `snapshot`, `commit` only.
