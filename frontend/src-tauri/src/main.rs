//! Jay-H's window. No tray: the hub runs nothing in the background (docs/ARQUITETURA.md, section 2).

// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

/// An app installed by its NSIS installer (docs/ARQUITETURA.md, section 1).
#[derive(serde::Serialize)]
struct Installed {
    version: String,
    location: String,
}

/// Version and folder of the installed app `name` (its installer's productName), or None.
// shortcut: only per-user installs (HKCU), which is how the Jay installers install; add HKLM if one
// ever installs per machine.
#[tauri::command]
fn installed_app(name: String) -> Result<Option<Installed>, String> {
    // The name becomes a registry path: no backslashes or anything else that could climb out of it.
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("invalid product name: {name}"));
    }
    #[cfg(windows)]
    {
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};
        let path = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{name}");
        let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(path) else {
            return Ok(None);
        };
        let version: String = key.get_value("DisplayVersion").map_err(|e| e.to_string())?;
        let location: String = key.get_value("InstallLocation").unwrap_or_default();
        // NSIS stores the folder in quotes.
        Ok(Some(Installed { version, location: location.trim_matches('"').to_owned() }))
    }
    #[cfg(not(windows))]
    Ok(None)
}

fn main() {
    tauri::Builder::default()
        // First plugin: a second launch exits at once and shows the running Jay-H.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![installed_app])
        .run(tauri::generate_context!())
        .expect("error while running Jay-H");
}
