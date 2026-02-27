use crate::models::{AppData, AppError, AppResult, AppState, CompoundRef, JobStatus, SharedState};
use log::{error, info, warn};
use std::path::{Path, PathBuf};
use tokio::task::JoinHandle;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Load / persist state.json
// ---------------------------------------------------------------------------

/// Load state from `{root_dir}/state.json`, creating defaults if missing.
/// Also creates `state.json.bak` for crash recovery (D8).
pub fn load_state(root_dir: &Path) -> AppResult<AppState> {
    std::fs::create_dir_all(root_dir)?;

    let state_path = root_dir.join("state.json");

    let data = if state_path.exists() {
        // D8: backup before making any changes
        let bak_path = root_dir.join("state.json.bak");
        if let Err(e) = std::fs::copy(&state_path, &bak_path) {
            warn!("Failed to create state.json backup: {e}");
        }

        let content = std::fs::read_to_string(&state_path)?;
        serde_json::from_str(&content)?
    } else {
        AppData::default()
    };

    Ok(AppState {
        data,
        dirty: false,
        root_dir: root_dir.to_path_buf(),
    })
}

/// Atomic write: serialize → `.state.json.tmp` → rename.
/// Takes a cloned `AppData` so it can be called outside the lock (D1).
pub fn persist_state(root_dir: &Path, data: &AppData) -> AppResult<()> {
    let state_path = root_dir.join("state.json");
    let tmp_path = root_dir.join(".state.json.tmp");

    let content = serde_json::to_string_pretty(data)?;
    std::fs::write(&tmp_path, &content)?;
    std::fs::rename(&tmp_path, &state_path)?;

    Ok(())
}

/// D2: Spawns a 2-second interval flusher. If `dirty` is set, clones data,
/// resets the flag, drops the lock, then persists via spawn_blocking.
pub fn start_persistence_flusher(state: SharedState) -> JoinHandle<()> {
    tokio::spawn(async move {
        // A10: Skip the t=0 tick — start after the first 2-second delay
        let start = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        let mut interval = tokio::time::interval_at(start, std::time::Duration::from_secs(2));
        loop {
            interval.tick().await;

            let (should_persist, data_clone, root_dir) = {
                let mut guard = state.lock().await;
                if guard.dirty {
                    guard.dirty = false;
                    let clone = guard.data.clone();
                    let root = guard.root_dir.clone();
                    (true, Some(clone), Some(root))
                } else {
                    (false, None, None)
                }
            };

            if should_persist {
                if let (Some(data), Some(root)) = (data_clone, root_dir) {
                    // A10: Use spawn_blocking to avoid blocking the async executor
                    match tokio::task::spawn_blocking(move || persist_state(&root, &data)).await {
                        Ok(Err(e)) => error!("Persistence flusher failed: {e}"),
                        Err(e) => error!("Persistence flusher task panicked: {e}"),
                        _ => {}
                    }
                }
            }
        }
    })
}

// ---------------------------------------------------------------------------
// Folder operations
// ---------------------------------------------------------------------------

pub async fn create_campaign_folder(root: &Path, folder_name: &str) -> AppResult<()> {
    let path = root.join(folder_name);
    tokio::fs::create_dir_all(&path).await?;
    Ok(())
}

pub async fn create_run_folder(
    root: &Path,
    campaign_folder: &str,
    run_folder: &str,
) -> AppResult<()> {
    let path = root.join(campaign_folder).join(run_folder);
    tokio::fs::create_dir_all(&path).await?;
    Ok(())
}

/// A3: Validate that a folder name doesn't contain path traversal characters.
fn validate_folder_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::Other(format!("Invalid folder name: {name}")));
    }
    Ok(())
}

/// Build the full path for a compound's output folder.
/// Returns a relative path from root_dir.
pub fn resolve_compound_path(data: &AppData, compound_id: Uuid) -> AppResult<PathBuf> {
    let (campaign, run, compound) = data
        .find_compound_context(compound_id)
        .ok_or_else(|| AppError::NotFound(format!("Compound {compound_id} not found")))?;

    // A3: Validate folder names to prevent path traversal from tampered state.json
    validate_folder_name(&campaign.folder_name)?;
    validate_folder_name(&run.folder_name)?;
    validate_folder_name(&compound.folder_name)?;

    Ok(PathBuf::from(&campaign.folder_name)
        .join(&run.folder_name)
        .join(&compound.folder_name))
}

pub async fn rename_folder(old: &Path, new: &Path) -> AppResult<()> {
    tokio::fs::rename(old, new).await?;
    Ok(())
}

/// Delete `.boltz-temp/` contents on startup.
pub async fn cleanup_temp_dir(root: &Path) -> AppResult<()> {
    let temp = root.join(".boltz-temp");
    if temp.exists() {
        info!("Cleaning up temp directory: {}", temp.display());
        tokio::fs::remove_dir_all(&temp).await?;
    }
    Ok(())
}

/// Find COMPLETED compounds that are missing their CIF files on disk.
pub fn scan_incomplete_downloads(root_dir: &Path, data: &AppData) -> Vec<CompoundRef> {
    let mut incomplete = Vec::new();
    for campaign in &data.campaigns {
        for run in &campaign.runs {
            for compound in &run.compounds {
                if compound.status == JobStatus::Completed {
                    if let (Some(job_id), Some(submitted_at)) =
                        (&compound.boltz_job_id, compound.submitted_at)
                    {
                        let compound_dir = root_dir
                            .join(&campaign.folder_name)
                            .join(&run.folder_name)
                            .join(&compound.folder_name);
                        let cif_path = compound_dir.join("sample_0_structure.cif");
                        if !cif_path.exists() {
                            incomplete.push(CompoundRef {
                                compound_id: compound.id,
                                boltz_job_id: job_id.clone(),
                                campaign_id: campaign.id,
                                run_id: run.id,
                                submitted_at,
                            });
                        }
                    }
                }
            }
        }
    }
    incomplete
}
