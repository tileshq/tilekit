// Module that handles CLI commands

use tiles::{
    core::{
        health,
        modelfile::{self},
    },
    runner::mlx,
};
use std::path::Path;

pub async fn run(modelfile_path: &str) {
    // Resolve the modelfile path - check if it's a model name or file path
    let resolved_path = match resolve_modelfile_path(modelfile_path) {
        Ok(path) => path,
        Err(err) => {
            println!("Error resolving modelfile: {}", err);
            return;
        }
    };

    match modelfile::parse_from_file(&resolved_path) {
        Ok(modelfile) => {
            mlx::run(modelfile).await;
        }
        Err(err) => println!("{}", err),
    }
}

fn resolve_modelfile_path(input: &str) -> Result<String, String> {
    let path = Path::new(input);
    
    // If the input is a file path that exists, canonicalize it to get absolute path
    // This prevents path traversal attacks and ensures consistent path handling
    if path.exists() {
        return path
            .canonicalize()
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to canonicalize path '{}': {}", input, e));
    }

    // Otherwise, treat it as a model name and look for it in the registry
    match mlx::get_registry_dir() {
        Ok(registry_dir) => {
            let modelfile_path = registry_dir.join(input).join("Modelfile");
            if modelfile_path.exists() {
                // Registry paths are already absolute, but canonicalize for consistency
                modelfile_path
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .map_err(|e| format!("Failed to canonicalize registry path: {}", e))
            } else {
                Err(format!(
                    "Modelfile not found for '{}'. Expected at: {}\nTry: tiles run <model-name> or tiles run <path-to-modelfile>",
                    input,
                    modelfile_path.display()
                ))
            }
        }
        Err(err) => Err(format!("Failed to get registry directory: {}", err)),
    }
}

pub fn check_health() {
    health::check_health();
}

pub fn start_server() {
    let _ = mlx::start_server_daemon();
}

pub fn stop_server() {
    let _ = mlx::stop_server_daemon();
}
