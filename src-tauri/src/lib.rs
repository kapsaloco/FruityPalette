#[cfg(windows)]
mod screen_picker;
#[cfg(windows)]
use tauri::Manager;

#[tauri::command]
async fn pick_screen_color() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        screen_picker::start()?;
        tauri::async_runtime::spawn_blocking(screen_picker::pick)
            .await
            .map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))]
    {
        Err("Screen picking is unavailable on this platform.".into())
    }
}

#[tauri::command]
fn cancel_screen_pick() {
    #[cfg(windows)]
    screen_picker::cancel();
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(windows)]
            if let (Some(window), Some(icon)) =
                (app.get_webview_window("main"), app.default_window_icon())
            {
                window.set_icon(icon.clone())?;
            }
            #[cfg(not(windows))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_screen_color,
            cancel_screen_pick
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
