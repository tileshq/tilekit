use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningModel {
    pub name: String,
    pub model_id: String,
    pub pid: u32,
    pub started_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ModelState {
    pub models: HashMap<String, RunningModel>,
}

impl ModelState {
    pub fn load(state_file: &PathBuf) -> Result<Self> {
        if !state_file.exists() {
            return Ok(Self::default());
        }
        
        let content = fs::read_to_string(state_file)
            .context("Failed to read model state file")?;
        
        let state: ModelState = serde_json::from_str(&content)
            .context("Failed to parse model state file")?;
        
        Ok(state)
    }
    
    pub fn save(&self, state_file: &PathBuf) -> Result<()> {
        let content = serde_json::to_string_pretty(self)
            .context("Failed to serialize model state")?;
        
        fs::write(state_file, content)
            .context("Failed to write model state file")?;
        
        Ok(())
    }
    
    pub fn add_model(&mut self, name: String, model_id: String, pid: u32) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        self.models.insert(name.clone(), RunningModel {
            name,
            model_id,
            pid,
            started_at: now,
        });
    }
    
    pub fn remove_model(&mut self, name: &str) -> Option<RunningModel> {
        self.models.remove(name)
    }
    
    pub fn get_model(&self, name: &str) -> Option<&RunningModel> {
        self.models.get(name)
    }
    
    pub fn list_models(&self) -> Vec<&RunningModel> {
        self.models.values().collect()
    }
    
    pub fn is_empty(&self) -> bool {
        self.models.is_empty()
    }
    
    /// Clean up stale entries (models that are no longer running)
    pub fn cleanup_stale(&mut self) {
        self.models.retain(|_, model| {
            is_process_running(model.pid)
        });
    }
}

fn is_process_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        use std::process::Command;
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(not(unix))]
    {
        // For Windows, you might need a different approach
        false
    }
}

pub fn get_state_file() -> Result<PathBuf> {
    let config_dir = super::mlx::get_config_dir()?;
    Ok(config_dir.join("models.json"))
}

