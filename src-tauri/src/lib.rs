mod boltz;
mod commands;
mod models;
mod poller;
mod prefs;
mod storage;

use log::info;
use tauri::Manager;
use models::SharedState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::test_connection,
            commands::get_campaigns,
            commands::create_campaign,
            commands::rename_campaign,
            commands::archive_campaign,
            commands::unarchive_campaign,
            commands::create_run,
            commands::get_run,
            commands::rename_run,
            commands::archive_run,
            commands::unarchive_run,
            commands::cancel_run,
            commands::retry_compound,
            commands::get_compound,
            commands::get_pose_cif,
            commands::get_pae_image_path,
            commands::open_in_finder,
            commands::open_structure_external,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Read root directory from prefs (bootstrap path)
            let root_dir = prefs::read_root_dir(&app_handle)
                .unwrap_or_else(|_| prefs::default_root_dir().unwrap());

            // Load state from disk (creates backup — D8)
            let app_state = storage::load_state(&root_dir)
                .unwrap_or_else(|e| {
                    log::error!("Failed to load state, using defaults: {e}");
                    models::AppState {
                        data: models::AppData::default(),
                        dirty: false,
                        root_dir: root_dir.clone(),
                    }
                });

            // Check for incomplete downloads before starting
            let incomplete = storage::scan_incomplete_downloads(&root_dir, &app_state.data);

            let state: SharedState = Arc::new(Mutex::new(app_state));
            let client = Arc::new(boltz::BoltzClient::new("https://lab.boltz.bio"));
            let cancel_token = CancellationToken::new();

            app.manage(state.clone());
            app.manage(client.clone());

            // D2: Start persistence flusher (2-second dirty-flag loop)
            storage::start_persistence_flusher(state.clone());

            // Cleanup temp directory
            let root_clone = root_dir.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = storage::cleanup_temp_dir(&root_clone).await {
                    log::warn!("Failed to cleanup temp dir: {e}");
                }
            });

            // Recover incomplete downloads
            if !incomplete.is_empty() {
                info!("Found {} incomplete downloads to recover", incomplete.len());
                let app_clone = app_handle.clone();
                let state_clone = state.clone();
                let client_clone = client.clone();
                tauri::async_runtime::spawn(async move {
                    poller::recover_incomplete_downloads(
                        app_clone,
                        state_clone,
                        client_clone,
                        incomplete,
                    )
                    .await;
                });
            }

            // D10: Start poller with cancellation token
            poller::start_poller(
                app_handle.clone(),
                state.clone(),
                client.clone(),
                cancel_token.clone(),
            );

            // Store cancel token for shutdown
            app.manage(cancel_token);

            Ok(())
        })
        .on_window_event(|window, event| {
            // D10/A1: Graceful shutdown — cancel poller and flush dirty state
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("Window close requested, initiating shutdown");
                let app = window.app_handle();

                // Cancel the poller
                if let Some(token) = app.try_state::<CancellationToken>() {
                    token.cancel();
                }

                // Flush dirty state before exit — use try_lock to avoid
                // block_on inside the Tokio runtime (which can panic).
                // If the lock is contended, the flusher or lock holder will persist.
                if let Some(state) = app.try_state::<SharedState>() {
                    if let Ok(mut guard) = state.try_lock() {
                        if guard.dirty {
                            guard.dirty = false;
                            if let Err(e) = storage::persist_state(&guard.root_dir, &guard.data) {
                                log::error!("Failed to persist state on shutdown: {e}");
                            }
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
