---
name: indream-render-workflow
description: Run the complete Indream project, upload, validate, export, and wait workflow from OpenClaw.
metadata:
  {
    "openclaw":
      {
        "emoji": "☁️",
        "requires":
          {
            "config": ["plugins.entries.indream.config.apiKey"],
          },
      },
  }
---

# Indream Render Workflow

Use this skill when the user wants a full render pipeline, not just raw editor JSON.

## Workflow

1. If the user starts from scratch, create a project with `indream_projects_create`.
2. Upload media with `indream_assets_upload`.
3. Write upload mapping into editor JSON:
   - `fileUrl` -> `remoteUrl`
   - `fileKey` -> `remoteKey`
4. Persist autosave state with `indream_projects_sync` when the project should own the latest draft.
5. Run `indream_editor_validate`.
6. Export:
   - use `indream_projects_create_export` for project-based exports
   - use `indream_exports_create` for stateless one-off exports
7. Poll with `indream_exports_wait`.
8. If needed, inspect history with `indream_exports_get` or `indream_exports_list`.

## When to use project exports

Prefer project exports when the user needs:

- autosave
- reusable uploads
- multiple exports from one saved draft
- task history correlated back to one project

Prefer stateless exports when the user only has one final JSON payload and does not need server-side draft state.

## Optional tool allowlist

Write tools are registered as optional OpenClaw tools.
If OpenClaw blocks a write step, tell the user to allow either:

- the whole plugin id: `indream`
- or the specific write tool name under `tools.allow`

## Reference file

- `references/workflow.md`
