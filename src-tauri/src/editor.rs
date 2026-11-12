//! "Open in editor" support.
//!
//! Resolution order: `$MDV_EDITOR` / `$VISUAL` / `$EDITOR`, then a list of
//! well-known GUI editors found on `PATH`.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub struct Editor {
    pub label: String,
    pub program: String,
    /// Extra arguments that must precede the file path (e.g. `-g` for VS Code).
    pub pre_args: Vec<String>,
}

const KNOWN: &[(&str, &str, &[&str])] = &[
    ("code", "VS Code", &["-g"]),
    ("cursor", "Cursor", &["-g"]),
    ("codium", "VSCodium", &["-g"]),
    ("code-insiders", "VS Code Insiders", &["-g"]),
    ("zed", "Zed", &[]),
    ("subl", "Sublime Text", &[]),
    ("kate", "Kate", &[]),
    ("gedit", "gedit", &[]),
    ("gnome-text-editor", "Text Editor", &[]),
    ("multiedit", "MultiEdit", &[]),
];

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

fn find_in_path(program: &str) -> Option<PathBuf> {
    if program.contains('/') {
        let p = PathBuf::from(program);
        return is_executable(&p).then_some(p);
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(program))
        .find(|candidate| is_executable(candidate))
}

fn from_env() -> Option<Editor> {
    for var in ["MDV_EDITOR", "VISUAL", "EDITOR"] {
        let Ok(raw) = std::env::var(var) else { continue };
        let mut parts = raw.split_whitespace();
        let Some(program) = parts.next() else { continue };
        if let Some(full) = find_in_path(program) {
            let label = full
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| program.to_string());
            return Some(Editor {
                label,
                program: full.to_string_lossy().to_string(),
                pre_args: parts.map(|p| p.to_string()).collect(),
            });
        }
    }
    None
}

pub fn detect() -> Option<Editor> {
    if let Some(editor) = from_env() {
        return Some(editor);
    }
    for (program, label, pre_args) in KNOWN {
        if let Some(full) = find_in_path(program) {
            return Some(Editor {
                label: (*label).to_string(),
                program: full.to_string_lossy().to_string(),
                pre_args: pre_args.iter().map(|a| a.to_string()).collect(),
            });
        }
    }
    None
}

pub fn launch(file: &Path) -> Result<String, String> {
    let editor = detect().ok_or("No editor found. Set $MDV_EDITOR or install VS Code.")?;
    let mut cmd = Command::new(&editor.program);
    cmd.args(&editor.pre_args).arg(file);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn()
        .map_err(|e| format!("Cannot launch {}: {e}", editor.label))?;
    Ok(editor.label)
}
