//! Vault state, path guarding and filesystem access.
//!
//! The frontend never touches the filesystem directly: every command receives a
//! path *relative to the opened vault root* and resolves it through
//! [`resolve`], which canonicalizes the path and rejects anything that escapes
//! the root (including symlinks pointing outside).

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// Documents larger than this are refused instead of being pushed through IPC.
pub const MAX_DOC_BYTES: u64 = 8 * 1024 * 1024;
/// Images / other binaries larger than this are refused.
pub const MAX_ASSET_BYTES: u64 = 48 * 1024 * 1024;

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".obsidian",
    ".trash",
    ".venv",
    "__pycache__",
    ".next",
    ".cache",
];

/// A folder opened by the user. Owns the filesystem watcher: dropping the
/// vault stops the watcher thread, which is why the handle is kept alive even
/// though it is never read.
pub struct Vault {
    pub root: PathBuf,
    #[allow(dead_code)]
    pub watcher: notify::RecommendedWatcher,
}

/// A vault (and optionally a file) requested on the command line. The frontend
/// takes it once and opens it, which keeps start-up free of races between the
/// Rust `setup` hook and the first render.
pub struct Startup {
    pub root: PathBuf,
    pub file: Option<String>,
}

#[derive(Default)]
pub struct AppState {
    pub vault: Mutex<Option<Vault>>,
    pub startup: Mutex<Option<Startup>>,
    /// Set once `setup` has parsed the command line, so the frontend knows
    /// whether waiting for a start-up request makes sense at all.
    pub startup_ready: AtomicBool,
}

#[derive(Serialize, Clone)]
pub struct VaultInfo {
    pub root: String,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
    /// One of: `dir`, `md`, `image`, `pdf`, `other`.
    pub kind: String,
}

#[derive(Serialize)]
pub struct Doc {
    pub content: String,
    pub size: u64,
    pub mtime: u64,
}

#[derive(Serialize)]
pub struct AssetMeta {
    pub exists: bool,
    pub size: u64,
    pub mime: String,
}

pub fn root(state: &AppState) -> Result<PathBuf, String> {
    let guard = state.vault.lock().map_err(|_| "state poisoned")?;
    match guard.as_ref() {
        Some(v) => Ok(v.root.clone()),
        None => Err("No vault is open".into()),
    }
}

fn join_checked(root: &PathBuf, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim().replace('\\', "/");
    if rel.split('/').any(|c| c == "..") {
        return Err("Path escapes the vault".into());
    }
    if rel.is_empty() || rel == "/" {
        return Ok(root.clone());
    }
    Ok(root.join(rel.trim_start_matches('/')))
}

/// Resolve an existing path inside the vault.
pub fn resolve(state: &AppState, rel: &str) -> Result<PathBuf, String> {
    let root = root(state)?;
    let joined = join_checked(&root, rel)?;
    let canonical = joined
        .canonicalize()
        .map_err(|e| format!("Cannot resolve '{rel}': {e}"))?;
    if !canonical.starts_with(&root) {
        return Err("Path escapes the vault".into());
    }
    Ok(canonical)
}

/// Resolve a path that may legitimately not exist yet (used for asset probes).
fn resolve_optional(state: &AppState, rel: &str) -> Result<Option<PathBuf>, String> {
    let root = root(state)?;
    let joined = join_checked(&root, rel)?;
    match joined.canonicalize() {
        Ok(canonical) => {
            if !canonical.starts_with(&root) {
                return Err("Path escapes the vault".into());
            }
            Ok(Some(canonical))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Cannot resolve '{rel}': {e}")),
    }
}

pub fn is_ignored_name(name: &str) -> bool {
    if name.starts_with('.') && IGNORED_DIRS.contains(&name) {
        return true;
    }
    IGNORED_DIRS.contains(&name)
        || name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".tmp")
        || name == ".DS_Store"
}

fn kind_of(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "md" | "markdown" | "mdown" | "mkd" | "mkdn" => "md",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" | "ico" => "image",
        "pdf" => "pdf",
        _ => "other",
    }
}

pub fn mime_of(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn mtime_millis(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn list_dir(state: &AppState, rel: &str) -> Result<Vec<Entry>, String> {
    let root = root(state)?;
    let dir = resolve(state, rel)?;
    let read = std::fs::read_dir(&dir).map_err(|e| format!("Cannot read '{rel}': {e}"))?;

    let mut entries = Vec::new();
    for item in read {
        let item = match item {
            Ok(i) => i,
            Err(_) => continue,
        };
        let name = item.file_name().to_string_lossy().to_string();
        if is_ignored_name(&name) {
            continue;
        }
        // `metadata` follows symlinks and silently drops broken ones.
        let meta = match std::fs::metadata(item.path()) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let path = item.path();
        let rel_path = path
            .strip_prefix(&root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());
        let is_dir = meta.is_dir();
        entries.push(Entry {
            name: name.clone(),
            path: rel_path,
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            mtime: mtime_millis(&meta),
            kind: if is_dir { "dir".into() } else { kind_of(&name).into() },
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_doc(state: &AppState, rel: &str) -> Result<Doc, String> {
    let path = resolve(state, rel)?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("Cannot stat '{rel}': {e}"))?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    if meta.len() > MAX_DOC_BYTES {
        return Err(format!(
            "File is too large to display ({:.1} MB)",
            meta.len() as f64 / 1_048_576.0
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Cannot read '{rel}': {e}"))?;
    Ok(Doc {
        content: String::from_utf8_lossy(&bytes).to_string(),
        size: meta.len(),
        mtime: mtime_millis(&meta),
    })
}

pub fn asset_meta(state: &AppState, rel: &str) -> Result<AssetMeta, String> {
    match resolve_optional(state, rel)? {
        None => Ok(AssetMeta {
            exists: false,
            size: 0,
            mime: String::new(),
        }),
        Some(path) => {
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            Ok(AssetMeta {
                exists: meta.is_file(),
                size: meta.len(),
                mime: mime_of(rel).to_string(),
            })
        }
    }
}

pub fn read_asset_bytes(state: &AppState, rel: &str) -> Result<Vec<u8>, String> {
    let path = resolve(state, rel).map_err(|_| format!("File not found: {rel}"))?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ASSET_BYTES {
        return Err(format!(
            "File is too large ({:.1} MB)",
            meta.len() as f64 / 1_048_576.0
        ));
    }
    std::fs::read(&path).map_err(|e| format!("Cannot read '{rel}': {e}"))
}

