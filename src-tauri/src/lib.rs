mod backend;

use backend::{
    add_log, add_script, delete_script, detect_venv, get_logs, get_scripts, get_settings,
    init_db, llm_chat, llm_fill_params, parse_script_params, run_script, save_settings,
    stop_script, update_script, AppState,
};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            let db = init_db(app_data_dir).expect("Failed to initialize database");

            app.manage(AppState {
                db: Mutex::new(db),
                running_processes: Mutex::new(std::collections::HashMap::new()),
            });

            // Setup logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Scripts
            get_scripts,
            add_script,
            update_script,
            delete_script,
            parse_script_params,
            detect_venv,
            // Execution
            run_script,
            stop_script,
            // Settings
            get_settings,
            save_settings,
            // Logs
            add_log,
            get_logs,
            // LLM
            llm_chat,
            llm_fill_params,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
