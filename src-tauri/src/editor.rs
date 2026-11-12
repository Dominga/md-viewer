//! "Open in editor" support.
//!
//! Resolution order:
//!
//! 1. `$MDV_EDITOR` — explicit override, may contain arguments.
//! 2. The system default application for `text/plain` (Kate on KDE, Notepad on
//!    Windows, TextEdit on macOS).
//! 3. `$VISUAL` / `$EDITOR`, unless they point at a terminal-only editor.
//! 4. A list of well-known GUI editors found on `PATH`.
//!
//! The first three are resolved to an absolute program path, so launching does
//! not depend on the environment of the process that started the viewer.

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

/// Editors that only run inside a terminal: spawning them detached would show
/// nothing at all, so they are skipped when they come from `$VISUAL`/`$EDITOR`.
const TERMINAL_EDITORS: &[&str] = &["vi", "vim", "nvim", "nano", "ed", "hx", "helix", "micro", "kak"];

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
    if program.contains('/') || program.contains('\\') {
        let path = PathBuf::from(program);
        return is_executable(&path).then_some(path);
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(program))
        .find(|candidate| is_executable(candidate))
}

fn from_env(var: &str, allow_terminal: bool) -> Option<Editor> {
    let raw = std::env::var(var).ok()?;
    let mut parts = raw.split_whitespace();
    let program = parts.next()?;
    if !allow_terminal && TERMINAL_EDITORS.contains(&program) {
        return None;
    }
    let full = find_in_path(program)?;
    let label = full
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string());
    Some(Editor {
        label,
        program: full.to_string_lossy().to_string(),
        pre_args: parts.map(|p| p.to_string()).collect(),
    })
}

/// Read the `Exec=` value of a desktop entry, dropping field codes (`%U`,
/// `%f`, …) that describe what the application expects to be given.
#[cfg(target_os = "linux")]
fn parse_exec(exec: &str) -> Option<(String, Vec<String>)> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut quoted = false;

    for ch in exec.chars() {
        match ch {
            '"' => quoted = !quoted,
            ' ' if !quoted => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    let program = tokens.first()?.clone();
    let args = tokens
        .iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('%'))
        .cloned()
        .collect();
    Some((program, args))
}

#[cfg(target_os = "linux")]
fn parse_desktop_value(contents: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    let mut in_entry = false;
    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry {
            continue;
        }
        if let Some(value) = line.strip_prefix(&prefix) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn xdg_default_desktop() -> Option<String> {
    let queries: &[(&str, &[&str])] = &[
        ("xdg-mime", &["query", "default", "text/plain"]),
        ("gio", &["mime", "text/plain"]),
    ];
    for (program, args) in queries {
        let Ok(output) = Command::new(program).args(*args).output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let line = line.trim();
            if line.ends_with(".desktop") {
                return Some(line.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn desktop_file(id: &str) -> Option<PathBuf> {
    let mut directories: Vec<PathBuf> = Vec::new();
    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        directories.push(PathBuf::from(data_home).join("applications"));
    } else if let Some(home) = std::env::var_os("HOME") {
        directories.push(PathBuf::from(home).join(".local/share/applications"));
    }
    if let Some(data_dirs) = std::env::var_os("XDG_DATA_DIRS") {
        for dir in std::env::split_paths(&data_dirs) {
            directories.push(dir.join("applications"));
        }
    } else {
        directories.push(PathBuf::from("/usr/local/share/applications"));
        directories.push(PathBuf::from("/usr/share/applications"));
    }
    directories
        .into_iter()
        .map(|dir| dir.join(id))
        .find(|path| path.is_file())
}

#[cfg(target_os = "linux")]
fn system_default() -> Option<Editor> {
    let id = xdg_default_desktop()?;
    let contents = std::fs::read_to_string(desktop_file(&id)?).ok()?;
    let label = parse_desktop_value(&contents, "Name").unwrap_or_else(|| id.clone());
    let (program, pre_args) = parse_exec(&parse_desktop_value(&contents, "Exec")?)?;
    let program = find_in_path(&program)?;
    Some(Editor {
        label,
        program: program.to_string_lossy().to_string(),
        pre_args,
    })
}

#[cfg(target_os = "windows")]
fn system_default() -> Option<Editor> {
    Some(Editor {
        label: "Notepad".into(),
        program: "notepad.exe".into(),
        pre_args: Vec::new(),
    })
}

#[cfg(target_os = "macos")]
fn system_default() -> Option<Editor> {
    Some(Editor {
        label: "TextEdit".into(),
        program: "open".into(),
        pre_args: vec!["-e".into()],
    })
}

fn known_editor() -> Option<Editor> {
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

pub fn detect() -> Option<Editor> {
    from_env("MDV_EDITOR", true)
        .or_else(system_default)
        .or_else(|| from_env("VISUAL", false))
        .or_else(|| from_env("EDITOR", false))
        .or_else(known_editor)
}

pub fn launch(file: &Path) -> Result<String, String> {
    let editor = detect().ok_or("No editor found. Set $MDV_EDITOR to one.")?;
    let mut cmd = Command::new(&editor.program);
    cmd.args(&editor.pre_args).arg(file);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn()
        .map_err(|e| format!("Cannot launch {}: {e}", editor.label))?;
    Ok(editor.label)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn parses_exec_field_codes() {
        assert_eq!(
            parse_exec("kate %U"),
            Some(("kate".to_string(), vec![]))
        );
        assert_eq!(
            parse_exec("/usr/bin/code -g %F"),
            Some(("/usr/bin/code".to_string(), vec!["-g".to_string()]))
        );
        assert_eq!(
            parse_exec("\"my editor\" --new %f"),
            Some(("my editor".to_string(), vec!["--new".to_string()]))
        );
    }

    #[test]
    fn reads_desktop_entry_values() {
        let entry = "[Desktop Entry]\nName=Kate\nName[ru]=Кейт\nExec=kate %U\n";
        assert_eq!(parse_desktop_value(entry, "Name"), Some("Kate".to_string()));
        assert_eq!(
            parse_desktop_value(entry, "Exec"),
            Some("kate %U".to_string())
        );
        assert_eq!(parse_desktop_value(entry, "Comment"), None);
    }

    #[test]
    #[cfg(unix)]
    fn launches_configured_editor_with_the_file() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("mdv-editor-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("args.txt");
        let script = dir.join("fake-editor.sh");
        let mut file = std::fs::File::create(&script).unwrap();
        writeln!(file, "#!/bin/sh").unwrap();
        writeln!(file, "printf '%s\\n' \"$@\" > '{}'", log.display()).unwrap();
        drop(file);
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let target = dir.join("note.md");
        std::fs::write(&target, "# hi").unwrap();

        std::env::set_var("MDV_EDITOR", &script);
        let label = launch(&target).unwrap();
        std::env::remove_var("MDV_EDITOR");

        assert!(!label.is_empty());
        for _ in 0..100 {
            if log.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let args = std::fs::read_to_string(&log).unwrap();
        assert_eq!(args.trim(), target.to_string_lossy());
    }
}
