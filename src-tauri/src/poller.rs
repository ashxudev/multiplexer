use crate::boltz::{self, BoltzClient};
use crate::models::{
    CompoundFilesReadyEvent, CompoundRef, CompoundStatusEvent, JobStatus,
    SharedState,
};
use crate::storage;
use chrono::Utc;
use log::{error, info, warn};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

/// D6: Maximum time a compound can stay non-terminal before being timed out.
const POLL_TIMEOUT: Duration = Duration::from_secs(7200); // 2 hours

/// D3: Maximum concurrent poll requests.
const POLL_CONCURRENCY: usize = 10;

/// Start the background poller loop. Checks every 10 seconds.
/// Cancellable via the provided token (D10).
pub fn start_poller(
    app_handle: AppHandle,
    state: SharedState,
    client: Arc<BoltzClient>,
    cancel: CancellationToken,
) {
    tokio::spawn(async move {
        let semaphore = Arc::new(Semaphore::new(POLL_CONCURRENCY));

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    info!("Poller cancelled, shutting down");
                    break;
                }
                _ = tokio::time::sleep(Duration::from_secs(10)) => {
                    poll_tick(&app_handle, &state, &client, &semaphore).await;
                }
            }
        }
    });
}

async fn poll_tick(
    app_handle: &AppHandle,
    state: &SharedState,
    client: &Arc<BoltzClient>,
    semaphore: &Arc<Semaphore>,
) {
    // Lock → collect in-progress compounds + check timeouts → drop lock
    let (compounds, api_key) = {
        let mut guard = state.lock().await;
        let api_key = match &guard.data.api_key {
            Some(k) if !k.is_empty() => k.clone(),
            _ => return, // no API key configured
        };

        let mut refs = guard.data.all_compounds_in_progress();

        // D6: Check for timed-out compounds
        let now = Utc::now();
        let mut timed_out = Vec::new();
        refs.retain(|r| {
            let elapsed = now.signed_duration_since(r.submitted_at);
            if elapsed > chrono::Duration::from_std(POLL_TIMEOUT).unwrap_or(chrono::Duration::hours(2)) {
                timed_out.push(r.clone());
                false
            } else {
                true
            }
        });

        // Mark timed-out compounds
        for r in &timed_out {
            if let Some(compound) = guard.data.find_compound_mut(r.compound_id) {
                compound.status = JobStatus::TimedOut;
                compound.completed_at = Some(now);
                compound.error_message = Some("Prediction timed out after 2 hours".into());
            }
            guard.dirty = true;
        }

        // Check run completion for timed-out compounds
        // A8: Deduplicate by tracking checked run_ids
        let mut run_events = Vec::new();
        let mut checked_run_ids = std::collections::HashSet::new();
        for r in &timed_out {
            if checked_run_ids.contains(&r.run_id) {
                continue;
            }
            checked_run_ids.insert(r.run_id);
            if let Some(evt) = guard.data.check_run_completion(r.run_id) {
                if let Some(run) = guard.data.find_run_mut(r.run_id) {
                    run.completed_at = Some(now);
                }
                run_events.push(evt);
            }
        }

        let persist_needed = !timed_out.is_empty();
        let root_for_persist = guard.root_dir.clone();
        let data_for_persist = guard.data.clone();

        let timeout_events: Vec<_> = timed_out
            .iter()
            .map(|r| CompoundStatusEvent {
                compound_id: r.compound_id,
                run_id: r.run_id,
                campaign_id: r.campaign_id,
                status: JobStatus::TimedOut,
                metrics: None,
                completed_at: Some(now),
            })
            .collect();

        drop(guard);

        // Persist outside lock — data was cloned above
        if persist_needed {
            if let Err(e) = tokio::task::spawn_blocking(move || {
                storage::persist_state(&root_for_persist, &data_for_persist)
            })
            .await
            .unwrap_or_else(|e| Err(crate::models::AppError::Other(format!("Persist task panicked: {e}"))))
            {
                error!("Failed to persist timeout state: {e}");
            }
        }

        // Emit events outside lock
        for evt in timeout_events {
            let _ = app_handle.emit("compound-status-changed", &evt);
        }
        for evt in run_events {
            let _ = app_handle.emit("run-completed", &evt);
        }

        (refs, api_key)
    };

    if compounds.is_empty() {
        return;
    }

    info!("Polling {} in-progress compounds", compounds.len());

    // D3: Spawn bounded poll tasks via semaphore
    let mut handles = Vec::new();
    for compound_ref in compounds {
        let permit = semaphore.clone().acquire_owned().await;
        let permit = match permit {
            Ok(p) => p,
            Err(_) => {
                warn!("Semaphore closed");
                break;
            }
        };

        let app = app_handle.clone();
        let state = state.clone();
        let client = client.clone();
        let api_key = api_key.clone();

        handles.push(tokio::spawn(async move {
            poll_compound(&app, &state, &client, &api_key, compound_ref).await;
            drop(permit);
        }));
    }

    // Wait for all poll tasks to complete
    for handle in handles {
        let _ = handle.await;
    }
}

async fn poll_compound(
    app_handle: &AppHandle,
    state: &SharedState,
    client: &Arc<BoltzClient>,
    api_key: &str,
    compound_ref: CompoundRef,
) {
    let prediction = match client
        .get_prediction_status(api_key, &compound_ref.boltz_job_id)
        .await
    {
        Ok(p) => p,
        Err(e) => {
            warn!(
                "Failed to poll compound {}: {e}",
                compound_ref.compound_id
            );
            return;
        }
    };

    let api_status = prediction.prediction_status.to_uppercase();

    match api_status.as_str() {
        "COMPLETED" => {
            let metrics = match boltz::parse_metrics(&prediction) {
                Ok(m) => m,
                Err(e) => {
                    warn!("Failed to parse metrics for {}: {e}", compound_ref.compound_id);
                    on_compound_failed(
                        app_handle,
                        state,
                        &compound_ref,
                        JobStatus::Failed,
                        &format!("Failed to parse metrics: {e}"),
                    )
                    .await;
                    return;
                }
            };

            on_compound_completed(app_handle, state, client, &compound_ref, metrics, &prediction)
                .await;
        }
        "FAILED" => {
            let desc = prediction
                .prediction_stage_description
                .as_deref()
                .unwrap_or("Unknown error");
            on_compound_failed(
                app_handle,
                state,
                &compound_ref,
                JobStatus::Failed,
                desc,
            )
            .await;
        }
        "RUNNING" | "CREATED" | "PENDING" => {
            // Update status in state if it changed
            let new_status = match api_status.as_str() {
                "RUNNING" => JobStatus::Running,
                "CREATED" => JobStatus::Created,
                _ => JobStatus::Pending,
            };

            let changed = {
                let mut guard = state.lock().await;
                if let Some(compound) = guard.data.find_compound_mut(compound_ref.compound_id) {
                    if compound.status != new_status {
                        compound.status = new_status;
                        guard.dirty = true;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };

            if changed {
                let _ = app_handle.emit(
                    "compound-status-changed",
                    &CompoundStatusEvent {
                        compound_id: compound_ref.compound_id,
                        run_id: compound_ref.run_id,
                        campaign_id: compound_ref.campaign_id,
                        status: new_status,
                        metrics: None,
                        completed_at: None,
                    },
                );
            }
        }
        _ => {
            warn!(
                "Unknown prediction status '{}' for {}",
                api_status, compound_ref.compound_id
            );
        }
    }
}

async fn on_compound_completed(
    app_handle: &AppHandle,
    state: &SharedState,
    client: &Arc<BoltzClient>,
    compound_ref: &CompoundRef,
    metrics: crate::models::CompoundMetrics,
    prediction: &crate::models::PredictionStatus,
) {
    let now = Utc::now();

    // Lock → mutate → check run completion → clone for persist → drop lock → persist → emit
    let (root_for_persist, data_for_persist, status_event, run_event, download_url) = {
        let mut guard = state.lock().await;

        if let Some(compound) = guard.data.find_compound_mut(compound_ref.compound_id) {
            compound.status = JobStatus::Completed;
            compound.completed_at = Some(now);
            compound.metrics = Some(metrics.clone());
            guard.dirty = true;
        }

        // Check if run is now complete (called while lock is held — see plan D1)
        let run_event = guard.data.check_run_completion(compound_ref.run_id);
        if run_event.is_some() {
            if let Some(run) = guard.data.find_run_mut(compound_ref.run_id) {
                run.completed_at = Some(now);
            }
        }

        let root_for_persist = guard.root_dir.clone();
        let data_for_persist = guard.data.clone();

        let status_event = CompoundStatusEvent {
            compound_id: compound_ref.compound_id,
            run_id: compound_ref.run_id,
            campaign_id: compound_ref.campaign_id,
            status: JobStatus::Completed,
            metrics: Some(metrics),
            completed_at: Some(now),
        };

        let download_url = prediction
            .prediction_results
            .as_ref()
            .and_then(|r| r.output.as_ref())
            .and_then(|o| o.download_url.clone());

        (root_for_persist, data_for_persist, status_event, run_event, download_url)
    };

    // Persist outside lock — data was cloned above, so disk write doesn't block other tasks
    if let Err(e) = tokio::task::spawn_blocking(move || {
        storage::persist_state(&root_for_persist, &data_for_persist)
    })
    .await
    .unwrap_or_else(|e| Err(crate::models::AppError::Other(format!("Persist task panicked: {e}"))))
    {
        error!("Failed to persist completed state: {e}");
    }

    // Emit events outside lock
    let _ = app_handle.emit("compound-status-changed", &status_event);
    if let Some(evt) = run_event {
        let _ = app_handle.emit("run-completed", &evt);
    }

    // Spawn download task — A2: pass the injected client for retry + connection pooling
    if let Some(url) = download_url {
        let app = app_handle.clone();
        let state = state.clone();
        let client_clone = client.clone();
        let compound_clone = compound_ref.clone();
        tokio::spawn(download_and_store(
            app,
            state,
            client_clone,
            url,
            compound_clone,
        ));
    } else {
        // No download URL yet — retry after 30s via the recovery path
        warn!(
            "No download URL for completed compound {}, scheduling retry",
            compound_ref.compound_id
        );
        let app = app_handle.clone();
        let state = state.clone();
        let client_clone = client.clone();
        let compound_clone = compound_ref.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            recover_incomplete_downloads(app, state, client_clone, vec![compound_clone]).await;
        });
    }
}

async fn on_compound_failed(
    app_handle: &AppHandle,
    state: &SharedState,
    compound_ref: &CompoundRef,
    final_status: JobStatus,
    error_msg: &str,
) {
    let now = Utc::now();

    let (root_for_persist, data_for_persist, run_event) = {
        let mut guard = state.lock().await;

        if let Some(compound) = guard.data.find_compound_mut(compound_ref.compound_id) {
            compound.status = final_status;
            compound.completed_at = Some(now);
            compound.error_message = Some(error_msg.to_string());
            guard.dirty = true;
        }

        let run_event = guard.data.check_run_completion(compound_ref.run_id);
        if run_event.is_some() {
            if let Some(run) = guard.data.find_run_mut(compound_ref.run_id) {
                run.completed_at = Some(now);
            }
        }

        let root_for_persist = guard.root_dir.clone();
        let data_for_persist = guard.data.clone();
        (root_for_persist, data_for_persist, run_event)
    };

    // Persist outside lock — data was cloned above, so disk write doesn't block other tasks
    if let Err(e) = tokio::task::spawn_blocking(move || {
        storage::persist_state(&root_for_persist, &data_for_persist)
    })
    .await
    .unwrap_or_else(|e| Err(crate::models::AppError::Other(format!("Persist task panicked: {e}"))))
    {
        error!("Failed to persist failed state: {e}");
    }

    let _ = app_handle.emit(
        "compound-status-changed",
        &CompoundStatusEvent {
            compound_id: compound_ref.compound_id,
            run_id: compound_ref.run_id,
            campaign_id: compound_ref.campaign_id,
            status: final_status,
            metrics: None,
            completed_at: Some(now),
        },
    );

    if let Some(evt) = run_event {
        let _ = app_handle.emit("run-completed", &evt);
    }
}

/// Set download_error on a compound without changing its status.
/// The compound stays Completed so scan_incomplete_downloads can recover it.
async fn set_download_error(state: &SharedState, compound_id: uuid::Uuid, error_msg: &str) {
    let mut guard = state.lock().await;
    if let Some(compound) = guard.data.find_compound_mut(compound_id) {
        compound.download_error = Some(error_msg.to_string());
        guard.dirty = true;
    }
}

/// D5: Download + extract + move under lock for path safety.
/// A2: Uses injected BoltzClient for retry + connection pooling.
/// A14: create_dir_all runs outside the lock; only rename is under lock.
///
/// On failure, sets download_error instead of overwriting status to Failed.
/// This preserves the Completed status so that:
///   1. scan_incomplete_downloads can recover the download on restart
///   2. retry_compound doesn't re-submit the (already-completed) prediction
async fn download_and_store(
    app_handle: AppHandle,
    state: SharedState,
    client: Arc<BoltzClient>,
    download_url: String,
    compound_ref: CompoundRef,
) {
    let root_dir = {
        let guard = state.lock().await;
        guard.root_dir.clone()
    };

    // 1. Download tar.gz (no lock needed) — A2: uses shared client with retry
    let bytes = match client.download_tar_gz(&download_url).await {
        Ok(b) => b,
        Err(e) => {
            error!(
                "Failed to download compound {}: {e}",
                compound_ref.compound_id
            );
            set_download_error(&state, compound_ref.compound_id, &format!("Download failed: {e}")).await;
            return;
        }
    };

    // 2. Extract to .boltz-temp/{compound_id}/ (no lock needed)
    // D5: .boltz-temp/ under root_dir ensures same-volume rename
    let temp_dir = root_dir
        .join(".boltz-temp")
        .join(compound_ref.compound_id.to_string());

    if let Err(e) = boltz::extract_tar_gz(bytes, temp_dir.clone()).await {
        error!(
            "Failed to extract compound {}: {e}",
            compound_ref.compound_id
        );
        set_download_error(&state, compound_ref.compound_id, &format!("Extraction failed: {e}")).await;
        return;
    }

    // D9: Validate extraction
    if let Err(e) = boltz::validate_extraction(&temp_dir) {
        error!(
            "Extraction validation failed for {}: {e}",
            compound_ref.compound_id
        );
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        set_download_error(&state, compound_ref.compound_id, &format!("Extraction validation failed: {e}")).await;
        return;
    }

    // A14: Resolve path first (brief lock), create parent dirs outside lock,
    // then re-lock for atomic rename to handle concurrent renames (D5).
    let pre_dest = {
        let guard = state.lock().await;
        match storage::resolve_compound_path(&guard.data, compound_ref.compound_id) {
            Ok(relative) => root_dir.join(&relative),
            Err(e) => {
                error!("Failed to resolve path for {}: {e}", compound_ref.compound_id);
                drop(guard);
                set_download_error(&state, compound_ref.compound_id, &format!("Failed to resolve output path: {e}")).await;
                return;
            }
        }
    };

    // Create parent directories outside lock (idempotent, no state mutation)
    if let Err(e) = tokio::fs::create_dir_all(pre_dest.parent().unwrap_or(&root_dir)).await {
        error!("Failed to create parent dir: {e}");
        set_download_error(&state, compound_ref.compound_id, &format!("Failed to create output directory: {e}")).await;
        return;
    }

    // Re-lock for atomic path resolve + rename (D5: handles concurrent renames).
    let dest = {
        let guard = state.lock().await;
        match storage::resolve_compound_path(&guard.data, compound_ref.compound_id) {
            Ok(relative) => {
                let dest = root_dir.join(&relative);
                // Rename is atomic on APFS (~microseconds) — safe to hold lock briefly
                match tokio::fs::rename(&temp_dir, &dest).await {
                    Ok(()) => Some(dest),
                    Err(e) => {
                        error!(
                            "Failed to move compound files from {} to {}: {e}",
                            temp_dir.display(),
                            dest.display()
                        );
                        None
                    }
                }
            }
            Err(e) => {
                error!("Failed to resolve path for {}: {e}", compound_ref.compound_id);
                None
            }
        }
    };

    let dest = match dest {
        Some(d) => d,
        None => {
            set_download_error(&state, compound_ref.compound_id, "Failed to store compound files on disk").await;
            return;
        }
    };

    // Success — clear any previous download error
    {
        let mut guard = state.lock().await;
        if let Some(compound) = guard.data.find_compound_mut(compound_ref.compound_id) {
            compound.download_error = None;
            guard.dirty = true;
        }
    }

    info!(
        "Compound {} files stored at {}",
        compound_ref.compound_id,
        dest.display()
    );

    let _ = app_handle.emit(
        "compound-files-ready",
        &CompoundFilesReadyEvent {
            compound_id: compound_ref.compound_id,
            run_id: compound_ref.run_id,
        },
    );
}

/// Recover incomplete downloads on startup. Re-polls for fresh download URLs.
pub async fn recover_incomplete_downloads(
    app_handle: AppHandle,
    state: SharedState,
    client: Arc<BoltzClient>,
    compounds: Vec<CompoundRef>,
) {
    if compounds.is_empty() {
        return;
    }

    info!(
        "Recovering {} incomplete downloads",
        compounds.len()
    );

    let api_key = {
        let guard = state.lock().await;
        guard.data.api_key.clone().unwrap_or_default()
    };

    if api_key.is_empty() {
        warn!("No API key configured, skipping download recovery");
        return;
    }

    for compound_ref in compounds {
        // Re-poll for a fresh download URL
        match client
            .get_prediction_status(&api_key, &compound_ref.boltz_job_id)
            .await
        {
            Ok(prediction) => {
                if let Some(url) = prediction
                    .prediction_results
                    .as_ref()
                    .and_then(|r| r.output.as_ref())
                    .and_then(|o| o.download_url.clone())
                {
                    download_and_store(
                        app_handle.clone(),
                        state.clone(),
                        client.clone(),
                        url,
                        compound_ref,
                    )
                    .await;
                }
            }
            Err(e) => {
                warn!(
                    "Failed to re-poll for download recovery {}: {e}",
                    compound_ref.compound_id
                );
            }
        }
    }
}

