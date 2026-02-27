use crate::models::{
    AffinityMetrics, AppError, AppResult, CompoundMetrics, PredictionListResponse,
    PredictionStatus, SampleMetrics, SubmitResponse,
};
use flate2::read::GzDecoder;
use log::warn;
use rand::Rng;
use std::path::Path;
use std::time::Duration;
use tar::Archive;

pub struct BoltzClient {
    client: reqwest::Client,
    base_url: String,
}

impl BoltzClient {
    pub fn new(base_url: &str) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // D4: Retry wrapper — exponential backoff + jitter
    // -----------------------------------------------------------------------

    /// Retry transient errors (429, 5xx, connection) up to 3 times.
    /// Permanent errors (400, 401, 422) fail immediately.
    async fn with_retry<F, Fut, T>(&self, mut f: F) -> AppResult<T>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = AppResult<T>>,
    {
        // A5: 3 total attempts (1 initial + 2 retries)
        let backoff_ms = [1000u64, 2000];
        let mut last_err = AppError::Other("No attempts made".into());

        for attempt in 0..3 {
            if attempt > 0 {
                let base = backoff_ms[attempt - 1];
                let jitter = rand::thread_rng().gen_range(0..500u64);
                tokio::time::sleep(Duration::from_millis(base + jitter)).await;
            }

            match f().await {
                Ok(val) => return Ok(val),
                Err(e) => {
                    if is_permanent_error(&e) {
                        return Err(e);
                    }
                    warn!(
                        "Transient error (attempt {}/3): {e}",
                        attempt + 1
                    );
                    last_err = e;
                }
            }
        }

        Err(last_err)
    }

    // -----------------------------------------------------------------------
    // API methods
    // -----------------------------------------------------------------------

    pub async fn submit_prediction(
        &self,
        api_key: &str,
        inference_input: serde_json::Value,
        inference_options: serde_json::Value,
    ) -> AppResult<SubmitResponse> {
        let url = format!("{}/api/v1/connect/predictions/boltz2", self.base_url);

        self.with_retry(|| {
            let url = url.clone();
            let api_key = api_key.to_string();
            let input = inference_input.clone();
            let options = inference_options.clone();

            async move {
                let body = serde_json::json!({
                    "prediction_name": uuid::Uuid::new_v4().to_string(),
                    "inference_input": input,
                    "inference_options": options,
                });

                let resp = self
                    .client
                    .post(&url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .json(&body)
                    .send()
                    .await?;

                let status = resp.status();
                if !status.is_success() {
                    let text = resp.text().await.unwrap_or_default();
                    return Err(AppError::Api(format!(
                        "Submit failed ({status}): {text}"
                    )));
                }

                let submit_resp: SubmitResponse = resp.json().await?;
                Ok(submit_resp)
            }
        })
        .await
    }

    pub async fn get_prediction_status(
        &self,
        api_key: &str,
        prediction_id: &str,
    ) -> AppResult<PredictionStatus> {
        let url = format!("{}/api/v1/connect/predictions", self.base_url);

        self.with_retry(|| {
            let url = url.clone();
            let api_key = api_key.to_string();
            let pred_id = prediction_id.to_string();

            async move {
                let resp = self
                    .client
                    .get(&url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .query(&[("predictionId", &pred_id)])
                    .send()
                    .await?;

                let status = resp.status();
                if !status.is_success() {
                    let text = resp.text().await.unwrap_or_default();
                    return Err(AppError::Api(format!(
                        "Status check failed ({status}): {text}"
                    )));
                }

                let list: PredictionListResponse = resp.json().await?;
                // A12: Filter by prediction_id instead of trusting first item
                list.predictions
                    .into_iter()
                    .find(|p| p.prediction_id == pred_id)
                    .ok_or_else(|| AppError::NotFound(format!("Prediction {pred_id} not found")))
            }
        })
        .await
    }

    /// Download tar.gz from a presigned URL (no auth needed).
    pub async fn download_tar_gz(&self, download_url: &str) -> AppResult<Vec<u8>> {
        let url = download_url.to_string();

        self.with_retry(|| {
            let url = url.clone();

            async move {
                let resp = self.client.get(&url).send().await?;

                let status = resp.status();
                if !status.is_success() {
                    return Err(AppError::Api(format!(
                        "Download failed ({status})"
                    )));
                }

                let bytes = resp.bytes().await?.to_vec();
                Ok(bytes)
            }
        })
        .await
    }

    /// Test API connectivity with a minimal request.
    pub async fn test_connection(&self, api_key: &str) -> AppResult<bool> {
        let url = format!("{}/api/v1/connect/predictions", self.base_url);

        self.with_retry(|| {
            let url = url.clone();
            let api_key = api_key.to_string();

            async move {
                let resp = self
                    .client
                    .get(&url)
                    .header("Authorization", format!("Bearer {api_key}"))
                    .query(&[("limit", "1")])
                    .send()
                    .await?;

                Ok(resp.status().is_success())
            }
        })
        .await
    }
}

// ---------------------------------------------------------------------------
// Tar extraction
// ---------------------------------------------------------------------------

/// Extract tar.gz bytes into `temp_dir`. Runs in spawn_blocking.
/// Strips top-level directory, renames files per convention.
pub async fn extract_tar_gz(bytes: Vec<u8>, temp_dir: std::path::PathBuf) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&temp_dir)?;

        let decoder = GzDecoder::new(bytes.as_slice());
        let mut archive = Archive::new(decoder);

        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.into_owned();

            // Strip the top-level directory (e.g., "prediction_abc123/")
            let components: Vec<_> = path.components().collect();
            if components.len() <= 1 {
                continue; // skip the top-level dir itself
            }
            let relative: std::path::PathBuf =
                components[1..].iter().collect();

            // Rename per convention
            let filename = relative
                .to_string_lossy()
                .replace("_predicted_structure.", "_structure.")
                .replace("_pae_visualization.", "_pae.");
            let dest = temp_dir.join(&filename);

            // Zip-slip protection: verify dest resolves inside temp_dir BEFORE creating dirs
            let canonical_temp = temp_dir.canonicalize()?;
            // Use the logical joined path for the check — dest.parent() may not exist yet,
            // so we normalize by checking that the joined path starts with temp_dir.
            // Since temp_dir is absolute and canonical, starts_with on the raw path
            // catches ".." traversal even without canonicalize on the dest side.
            if !dest.starts_with(&canonical_temp) {
                return Err(AppError::Other(format!(
                    "Path traversal detected in archive entry: {filename}"
                )));
            }

            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            entry.unpack(&dest)?;
        }

        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Extraction task panicked: {e}")))?
}

/// D9: Validate that expected files exist after extraction.
pub fn validate_extraction(temp_dir: &Path) -> AppResult<()> {
    let required = ["metrics.json", "sample_0_structure.cif"];
    for file in required {
        let path = temp_dir.join(file);
        if !path.exists() {
            return Err(AppError::Other(format!(
                "Expected file missing after extraction: {file}"
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Metrics parsing
// ---------------------------------------------------------------------------

/// Parse compound metrics from the prediction status response.
pub fn parse_metrics(prediction: &PredictionStatus) -> AppResult<CompoundMetrics> {
    let results = prediction
        .prediction_results
        .as_ref()
        .ok_or_else(|| AppError::Other("No prediction results".into()))?;

    let output = results
        .output
        .as_ref()
        .ok_or_else(|| AppError::Other("No prediction output".into()))?;

    let metrics_json = output
        .metrics
        .as_ref()
        .ok_or_else(|| AppError::Other("No metrics in output".into()))?;

    // Parse affinity metrics
    let affinity_json = metrics_json
        .get("affinity")
        .ok_or_else(|| AppError::Other("No affinity metrics".into()))?;

    let affinity = AffinityMetrics {
        binding_confidence: affinity_json
            .get("binding_confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        optimization_score: affinity_json
            .get("optimization_score")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
    };

    // Parse sample results
    let sample_results = metrics_json
        .get("sample_results")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::Other("No sample_results array".into()))?;

    let samples: Vec<SampleMetrics> = sample_results
        .iter()
        .map(|s| SampleMetrics {
            structure_confidence: get_f64(s, "structure_confidence"),
            iptm: get_f64(s, "iptm"),
            ligand_iptm: get_f64(s, "ligand_iptm"),
            complex_plddt: get_f64(s, "complex_plddt"),
            ptm: get_f64(s, "ptm"),
            protein_iptm: get_f64(s, "protein_iptm"),
            complex_iplddt: get_f64(s, "complex_iplddt"),
            complex_pde: get_f64(s, "complex_pde"),
            complex_ipde: get_f64(s, "complex_ipde"),
        })
        .collect();

    Ok(CompoundMetrics { affinity, samples })
}

fn get_f64(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64())
}

// ---------------------------------------------------------------------------
// Inference input/options builders
// ---------------------------------------------------------------------------

pub fn build_inference_input(
    protein_sequence: &str,
    smiles: &str,
    ligand_chain_id: &str,
) -> serde_json::Value {
    // A4: Use serde_yaml to properly serialize — SMILES can contain YAML-special
    // characters like :, [, ], @, # which would break raw format!() construction.
    use serde_yaml::{Mapping, Value as YValue};

    let mut root = Mapping::new();
    root.insert(YValue::String("version".into()), YValue::Number(2.into()));

    let mut protein_inner = Mapping::new();
    protein_inner.insert(YValue::String("id".into()), YValue::String("A".into()));
    protein_inner.insert(
        YValue::String("sequence".into()),
        YValue::String(protein_sequence.into()),
    );
    let mut protein_entry = Mapping::new();
    protein_entry.insert(
        YValue::String("protein".into()),
        YValue::Mapping(protein_inner),
    );

    let mut smiles_inner = Mapping::new();
    smiles_inner.insert(
        YValue::String("id".into()),
        YValue::String(ligand_chain_id.into()),
    );
    smiles_inner.insert(
        YValue::String("value".into()),
        YValue::String(smiles.into()),
    );
    let mut smiles_entry = Mapping::new();
    smiles_entry.insert(
        YValue::String("smiles".into()),
        YValue::Mapping(smiles_inner),
    );

    root.insert(
        YValue::String("sequences".into()),
        YValue::Sequence(vec![
            YValue::Mapping(protein_entry),
            YValue::Mapping(smiles_entry),
        ]),
    );

    let yaml_content =
        serde_yaml::to_string(&YValue::Mapping(root)).expect("YAML serialization should not fail");

    serde_json::json!({
        "type": "yaml_string",
        "value": yaml_content
    })
}

pub fn build_inference_options(
    recycling_steps: u32,
    diffusion_samples: u32,
    sampling_steps: u32,
    step_scale: f64,
) -> serde_json::Value {
    serde_json::json!({
        "recycling_steps": recycling_steps,
        "diffusion_samples": diffusion_samples,
        "sampling_steps": sampling_steps,
        "step_scale": step_scale
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn is_permanent_error(err: &AppError) -> bool {
    match err {
        AppError::Api(msg) => {
            // Check for 4xx codes that indicate permanent failures
            msg.contains("(400)") || msg.contains("(401)") || msg.contains("(422)")
        }
        AppError::Http(e) => {
            if let Some(status) = e.status() {
                let code = status.as_u16();
                (400..500).contains(&code) && code != 429
            } else {
                false
            }
        }
        _ => false,
    }
}
