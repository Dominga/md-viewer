//! Tauri commands exposed to the viewer.
//!
//! Every command works with paths relative to the currently opened vault, so
//! the webview can never ask for arbitrary files.

mod editor;
mod state;
mod watcher;

use state::{AppState, Vault, VaultInfo};
use std::path::PathBuf;
use tauri::{Manager, State};

fn open_vault_impl(app: &tauri::AppHandle, path: &str) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| format!("Cannot open '{path}': {e}"))?;
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", root.display()));
    }

    let watcher = watcher::start(app.clone(), root.clone())?;
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.display().to_string());

    let state = app.state::<AppState>();
    let mut guard = state.vault.lock().map_err(|_| "state poisoned")?;
    *guard = Some(Vault { root: root.clone(), watcher });
    drop(guard);

    Ok(VaultInfo {
        root: root.to_string_lossy().to_string(),
        name,
    })
}

#[tauri::command]
fn open_vault(app: tauri::AppHandle, path: String) -> Result<VaultInfo, String> {
    open_vault_impl(&app, &path)
}

#[tauri::command]
fn list_dir(state: State<'_, AppState>, rel: String) -> Result<Vec<state::Entry>, String> {
    state::list_dir(&state, &rel)
}

#[tauri::command]
fn read_doc(state: State<'_, AppState>, rel: String) -> Result<state::Doc, String> {
    state::read_doc(&state, &rel)
}

#[tauri::command]
fn asset_meta(state: State<'_, AppState>, rel: String) -> Result<state::AssetMeta, String> {
    state::asset_meta(&state, &rel)
}

/// Returns raw bytes so the webview can build a `Blob` URL. Binary data is not
/// JSON-encoded, which keeps large images fast to load.
#[tauri::command]
fn read_asset(state: State<'_, AppState>, rel: String) -> Result<tauri::ipc::Response, String> {
    let bytes = state::read_asset_bytes(&state, &rel)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn open_in_editor(state: State<'_, AppState>, rel: String) -> Result<String, String> {
    let path = state::resolve(&state, &rel)?;
    editor::launch(&path)
}

#[tauri::command]
fn editor_label() -> Option<String> {
    editor::detect().map(|e| e.label)
}

/// Start-up request for the frontend: `ready` says the command line has been
/// parsed, the rest is what to open (nothing, when the app was launched bare).
#[derive(serde::Serialize)]
struct StartupInfo {
    ready: bool,
    root: Option<String>,
    name: Option<String>,
    file: Option<String>,
}

/// Returns the vault passed on the command line exactly once.
#[tauri::command]
fn take_startup(state: State<'_, AppState>) -> StartupInfo {
    use std::sync::atomic::Ordering;

    let ready = state.startup_ready.load(Ordering::SeqCst);
    let startup = state
        .startup
        .lock()
        .ok()
        .and_then(|mut guard| if ready { guard.take() } else { None });

    StartupInfo {
        ready,
        root: startup
            .as_ref()
            .map(|s| s.root.to_string_lossy().to_string()),
        name: startup.as_ref().map(|s| {
            s.root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| s.root.display().to_string())
        }),
        file: startup.and_then(|s| s.file),
    }
}

/// The vault that is already open, for example when it was passed on the
/// command line or restored from a previous session.
#[tauri::command]
fn current_vault(state: State<'_, AppState>) -> Option<VaultInfo> {
    let guard = state.vault.lock().ok()?;
    guard.as_ref().map(|vault| VaultInfo {
        root: vault.root.to_string_lossy().to_string(),
        name: vault
            .root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| vault.root.display().to_string()),
    })
}

/// Open an external URL in the system browser.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err("Unsupported URL scheme".into());
    }
    open::that(url).map_err(|e| e.to_string())
}

/// Hand a non-markdown file over to the OS default application.
#[tauri::command]
fn open_path_os(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    let path = state::resolve(&state, &rel)?;
    open::that(path).map_err(|e| e.to_string())
}


/// Store the command-line request for the frontend to pick up.
fn record_startup(state: &AppState, root: PathBuf, file: Option<String>) {
    if let Ok(mut guard) = state.startup.lock() {
        *guard = Some(state::Startup { root, file });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            list_dir,
            read_doc,
            asset_meta,
            read_asset,
            open_in_editor,
            editor_label,
            take_startup,
            current_vault,
            open_external,
            open_path_os
        ])
        .setup(|app| {
            // `md-viewer /vault [file.md]` or `md-viewer /vault/my-note.md`.
            // Only record the request here; opening it is the frontend's job,
            // so a slow watcher setup can never race the first render.
            let mut args = std::env::args().skip(1);
            if let Some(first) = args.next() {
                let path = PathBuf::from(&first);
                let (root, file) = if path.is_file() {
                    let file = path.file_name().map(|n| n.to_string_lossy().to_string());
                    (path.parent().map(|p| p.to_path_buf()), file)
                } else if path.is_dir() {
                    (Some(path), args.next())
                } else {
                    (None, None)
                };

                if let Some(root) = root {
                    if let Ok(root) = root.canonicalize() {
                        let file = file
                            .map(|f| f.trim_start_matches("./").trim_start_matches('/').to_string());
                        record_startup(&app.state::<AppState>(), root, file);
                    }
                }
            }

            app.state::<AppState>()
                .startup_ready
                .store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
