// Module that handles CLI commands

use tiles::{
    core::{
        health,
        modelfile::{self},
    },
    runner::mlx,
};

pub async fn run(model_name: &str) {
    // Resolve the model name to a Modelfile path in the registry
    let modelfile_path = match resolve_model_to_modelfile(model_name) {
        Ok(path) => path,
        Err(err) => {
            eprintln!("{}", err);
            return;
        }
    };

    match modelfile::parse_from_file(&modelfile_path) {
        Ok(modelfile) => {
            // Start the model in background
            if let Err(err) = mlx::start_model_background(model_name, modelfile).await {
                eprintln!("{}", err);
            }
        }
        Err(err) => eprintln!("Error parsing Modelfile: {}", err),
    }
}

fn resolve_model_to_modelfile(model_name: &str) -> Result<String, String> {
    // Look for the model in the registry
    match mlx::get_registry_dir() {
        Ok(registry_dir) => {
            let modelfile_path = registry_dir.join(model_name).join("Modelfile");
            if modelfile_path.exists() {
                // Registry paths are already absolute, but canonicalize for consistency
                modelfile_path
                    .canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .map_err(|e| format!("Failed to access Modelfile: {}", e))
            } else {
                Err(format!(
                    "❌ Model '{}' not found in registry.\n\
                     💡 Expected Modelfile at: {}\n\
                     📝 Tip: Create a folder named '{}' in the registry with a Modelfile inside.",
                    model_name,
                    modelfile_path.display(),
                    model_name
                ))
            }
        }
        Err(err) => Err(format!("Failed to access registry directory: {}", err)),
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

pub fn list_models() {
    if let Err(err) = mlx::list_running_models() {
        eprintln!("Error listing models: {}", err);
    }
}

pub async fn stop_model(model_name: &str) {
    if let Err(err) = mlx::stop_model(model_name).await {
        eprintln!("{}", err);
    }
}
