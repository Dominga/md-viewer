# HTTP API notes

Scratch notes about the local HTTP API, kept here mostly to have a second
document at the same level as `guide.md`.

## Endpoints

| Method | Path         | Description              |
| ------ | ------------ | ------------------------ |
| GET    | `/api/tree`  | Directory listing        |
| GET    | `/api/file`  | Raw Markdown source      |
| GET    | `/api/asset` | Binary asset by path     |

## Example

```json
{
  "name": "note.md",
  "path": "docs/note.md",
  "size": 1432,
  "modified": "2026-11-12T12:00:00Z"
}
```

## Notes

1. Paths are always relative to the vault root.
2. `..` segments are rejected before the filesystem is touched.
3. Symlinks are resolved and checked against the root as well.

See the [guide](guide.md) for the UI side of things.
