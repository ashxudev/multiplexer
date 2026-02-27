use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

pub type SharedState = Arc<Mutex<AppState>>;

/// Runtime state wrapper — `dirty` is not persisted.
pub struct AppState {
    pub data: AppData,
    pub dirty: bool,
    pub root_dir: std::path::PathBuf,
}

// ---------------------------------------------------------------------------
// Persisted data (state.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub schema_version: u32,
    pub api_key: Option<String>,
    pub campaigns: Vec<Campaign>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: 1,
            api_key: None,
            campaigns: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Campaign {
    pub id: Uuid,
    pub display_name: String,
    pub folder_name: String,
    pub protein_sequence: String,
    pub description: Option<String>,
    pub archived: bool,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub runs: Vec<Run>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: Uuid,
    pub display_name: String,
    pub folder_name: String,
    pub archived: bool,
    pub archived_at: Option<DateTime<Utc>>,
    pub params: RunParams,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub compounds: Vec<Compound>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunParams {
    pub recycling_steps: u32,
    pub diffusion_samples: u32,
    pub sampling_steps: u32,
    pub step_scale: f64,
}

impl Default for RunParams {
    fn default() -> Self {
        Self {
            recycling_steps: 3,
            diffusion_samples: 1,
            sampling_steps: 200,
            step_scale: 1.5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Compound {
    pub id: Uuid,
    pub display_name: String,
    pub folder_name: String,
    pub smiles: String,
    pub boltz_job_id: Option<String>,
    pub status: JobStatus,
    pub submitted_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub metrics: Option<CompoundMetrics>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompoundMetrics {
    pub affinity: AffinityMetrics,
    pub samples: Vec<SampleMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AffinityMetrics {
    pub binding_confidence: f64,
    pub optimization_score: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SampleMetrics {
    pub structure_confidence: Option<f64>,
    pub iptm: Option<f64>,
    pub ligand_iptm: Option<f64>,
    pub complex_plddt: Option<f64>,
    pub ptm: Option<f64>,
    pub protein_iptm: Option<f64>,
    pub complex_iplddt: Option<f64>,
    pub complex_pde: Option<f64>,
    pub complex_ipde: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JobStatus {
    Pending,
    Created,
    Running,
    Completed,
    Failed,
    TimedOut,
    Cancelled,
}

impl JobStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            JobStatus::Completed | JobStatus::Failed | JobStatus::TimedOut | JobStatus::Cancelled
        )
    }
}

// ---------------------------------------------------------------------------
// Lightweight reference for poller (avoids cloning full Compound)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct CompoundRef {
    pub compound_id: Uuid,
    pub boltz_job_id: String,
    pub campaign_id: Uuid,
    pub run_id: Uuid,
    pub submitted_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Preferences (prefs.json — stored in app config dir)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prefs {
    pub root_dir: String,
}

// ---------------------------------------------------------------------------
// Boltz API response types
// ---------------------------------------------------------------------------

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct SubmitResponse {
    pub prediction_id: String,
    pub message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct PredictionListResponse {
    pub predictions: Vec<PredictionStatus>,
    pub total: Option<u64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct PredictionStatus {
    pub prediction_id: String,
    pub prediction_name: Option<String>,
    pub prediction_status: String,
    pub prediction_stage_description: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub prediction_results: Option<PredictionResults>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct PredictionResults {
    pub status: Option<String>,
    pub processing_time_ms: Option<u64>,
    pub output: Option<PredictionOutput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PredictionOutput {
    pub download_url: Option<String>,
    pub metrics: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Tauri event payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct CompoundStatusEvent {
    pub compound_id: Uuid,
    pub run_id: Uuid,
    pub campaign_id: Uuid,
    pub status: JobStatus,
    pub metrics: Option<CompoundMetrics>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompoundFilesReadyEvent {
    pub compound_id: Uuid,
    pub run_id: Uuid,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunCompletedEvent {
    pub run_id: Uuid,
    pub campaign_id: Uuid,
    pub run_name: String,
    pub total_compounds: usize,
    pub completed_count: usize,
    pub failed_count: usize,
    pub timed_out_count: usize,
    pub cancelled_count: usize,
}

// ---------------------------------------------------------------------------
// Helper methods on AppData
// ---------------------------------------------------------------------------

impl AppData {
    pub fn find_compound_mut(&mut self, compound_id: Uuid) -> Option<&mut Compound> {
        for campaign in &mut self.campaigns {
            for run in &mut campaign.runs {
                for compound in &mut run.compounds {
                    if compound.id == compound_id {
                        return Some(compound);
                    }
                }
            }
        }
        None
    }

    pub fn find_compound(&self, compound_id: Uuid) -> Option<&Compound> {
        for campaign in &self.campaigns {
            for run in &campaign.runs {
                for compound in &run.compounds {
                    if compound.id == compound_id {
                        return Some(compound);
                    }
                }
            }
        }
        None
    }

    pub fn find_run_mut(&mut self, run_id: Uuid) -> Option<&mut Run> {
        for campaign in &mut self.campaigns {
            for run in &mut campaign.runs {
                if run.id == run_id {
                    return Some(run);
                }
            }
        }
        None
    }

    pub fn find_run(&self, run_id: Uuid) -> Option<&Run> {
        for campaign in &self.campaigns {
            for run in &campaign.runs {
                if run.id == run_id {
                    return Some(run);
                }
            }
        }
        None
    }

    pub fn find_campaign_mut(&mut self, campaign_id: Uuid) -> Option<&mut Campaign> {
        self.campaigns.iter_mut().find(|c| c.id == campaign_id)
    }

    pub fn find_campaign(&self, campaign_id: Uuid) -> Option<&Campaign> {
        self.campaigns.iter().find(|c| c.id == campaign_id)
    }

    /// Find which campaign and run a compound belongs to.
    pub fn find_compound_context(
        &self,
        compound_id: Uuid,
    ) -> Option<(&Campaign, &Run, &Compound)> {
        for campaign in &self.campaigns {
            for run in &campaign.runs {
                for compound in &run.compounds {
                    if compound.id == compound_id {
                        return Some((campaign, run, compound));
                    }
                }
            }
        }
        None
    }

    /// Collect all in-progress compounds for the poller.
    pub fn all_compounds_in_progress(&self) -> Vec<CompoundRef> {
        let mut refs = Vec::new();
        for campaign in &self.campaigns {
            for run in &campaign.runs {
                for compound in &run.compounds {
                    if !compound.status.is_terminal() {
                        if let (Some(job_id), Some(submitted_at)) =
                            (&compound.boltz_job_id, compound.submitted_at)
                        {
                            refs.push(CompoundRef {
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
        refs
    }

    /// Check if all compounds in a run are terminal. Returns run completion info if so.
    /// Idempotent: returns None if `completed_at` is already set (prevents duplicate events).
    pub fn check_run_completion(&self, run_id: Uuid) -> Option<RunCompletedEvent> {
        for campaign in &self.campaigns {
            for run in &campaign.runs {
                if run.id == run_id {
                    // A8: Guard against duplicate run-completed events
                    if run.completed_at.is_some() {
                        return None;
                    }
                    let all_terminal = run.compounds.iter().all(|c| c.status.is_terminal());
                    if all_terminal && !run.compounds.is_empty() {
                        // A9: Count each terminal status separately
                        let completed_count = run.compounds.iter()
                            .filter(|c| c.status == JobStatus::Completed).count();
                        let failed_count = run.compounds.iter()
                            .filter(|c| c.status == JobStatus::Failed).count();
                        let timed_out_count = run.compounds.iter()
                            .filter(|c| c.status == JobStatus::TimedOut).count();
                        let cancelled_count = run.compounds.iter()
                            .filter(|c| c.status == JobStatus::Cancelled).count();
                        return Some(RunCompletedEvent {
                            run_id: run.id,
                            campaign_id: campaign.id,
                            run_name: run.display_name.clone(),
                            total_compounds: run.compounds.len(),
                            completed_count,
                            failed_count,
                            timed_out_count,
                            cancelled_count,
                        });
                    }
                    return None;
                }
            }
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/// Sanitise a user-provided name into a filesystem-safe folder name.
pub fn sanitise_folder_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase();
    let s = s.trim_matches('-').to_string();
    // Truncate to 200 chars to stay within filesystem limits (255 bytes)
    let s = if s.len() > 200 {
        s[..200].trim_end_matches('-').to_string()
    } else {
        s
    };
    if s.is_empty() {
        "unnamed".to_string()
    } else {
        s
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
