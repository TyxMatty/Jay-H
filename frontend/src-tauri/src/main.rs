//! Jay-H's window. No tray: the hub runs nothing in the background (docs/ARQUITETURA.md, section 2).

// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod products;
#[cfg(windows)]
mod taskbar_icon;

use tauri::Manager;

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
        .invoke_handler(tauri::generate_handler![
            products::installed_app,
            products::open_app,
            products::install_app,
            #[cfg(windows)]
            taskbar_icon::set_taskbar_icon
        ])
        .setup(|_app| {
            // An app, not a browser: no right-click menu and no browser shortcuts (F5, Ctrl+R, Ctrl+P,
            // Ctrl+F, F12, Alt+Left…), which Tauri's config doesn't expose. Dev builds keep them, for
            // Inspect and reload.
            #[cfg(all(windows, not(debug_assertions)))]
            if let Some(window) = _app.get_webview_window("main") {
                window.with_webview(|webview| unsafe {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
                    use windows::core::Interface;
                    if let Ok(settings) = webview.controller().CoreWebView2().and_then(|w| w.Settings()) {
                        let _ = settings.SetAreDefaultContextMenusEnabled(false);
                        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
                            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
                        }
                    }
                })?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Jay-H");
}
