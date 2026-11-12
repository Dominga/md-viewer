//! Recursive filesystem watcher.
//!
//! Raw `notify` events are coalesced in a background thread (150 ms of quiet)
//! and emitted to the webview as a single `fs-change` event carrying paths
//! relative to the vault root. The frontend decides what to refresh.

use notify::event::{EventKind, ModifyKind};
use notify::{RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const QUIET_PERIOD: Duration = Duration::from_millis(150);

fn is_ignored(path: &Path) -> bool {
    path.components().any(|c| {
        let name = c.as_os_str().to_string_lossy();
        matches!(
            name.as_ref(),
            ".git" | "node_modules" | "target" | "dist" | ".obsidian" | ".trash" | ".cache"
        )
    })
}

/// Only content-changing events matter. Reads (`Access`) and metadata-only
/// changes are dropped: the viewer itself reads the vault, and reacting to its
/// own reads would make it reload files forever.
fn is_content_change(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Name(_))
    )
}

pub fn start(app: AppHandle, root: PathBuf) -> Result<notify::RecommendedWatcher, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| format!("Watcher failed: {e}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("Cannot watch '{}': {e}", root.display()))?;

    std::thread::spawn(move || {
        let mut pending: HashSet<PathBuf> = HashSet::new();
        loop {
            match rx.recv_timeout(QUIET_PERIOD) {
                Ok(Ok(event)) => {
                    if !is_content_change(&event.kind) {
                        continue;
                    }
                    for path in event.paths {
                        if !is_ignored(&path) {
                            pending.insert(path);
                        }
                    }
                }
                Ok(Err(_)) => {}
                Err(RecvTimeoutError::Timeout) => {
                    if pending.is_empty() {
                        continue;
                    }
                    let changed: Vec<String> = pending
                        .drain()
                        .filter_map(|p| {
                            p.strip_prefix(&root)
                                .ok()
                                .map(|r| r.to_string_lossy().replace('\\', "/"))
                        })
                        .filter(|p| !p.is_empty())
                        .collect();
                    if !changed.is_empty() {
                        let _ = app.emit("fs-change", changed);
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(watcher)
}
