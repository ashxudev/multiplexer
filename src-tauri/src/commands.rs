use crate::boltz::{self, BoltzClient};
use crate::models::*;
use crate::storage;
use chrono::Utc;
use log::error;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Semaphore;
use uuid::Uuid;

/// Persist state on a blocking thread to avoid stalling the Tokio executor.
async fn persist_state_async(root: PathBuf, data: AppData) -> AppResult<()> {
    tokio::task::spawn_blocking(move || storage::persist_state(&root, &data))
        .await
        .map_err(|e| AppError::Other(format!("Persist task panicked: {e}")))?
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct SettingsResponse {
    pub api_key: Option<String>,
    pub root_dir: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, SharedState>) -> Result<SettingsResponse, AppError> {
    let guard = state.lock().await;
    Ok(SettingsResponse {
        api_key: guard.data.api_key.clone(),
        root_dir: guard.root_dir.to_string_lossy().to_string(),
    })
}

/// A6: Don't hold Mutex across async I/O (create_dir_all, write_root_dir).
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, SharedState>,
    api_key: Option<String>,
    root_dir: Option<String>,
) -> Result<(), AppError> {
    // Validate and save API key under lock, but defer root_dir assignment
    // until after I/O succeeds to avoid corrupting in-memory state on failure.
    let new_root_path = root_dir.map(std::path::PathBuf::from);
    if let Some(ref path) = new_root_path {
        if !path.is_absolute() {
            return Err(AppError::Other("Workspace directory must be an absolute path".into()));
        }
        if path.exists() && !path.is_dir() {
            return Err(AppError::Other("Workspace path exists but is not a directory".into()));
        }
    }

    // I/O first — before committing any state changes.
    // Both api_key and root_dir are deferred until after I/O succeeds,
    // so a failed create_dir_all doesn't leave a partial mutation in state.
    if let Some(ref path) = new_root_path {
        tokio::fs::create_dir_all(path).await?;
        crate::prefs::write_root_dir(&app, path)?;
    }

    // Single lock: commit both api_key and root_dir after I/O succeeded
    let (data, root) = {
        let mut guard = state.lock().await;
        if let Some(key) = api_key {
            guard.data.api_key = Some(key);
        }
        if let Some(ref path) = new_root_path {
            guard.root_dir = path.clone();
        }
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, SharedState>,
    client: State<'_, Arc<BoltzClient>>,
) -> Result<bool, AppError> {
    let api_key = {
        let guard = state.lock().await;
        guard
            .data
            .api_key
            .clone()
            .ok_or_else(|| AppError::Other("No API key configured".into()))?
    };

    client.test_connection(&api_key).await
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_campaigns(state: State<'_, SharedState>) -> Result<Vec<Campaign>, AppError> {
    let guard = state.lock().await;
    Ok(guard.data.campaigns.clone())
}

/// A11: Ensure folder name uniqueness by appending suffix on collision.
fn unique_folder_name(base: &str, existing: &[&str]) -> String {
    let mut name = base.to_string();
    let mut suffix = 2;
    while existing.contains(&name.as_str()) {
        name = format!("{base}-{suffix}");
        suffix += 1;
    }
    name
}

#[tauri::command]
pub async fn create_campaign(
    state: State<'_, SharedState>,
    display_name: String,
    protein_sequence: String,
    description: Option<String>,
) -> Result<Campaign, AppError> {
    let base_folder = sanitise_folder_name(&display_name);

    let (campaign, data, root) = {
        let mut guard = state.lock().await;
        // A11: Check for folder name collisions
        let existing: Vec<&str> = guard.data.campaigns.iter()
            .map(|c| c.folder_name.as_str()).collect();
        let folder_name = unique_folder_name(&base_folder, &existing);

        let campaign = Campaign {
            id: Uuid::new_v4(),
            display_name,
            folder_name,
            protein_sequence,
            description,
            archived: false,
            archived_at: None,
            created_at: Utc::now(),
            runs: Vec::new(),
        };
        guard.data.campaigns.push(campaign.clone());
        guard.dirty = true;
        (campaign, guard.data.clone(), guard.root_dir.clone())
    };

    storage::create_campaign_folder(&root, &campaign.folder_name).await?;
    persist_state_async(root, data).await?;
    Ok(campaign)
}

#[tauri::command]
pub async fn rename_campaign(
    state: State<'_, SharedState>,
    campaign_id: Uuid,
    new_name: String,
) -> Result<(), AppError> {
    let new_folder = sanitise_folder_name(&new_name);

    // First lock: compute unique folder name, update display_name only.
    // folder_name is deferred until after the disk rename succeeds to avoid
    // state-disk inconsistency if rename_folder fails.
    let (root, old_folder, final_folder) = {
        let mut guard = state.lock().await;
        let existing: Vec<&str> = guard.data.campaigns.iter()
            .filter(|c| c.id != campaign_id)
            .map(|c| c.folder_name.as_str())
            .collect();
        let unique = unique_folder_name(&new_folder, &existing);

        let campaign = guard
            .data
            .find_campaign_mut(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        let old_folder = campaign.folder_name.clone();
        campaign.display_name = new_name;
        (guard.root_dir.clone(), old_folder, unique)
    };

    // Disk rename outside lock
    if old_folder != final_folder {
        storage::rename_folder(&root.join(&old_folder), &root.join(&final_folder)).await?;
    }

    // Second lock: commit folder_name only after rename succeeded
    let (data, root) = {
        let mut guard = state.lock().await;
        let campaign = guard
            .data
            .find_campaign_mut(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        campaign.folder_name = final_folder;
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

#[tauri::command]
pub async fn archive_campaign(
    state: State<'_, SharedState>,
    campaign_id: Uuid,
) -> Result<(), AppError> {
    let (data, root) = {
        let mut guard = state.lock().await;
        let campaign = guard
            .data
            .find_campaign_mut(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        campaign.archived = true;
        campaign.archived_at = Some(Utc::now());
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

#[tauri::command]
pub async fn unarchive_campaign(
    state: State<'_, SharedState>,
    campaign_id: Uuid,
) -> Result<(), AppError> {
    let (data, root) = {
        let mut guard = state.lock().await;
        let campaign = guard
            .data
            .find_campaign_mut(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        campaign.archived = false;
        campaign.archived_at = None;
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
pub struct CompoundInput {
    pub name: String,
    pub smiles: String,
}

#[tauri::command]
pub async fn create_run(
    app: AppHandle,
    state: State<'_, SharedState>,
    client: State<'_, Arc<BoltzClient>>,
    campaign_id: Uuid,
    display_name: String,
    compounds: Vec<CompoundInput>,
    params: RunParams,
) -> Result<Run, AppError> {
    let base_folder = sanitise_folder_name(&display_name);

    // Get protein sequence, API key, and unique folder name
    let (protein_sequence, api_key, root, folder_name) = {
        let guard = state.lock().await;
        let campaign = guard
            .data
            .find_campaign(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        let seq = campaign.protein_sequence.clone();
        let key = guard
            .data
            .api_key
            .clone()
            .ok_or_else(|| AppError::Other("No API key configured".into()))?;
        // A11: Ensure run folder name is unique within campaign
        let existing_run_folders: Vec<&str> = campaign.runs.iter()
            .map(|r| r.folder_name.as_str()).collect();
        let folder = unique_folder_name(&base_folder, &existing_run_folders);
        (seq, key, guard.root_dir.clone(), folder)
    };

    // Build compound structs with A11 unique folder names
    let mut compound_folder_names: Vec<String> = Vec::new();
    let compound_structs: Vec<Compound> = compounds
        .iter()
        .map(|c| {
            let base = sanitise_folder_name(&c.name);
            let existing: Vec<&str> = compound_folder_names.iter().map(|s| s.as_str()).collect();
            let folder_name = unique_folder_name(&base, &existing);
            compound_folder_names.push(folder_name.clone());
            Compound {
                id: Uuid::new_v4(),
                display_name: c.name.clone(),
                folder_name,
                smiles: c.smiles.clone(),
                boltz_job_id: None,
                status: JobStatus::Pending,
                submitted_at: None,
                completed_at: None,
                metrics: None,
                error_message: None,
                download_error: None,
            }
        })
        .collect();

    let run = Run {
        id: Uuid::new_v4(),
        display_name: display_name.clone(),
        folder_name: folder_name.clone(),
        archived: false,
        archived_at: None,
        params: params.clone(),
        created_at: Utc::now(),
        completed_at: None,
        compounds: compound_structs.clone(),
    };

    // Save run to state and create folder
    {
        let mut guard = state.lock().await;
        let campaign = guard
            .data
            .find_campaign_mut(campaign_id)
            .ok_or_else(|| AppError::NotFound("Campaign not found".into()))?;
        let campaign_folder = campaign.folder_name.clone();
        campaign.runs.push(run.clone());
        guard.dirty = true;

        let data = guard.data.clone();
        let root_owned = root.clone();
        drop(guard);

        storage::create_run_folder(&root, &campaign_folder, &folder_name).await?;
        persist_state_async(root_owned, data).await?;
    }

    // Return the run immediately (all compounds in Pending state).
    // The frontend's useTauriEvents listener will update compound statuses live
    // as each submission completes via compound-status-changed events.
    let run_snapshot = run.clone();

    // D7: Spawn background task to submit compounds with bounded concurrency (5 permits).
    // This avoids blocking the UI for the entire batch submission.
    let state_owned = state.inner().clone();
    let client_owned = client.inner().clone();
    tokio::spawn(async move {
        let semaphore = Arc::new(Semaphore::new(5));
        let mut handles = Vec::new();

        for (idx, compound_input) in compounds.iter().enumerate() {
            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => {
                    error!("Submission semaphore closed");
                    break;
                }
            };

            let app_clone = app.clone();
            let state_clone = state_owned.clone();
            let client_clone = client_owned.clone();
            let api_key_clone = api_key.clone();
            let protein_seq = protein_sequence.clone();
            let compound_id = compound_structs[idx].id;
            let smiles = compound_input.smiles.clone();
            let params_clone = params.clone();
            let run_id = run.id;
            let campaign_id_clone = campaign_id;

            handles.push(tokio::spawn(async move {
                let result = submit_single_compound(
                    &client_clone,
                    &api_key_clone,
                    &protein_seq,
                    &smiles,
                    &params_clone,
                )
                .await;

                let now = Utc::now();
                let mut guard = state_clone.lock().await;

                match result {
                    Ok(resp) => {
                        if let Some(compound) = guard.data.find_compound_mut(compound_id) {
                            compound.boltz_job_id = Some(resp.prediction_id);
                            compound.status = JobStatus::Created;
                            compound.submitted_at = Some(now);
                        }
                        guard.dirty = true;

                        let _ = app_clone.emit(
                            "compound-status-changed",
                            &CompoundStatusEvent {
                                compound_id,
                                run_id,
                                campaign_id: campaign_id_clone,
                                status: JobStatus::Created,
                                metrics: None,
                                completed_at: None,
                            },
                        );
                    }
                    Err(e) => {
                        error!("Failed to submit compound {compound_id}: {e}");
                        if let Some(compound) = guard.data.find_compound_mut(compound_id) {
                            compound.status = JobStatus::Failed;
                            compound.completed_at = Some(now);
                            compound.error_message = Some(e.to_string());
                        }
                        guard.dirty = true;

                        let _ = app_clone.emit(
                            "compound-status-changed",
                            &CompoundStatusEvent {
                                compound_id,
                                run_id,
                                campaign_id: campaign_id_clone,
                                status: JobStatus::Failed,
                                metrics: None,
                                completed_at: Some(now),
                            },
                        );
                    }
                }

                drop(permit);
            }));
        }

        // Wait for all submissions
        for handle in handles {
            let _ = handle.await;
        }

        // Persist final state after all submissions
        {
            let guard = state_owned.lock().await;
            let root = guard.root_dir.clone();
            let data = guard.data.clone();
            drop(guard);
            if let Err(e) = persist_state_async(root, data).await {
                error!("Failed to persist after batch submission: {e}");
            }
        }
    });

    Ok(run_snapshot)
}

async fn submit_single_compound(
    client: &BoltzClient,
    api_key: &str,
    protein_sequence: &str,
    smiles: &str,
    params: &RunParams,
) -> AppResult<SubmitResponse> {
    let input = boltz::build_inference_input(protein_sequence, smiles, "B");
    let options = boltz::build_inference_options(
        params.recycling_steps,
        params.diffusion_samples,
        params.sampling_steps,
        params.step_scale,
    );
    client.submit_prediction(api_key, input, options).await
}

#[tauri::command]
pub async fn get_run(state: State<'_, SharedState>, run_id: Uuid) -> Result<Run, AppError> {
    let guard = state.lock().await;
    guard
        .data
        .find_run(run_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound("Run not found".into()))
}

#[tauri::command]
pub async fn rename_run(
    state: State<'_, SharedState>,
    run_id: Uuid,
    new_name: String,
) -> Result<(), AppError> {
    let new_folder = sanitise_folder_name(&new_name);

    // First lock: compute unique name, read old paths, update display_name only.
    // folder_name is deferred until after the disk rename succeeds.
    let (root, old_folder, campaign_folder, final_folder) = {
        let mut guard = state.lock().await;
        let mut found = None;
        for campaign in &guard.data.campaigns {
            for run in &campaign.runs {
                if run.id == run_id {
                    let siblings: Vec<&str> = campaign.runs.iter()
                        .filter(|r| r.id != run_id)
                        .map(|r| r.folder_name.as_str())
                        .collect();
                    let unique = unique_folder_name(&new_folder, &siblings);
                    found = Some((run.folder_name.clone(), campaign.folder_name.clone(), unique));
                    break;
                }
            }
        }
        let (old_folder, campaign_folder, final_folder) =
            found.ok_or_else(|| AppError::NotFound("Run not found".into()))?;

        let run = guard
            .data
            .find_run_mut(run_id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;
        run.display_name = new_name;
        (guard.root_dir.clone(), old_folder, campaign_folder, final_folder)
    };

    // Disk rename outside lock
    if old_folder != final_folder {
        storage::rename_folder(
            &root.join(&campaign_folder).join(&old_folder),
            &root.join(&campaign_folder).join(&final_folder),
        )
        .await?;
    }

    // Second lock: commit folder_name only after rename succeeded
    let (data, root) = {
        let mut guard = state.lock().await;
        let run = guard
            .data
            .find_run_mut(run_id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;
        run.folder_name = final_folder;
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

#[tauri::command]
pub async fn archive_run(state: State<'_, SharedState>, run_id: Uuid) -> Result<(), AppError> {
    let (data, root) = {
        let mut guard = state.lock().await;
        let run = guard
            .data
            .find_run_mut(run_id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;
        run.archived = true;
        run.archived_at = Some(Utc::now());
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

#[tauri::command]
pub async fn unarchive_run(state: State<'_, SharedState>, run_id: Uuid) -> Result<(), AppError> {
    let (data, root) = {
        let mut guard = state.lock().await;
        let run = guard
            .data
            .find_run_mut(run_id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;
        run.archived = false;
        run.archived_at = None;
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone())
    };

    persist_state_async(root, data).await?;
    Ok(())
}

/// D10: Cancel all non-terminal compounds in a run.
/// A7: Use check_run_completion instead of manually setting completed_at.
#[tauri::command]
pub async fn cancel_run(
    app: AppHandle,
    state: State<'_, SharedState>,
    run_id: Uuid,
) -> Result<(), AppError> {
    let now = Utc::now();
    let (data, root, compound_events, run_event) = {
        let mut guard = state.lock().await;
        let mut compound_events = Vec::new();

        // Find campaign_id for this run
        let campaign_id = guard
            .data
            .campaigns
            .iter()
            .find(|c| c.runs.iter().any(|r| r.id == run_id))
            .map(|c| c.id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;

        let run = guard
            .data
            .find_run_mut(run_id)
            .ok_or_else(|| AppError::NotFound("Run not found".into()))?;

        for compound in &mut run.compounds {
            if !compound.status.is_terminal() {
                compound.status = JobStatus::Cancelled;
                compound.completed_at = Some(now);
                compound_events.push(CompoundStatusEvent {
                    compound_id: compound.id,
                    run_id,
                    campaign_id,
                    status: JobStatus::Cancelled,
                    metrics: None,
                    completed_at: Some(now),
                });
            }
        }

        // A7: Use check_run_completion to correctly determine if run is complete
        let run_event = if !compound_events.is_empty() {
            guard.dirty = true;
            let evt = guard.data.check_run_completion(run_id);
            if evt.is_some() {
                if let Some(run) = guard.data.find_run_mut(run_id) {
                    run.completed_at = Some(now);
                }
            }
            evt
        } else {
            None
        };

        (guard.data.clone(), guard.root_dir.clone(), compound_events, run_event)
    };

    if !compound_events.is_empty() {
        persist_state_async(root, data).await?;
        for evt in compound_events {
            let _ = app.emit("compound-status-changed", &evt);
        }
        if let Some(evt) = run_event {
            let _ = app.emit("run-completed", &evt);
        }
    }
    Ok(())
}

/// Retry a single failed compound by re-submitting it.
/// A13: Capture run_id/campaign_id from first lock instead of Uuid::nil() sentinel.
#[tauri::command]
pub async fn retry_compound(
    app: AppHandle,
    state: State<'_, SharedState>,
    client: State<'_, Arc<BoltzClient>>,
    compound_id: Uuid,
) -> Result<(), AppError> {
    // Single lock to extract all context + reset compound state
    let (api_key, protein_sequence, smiles, params, run_id, campaign_id) = {
        let mut guard = state.lock().await;
        let api_key = guard
            .data
            .api_key
            .clone()
            .ok_or_else(|| AppError::Other("No API key configured".into()))?;

        let (campaign, run, compound) = guard
            .data
            .find_compound_context(compound_id)
            .ok_or_else(|| AppError::NotFound("Compound not found".into()))?;

        if !compound.status.is_terminal() {
            return Err(AppError::Other("Compound is not in a terminal state".into()));
        }

        let ctx = (
            api_key,
            campaign.protein_sequence.clone(),
            compound.smiles.clone(),
            run.params.clone(),
            run.id,
            campaign.id,
        );

        // Reset compound state for retry
        if let Some(compound) = guard.data.find_compound_mut(compound_id) {
            compound.status = JobStatus::Pending;
            compound.boltz_job_id = None;
            compound.submitted_at = None; // Reset for D6 timeout
            compound.completed_at = None;
            compound.metrics = None;
            compound.error_message = None;
            compound.download_error = None;
        }
        guard.dirty = true;

        ctx
    };

    // Submit outside lock
    let result = submit_single_compound(&client, &api_key, &protein_sequence, &smiles, &params).await;

    let now = Utc::now();
    let (data, root, status, completed_at) = {
        let mut guard = state.lock().await;
        let (status, completed_at) = match result {
            Ok(resp) => {
                if let Some(compound) = guard.data.find_compound_mut(compound_id) {
                    compound.boltz_job_id = Some(resp.prediction_id);
                    compound.status = JobStatus::Created;
                    compound.submitted_at = Some(now);
                }
                (JobStatus::Created, None)
            }
            Err(e) => {
                if let Some(compound) = guard.data.find_compound_mut(compound_id) {
                    compound.status = JobStatus::Failed;
                    compound.completed_at = Some(now);
                    compound.error_message = Some(e.to_string());
                }
                (JobStatus::Failed, Some(now))
            }
        };
        guard.dirty = true;
        (guard.data.clone(), guard.root_dir.clone(), status, completed_at)
    };

    persist_state_async(root, data).await?;

    let _ = app.emit(
        "compound-status-changed",
        &CompoundStatusEvent {
            compound_id,
            run_id,
            campaign_id,
            status,
            metrics: None,
            completed_at,
        },
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Compounds
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_compound(
    state: State<'_, SharedState>,
    compound_id: Uuid,
) -> Result<Compound, AppError> {
    let guard = state.lock().await;
    guard
        .data
        .find_compound(compound_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound("Compound not found".into()))
}

/// Read CIF file contents from disk.
#[tauri::command]
pub async fn get_pose_cif(
    state: State<'_, SharedState>,
    compound_id: Uuid,
    sample_index: usize,
) -> Result<String, AppError> {
    let (root, relative) = {
        let guard = state.lock().await;
        let relative = storage::resolve_compound_path(&guard.data, compound_id)?;
        (guard.root_dir.clone(), relative)
    };

    let cif_path = root
        .join(&relative)
        .join(format!("sample_{sample_index}_structure.cif"));

    tokio::fs::read_to_string(&cif_path)
        .await
        .map_err(|e| AppError::Io(e))
}

/// Return absolute path for PAE image (frontend uses convertFileSrc).
#[tauri::command]
pub async fn get_pae_image_path(
    state: State<'_, SharedState>,
    compound_id: Uuid,
    sample_index: usize,
) -> Result<String, AppError> {
    let guard = state.lock().await;
    let relative = storage::resolve_compound_path(&guard.data, compound_id)?;
    let path = guard
        .root_dir
        .join(&relative)
        .join(format!("sample_{sample_index}_pae.png"));
    Ok(path.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn open_in_finder(
    state: State<'_, SharedState>,
    compound_id: Uuid,
) -> Result<(), AppError> {
    let guard = state.lock().await;
    let relative = storage::resolve_compound_path(&guard.data, compound_id)?;
    let path = guard.root_dir.join(&relative);
    drop(guard);

    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to open Finder: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn open_structure_external(
    state: State<'_, SharedState>,
    compound_id: Uuid,
    sample_index: usize,
) -> Result<(), AppError> {
    let guard = state.lock().await;
    let relative = storage::resolve_compound_path(&guard.data, compound_id)?;
    let path = guard
        .root_dir
        .join(&relative)
        .join(format!("sample_{sample_index}_structure.cif"));
    drop(guard);

    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to open file: {e}")))?;
    Ok(())
}
