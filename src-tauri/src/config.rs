use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::AppResult;

pub const CONFIG_FILENAME: &str = "config.json";

/// Application configuration stored in JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// Path to the scanned music folder
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_path: Option<String>,
    
    /// Volume level (0-100)
    #[serde(default = "default_volume")]
    pub volume: u8,
    
    /// Whether shuffle is enabled
    #[serde(default)]
    pub shuffle: bool,
    
    /// Whether repeat is enabled
    #[serde(default)]
    pub repeat: bool,
}

fn default_volume() -> u8 {
    70
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            library_path: None,
            volume: default_volume(),
            shuffle: false,
            repeat: false,
        }
    }
}

/// Load config from file, or create default if it doesn't exist
pub fn load_config(config_path: &Path) -> AppResult<AppConfig> {
    if config_path.exists() {
        let content = fs::read_to_string(config_path)?;
        let config: AppConfig = serde_json::from_str(&content)
            .map_err(|e| AppError::Metadata(format!("Failed to parse config: {}", e)))?;
        Ok(config)
    } else {
        // Create default config
        let config = AppConfig::default();
        save_config(config_path, &config)?;
        Ok(config)
    }
}

/// Save config to file
pub fn save_config(config_path: &Path, config: &AppConfig) -> AppResult<()> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::Metadata(format!("Failed to serialize config: {}", e)))?;
    
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    fs::write(config_path, content)?;
    
    Ok(())
}

/// Update a specific field in the config
pub fn update_config<F>(config_path: &Path, updater: F) -> AppResult<AppConfig>
where
    F: FnOnce(&mut AppConfig),
{
    let mut config = load_config(config_path)?;
    updater(&mut config);
    save_config(config_path, &config)?;
    Ok(config)
}
