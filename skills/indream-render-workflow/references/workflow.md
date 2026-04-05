# Workflow Reference

## Typical path

1. `indream_projects_create`
2. `indream_assets_upload`
3. update editor JSON assets and items
4. `indream_projects_sync`
5. `indream_editor_validate`
6. `indream_projects_create_export`
7. `indream_exports_wait`

## Useful recovery actions

- `indream_projects_get` to re-read the latest project state
- `indream_projects_list_assets` to inspect attached assets
- `indream_assets_get` to inspect asset metadata
- `indream_exports_get` to inspect one task
- `indream_exports_list` to inspect task history
