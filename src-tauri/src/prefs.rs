use crate::models::{AppResult, Prefs};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Return the default root directory: `~/multiplexer`.
pub fn default_root_dir() -> AppResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| {
        crate::models::AppError::Other("Could not determine home directory".into())
    })?;
    Ok(home.join("multiplexer"))
}

fn prefs_path(app: &AppHandle) -> AppResult<PathBuf> {
    let config_dir = app.path().app_config_dir().map_err(|e| {
        crate::models::AppError::Other(format!("Could not get app config dir: {e}"))
    })?;
    Ok(config_dir.join("prefs.json"))
}

/// Read the root directory from prefs.json, falling back to the default.
pub fn read_root_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let path = prefs_path(app)?;
    if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        let prefs: Prefs = serde_json::from_str(&content)?;
        Ok(PathBuf::from(prefs.root_dir))
    } else {
        default_root_dir()
    }
}

/// Write the root directory to prefs.json.
pub fn write_root_dir(app: &AppHandle, root: &std::path::Path) -> AppResult<()> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let prefs = Prefs {
        root_dir: root.to_string_lossy().to_string(),
    };
    let content = serde_json::to_string_pretty(&prefs)?;
    std::fs::write(&path, content)?;
    Ok(())
}
