# Architecture

This document explains how MD Viewer is put together and why the pieces look
the way they do. It is meant for contributors; usage lives in the
[README](../README.md).

## Goals and non-goals

**Goals**

- Instant reading of a local folder of Markdown files.
- The desktop app must be small, native and safe with untrusted documents.
- Never write to the vault.
- Keep the UI independent from the backend so the same frontend can later run
  on top of a different filesystem bridge (a web server, a mobile shell).

**Non-goals**

- Editing. The viewer delegates writing to an external editor.
- Being a note-taking app. No database, no index, no sync — the filesystem is
  the source of truth.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ React UI (src/)                                              │
│   components/ · state/ (zustand) · lib/ (IPC, paths, assets) │
└───────────────────────────┬──────────────────────────────────┘
                            │ invoke() / events
┌───────────────────────────▼──────────────────────────────────┐
│ Rust core (src-tauri/src)                                    │
│   state.rs   vault state, path guard, fs commands            │
│   watcher.rs debounced recursive watcher                     │
│   editor.rs  editor detection and launch                     │
└──────────────────────────────────────────────────────────────┘
```

The frontend has exactly one module that talks to the backend —
[`src/lib/api.ts`](../src/lib/api.ts). Everything else works with plain values,
which keeps the UI testable and the IPC surface small.

## Path safety

The user picks a folder once; it becomes the *vault root* and is canonicalized
with `std::fs::canonicalize`. Every command then accepts a path **relative to
that root**:

1. `..` segments are rejected before touching the filesystem.
2. The joined path is canonicalized, which resolves symlinks.
3. The result must still start with the canonical root, otherwise the command
   fails with `Path escapes the vault`.

This blocks `../../etc/passwd`, absolute paths and symlinks that point outside
the vault, without maintaining an allow-list. Asset probes use the same guard
and additionally treat `NotFound` as a normal answer instead of an error, so the
UI can render "this image does not exist" rather than a failure.

## Filesystem watcher

`notify` watches the root recursively. Raw events are coalesced in a background
thread: the thread drains a channel until 150 ms pass without events, then emits
one `fs-change` event with vault-relative paths. Editor "save" usually produces
several events (write, rename, attribute change), which would otherwise cause a
burst of reloads.

The frontend reacts per path:

- invalidate the cached blob for that path (images reload),
- refresh the directory listing if it is currently loaded,
- re-read the document if it is open in a tab, keeping the scroll position.

Directories such as `.git`, `node_modules`, `target`, `dist` and `.obsidian` are
filtered out on the Rust side.

## Rendering pipeline

Markdown goes through the unified ecosystem via `react-markdown`:

```
remark-gfm → rehype-raw → rehype-slug → rehype-sanitize → React elements
```

- `remark-gfm` adds tables, task lists, strikethrough, autolinks and footnotes.
- `rehype-raw` parses embedded HTML so `<details>`, `<br>` and `<kbd>` work.
- `rehype-slug` assigns heading ids for anchors and the outline.
- `rehype-sanitize` runs last and strips anything scriptable. The schema is
  GitHub's default plus `id` and `className`, which the previous steps need.
  `clobberPrefix` is cleared so heading ids stay stable.

URLs are filtered by a custom `urlTransform`: `javascript:` and `vbscript:` are
always dropped, and `data:` is allowed only for images.

Custom components replace the default ones:

| Element | Replacement | Why |
| --- | --- | --- |
| `pre` | `CodeBlock` | language label, copy button, Shiki highlighting |
| `img` | `MarkdownImage` | path resolution, liveness checks, lightbox |
| `a` | `MarkdownLink` | internal navigation, external browser, dead links |
| `table` | wrapped in a scroll container | wide tables must not break the layout |

The outline is **not** parsed from Markdown. It is read from the rendered DOM
(`h1–h4` with ids) after commit, so its anchors always match what is on screen,
and code blocks that contain `#` lines never produce phantom entries.

## Asset pipeline and image previews

Images are the only binary payload the viewer handles, and they need three
things: correct resolution, liveness checks and speed.

**Resolution.** `resolveLink` implements the rules Markdown documents actually
use:

- relative paths are resolved against the directory of the containing document;
- `/foo.png` is treated as vault-absolute;
- `file:///…` URLs are mapped back into the vault when they point inside it;
- percent-encoding is decoded, backslashes are normalized, and `..` is collapsed;
- anything that would escape the vault resolves to `null` and is refused.

**Liveness.** There is no separate `exists` request. The renderer requests the
bytes; a missing file comes back as a rejected command, which becomes an
explicit placeholder:

```
⚠ Image not found
  docs/images/does-not-exist.png
```

The same placeholder is used when the link escapes the vault or the file is too
large. This keeps the number of IPC round-trips at one per image and makes the
"dead link" state impossible to miss.

**Transport.** `read_asset` returns `tauri::ipc::Response` with raw bytes rather
than JSON or base64, so a 2 MB image costs 2 MB over IPC instead of 2.7 MB of
base64 inside a string. The frontend wraps the buffer in a `Blob` with a MIME
type derived from the extension and caches the resulting object URL per path.
`fs-change` invalidates the cache entry, so replacing an image on disk updates
it on screen.

**Previews from links.** A link whose target resolves to a local image gets a
small inline thumbnail and opens the image tab when clicked. Since the thumbnail
loads through the same cache, a dead link simply does not render a thumbnail.

## State model

`zustand` holds everything that is not local component state:

- `listings` — directory contents keyed by relative dir, filled lazily;
- `expanded` — which directories are open in the tree;
- `tabs`, `activePath`, `docs` — open files and their loaded content;
- `fsTick` — a counter bumped by the watcher, used as a cache-busting key.

Only a subset is persisted (`localStorage`): the vault root, tabs, active tab,
expanded directories, theme and layout sizes. Restoring a session re-opens the
vault, reloads expanded directories and re-reads the Markdown tabs. Scroll
positions are kept in memory per tab, so switching tabs does not lose your place
but a restart does.

## Performance notes

- Directories are listed lazily, one level per expansion.
- The tree is rebuilt from `listings` + `expanded` with memoization; a filter
  switches it to a flat list of matches.
- Shiki's highlighter is created once, on the first code block, and its output
  is cached (bounded to 300 entries) keyed by theme, language and source.
- Documents are read through a single `read_doc` call with a size cap; the
  viewer refuses files above 8 MB and assets above 48 MB.

## Known limitations

- Full-text search is not implemented; the tree filter only matches names of
  already-listed entries.
- No wiki-links (`[[note]]`) or backlinks yet.
- The Markdown front matter is rendered as a horizontal rule plus text; it is
  not extracted into a properties panel.
- PDFs and other binaries are handed to the system application.

## Testing

There is no automated test suite yet. The `demo/` folder is a manual smoke test:
it covers nested directories, GFM tables and task lists, code in several
languages, a live image, a missing image and dead links. `pnpm typecheck` and
`cargo build` are the current CI gates.
