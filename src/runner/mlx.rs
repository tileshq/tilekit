use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::{Value, json};
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;
use std::{env, fs};
use std::{io, process::Command};

use crate::core::modelfile::Modelfile;

pub async fn run(modelfile: Modelfile) {
    let model = modelfile.from.as_ref().unwrap();
    println!("✓ Found model: {}", model);
    if model.starts_with("driaforall/mem-agent") {
        if let Err(err) = run_model_with_server(modelfile).await {
            eprintln!("{}", err);
            std::process::exit(1);
        }
    } else {
        run_model_by_sub_process(modelfile);
    }
}

fn run_model_by_sub_process(modelfile: Modelfile) {
    // build the arg list from modelfile
    let mut args: Vec<String> = vec![];
    args.push("--model".to_owned());
    args.push(modelfile.from.unwrap());
    for parameter in modelfile.parameters {
        let param_value = parameter.value.to_string();
        match parameter.param_type.as_str() {
            "num_predict" => {
                args.push("--max-tokens".to_owned());
                args.push(param_value);
            }
            "temperature" => {
                args.push("--temp".to_owned());
                args.push(param_value);
            }
            "top_p" => {
                args.push("--top-p".to_owned());
                args.push(param_value);
            }
            "seed" => {
                args.push("--seed".to_owned());
                args.push(param_value);
            }
            _ => {}
        }
    }
    if let Some(system_prompt) = modelfile.system {
        args.push("--system-prompt".to_owned());
        args.push(system_prompt);
    }
    if let Some(adapter_path) = modelfile.adapter {
        args.push("--adapter-path".to_owned());
        args.push(adapter_path);
    }
    let mut mlx = match Command::new("mlx_lm.chat").args(args).spawn() {
        Ok(child) => child,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                eprintln!("❌ Error: mlx_lm.chat command not found");
                eprintln!("💡 Hint: Install mlx-lm by running: pip install mlx-lm");
                eprintln!("📝 Note: mlx-lm is only available on macOS with Apple Silicon");
                std::process::exit(1);
            } else {
                eprintln!("❌ Error: Failed to spawn mlx_lm.chat: {}", e);
                std::process::exit(1);
            }
        }
    };

    if let Err(err) = mlx.wait() {
        eprintln!("❌ Error: Failed to wait for mlx_lm: {}", err);
    }
}

#[allow(clippy::zombie_processes)]
pub fn start_server_daemon() -> Result<()> {
    // check if the server is running
    // start server as a child process
    // save the pid in a file under ~/.config/tiles/server_pid
    let config_dir = get_config_dir()?;
    let server_dir = get_server_dir()?;
    let pid_file = config_dir.join("server.pid");
    if pid_file.exists() {
        eprintln!("Server is already running");
        return Ok(());
    }

    let child = Command::new("uv")
        .args([
            "run",
            "--project",
            server_dir.to_str().unwrap(),
            "python",
            "-m",
            "server.main",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to start server");
    fs::create_dir_all(&config_dir).context("Failed to create config directory")?;
    std::fs::write(pid_file, child.id().to_string()).unwrap();
    println!("Server started with PID {}", child.id());
    Ok(())
}

pub fn stop_server_daemon() -> Result<()> {
    let pid_file = get_config_dir()?.join("server.pid");

    if !pid_file.exists() {
        eprintln!("Server is not running");
        return Ok(());
    }

    let pid = std::fs::read_to_string(&pid_file).unwrap();
    Command::new("kill").arg(pid.trim()).status().unwrap();
    std::fs::remove_file(pid_file).unwrap();
    println!("Server stopped.");
    Ok(())
}
async fn run_model_with_server(modelfile: Modelfile) -> Result<(), String> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    
    // In production builds, automatically start the server if it's not running
    if !cfg!(debug_assertions) {
        if !is_server_running().await {
            println!("🚀 Starting server on port 6969...");
            start_server_daemon()
                .map_err(|e| format!("Failed to start server: {}", e))?;
            
            // Wait for server to initialize with retries
            let mut attempts = 0;
            let max_attempts = 15; // 15 seconds total
            while attempts < max_attempts {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                if is_server_running().await {
                    println!("✓ Server started successfully");
                    break;
                }
                attempts += 1;
            }
            
            if attempts >= max_attempts {
                return Err(String::from(
                    "❌ Server failed to start within 15 seconds. Please check logs or try: tiles server start"
                ));
            }
        } else {
            println!("✓ Connected to server on port 6969");
        }
    }
    
    // loading the model from mem-agent via daemon server
    let memory_path = get_memory_path()
        .map_err(|e| format!("Failed to retrieve memory path: {}", e))?;
    let modelname = modelfile.from.as_ref().unwrap();
    load_model(modelname, &memory_path).await?;
    println!("Running in interactive mode");
    loop {
        print!(">> ");
        stdout.flush().unwrap();
        let mut input = String::new();
        stdin.read_line(&mut input).unwrap();
        let input = input.trim();
        match input {
            "exit" => {
                println!("Exiting interactive mode");
                break;
            }
            _ => {
                if let Ok(response) = chat(input, modelname).await {
                    println!(">> {}", response)
                } else {
                    println!(">> failed to respond")
                }
            }
        }
    }
    Ok(())
}

async fn is_server_running() -> bool {
    // First check if PID file exists
    if let Ok(config_dir) = get_config_dir() {
        let pid_file = config_dir.join("server.pid");
        if !pid_file.exists() {
            return false;
        }
    }
    
    // Try to ping the server to confirm it's actually running
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build()
        .unwrap();
    
    match client.get("http://127.0.0.1:6969/ping").send().await {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

async fn load_model(model_name: &str, memory_path: &str) -> Result<(), String> {
    let client = Client::new();
    let body = json!({
        "model": model_name,
        "memory_path": memory_path
    });
    let res = client
        .post("http://127.0.0.1:6969/start")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!(
                    "❌ Error: Could not connect to the server.\n\
                     💡 Hint: Start the server first by running: tiles server start\n\
                     📝 Note: The server is required for mem-agent models.\n\
                     Error details: {}", e
                )
            } else {
                format!("Request failed: {}", e)
            }
        })?;
    if res.status() == 200 {
        Ok(())
    } else {
        Err(String::from("request failed"))
    }
}

async fn chat(input: &str, model_name: &str) -> Result<String, String> {
    let client = Client::new();
    let body = json!({
        "model": model_name,
        "messages": [{"role": "user", "content": input}]
    });
    let res = client
        .post("http://127.0.0.1:6969/v1/chat/completions")
        .json(&body)
        .send()
        .await
        .unwrap();
    // println!("{:?}", res);
    if res.status() == 200 {
        let text = res.text().await.unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        let content = v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("<no content>");
        Ok(content.to_owned())
    } else {
        Err(String::from("request failed"))
    }
}

fn get_memory_path() -> Result<String> {
    let tiles_config_dir = get_config_dir()?;
    let tiles_data_dir = get_data_dir()?;
    let mut is_memory_path_found: bool = false;
    let mut memory_path: String = String::from("");
    if tiles_config_dir.is_dir()
        && let Ok(content) = fs::read_to_string(tiles_config_dir.join(".memory_path"))
    {
        memory_path = content;
        is_memory_path_found = true;
    }

    if is_memory_path_found {
        Ok(memory_path)
    } else {
        let memory_path = tiles_data_dir.join("memory");
        fs::create_dir_all(&memory_path).context("Failed to create tiles memory directory")?;
        fs::create_dir_all(&tiles_config_dir).context("Failed to create tiles config directory")?;
        fs::write(
            tiles_config_dir.join(".memory_path"),
            memory_path.to_str().unwrap(),
        )
        .context("Failed to write the default path to .memory_path")?;
        Ok(memory_path.to_string_lossy().to_string())
    }
}

fn get_server_dir() -> Result<PathBuf> {
    if cfg!(debug_assertions) {
        let base_dir = env::current_dir().context("Failed to fetch CURRENT_DIR")?;
        Ok(base_dir.join("server"))
    } else {
        let home_dir = env::home_dir().context("Failed to fetch $HOME")?;
        Ok(home_dir.join(".tiles/server"))
    }
}

pub fn get_config_dir() -> Result<PathBuf> {
    let home_dir = env::home_dir().context("Failed to fetch $HOME")?;
    Ok(home_dir.join(".tiles"))
}

fn get_data_dir() -> Result<PathBuf> {
    let home_dir = env::home_dir().context("Failed to fetch $HOME")?;
    Ok(home_dir.join(".tiles"))
}

pub fn get_registry_dir() -> Result<PathBuf> {
    let tiles_data_dir = get_data_dir()?;
    let registry_dir = tiles_data_dir.join("registry");
    fs::create_dir_all(&registry_dir).context("Failed to create tiles registry directory")?;
    Ok(registry_dir)
}

// macOS Agent management functions
fn start_agent() -> Result<()> {
    let config_dir = get_config_dir()?;
    let agent_pid_file = config_dir.join("agent.pid");
    
    // Check if agent is already running
    if agent_pid_file.exists() {
        if let Ok(pid_str) = fs::read_to_string(&agent_pid_file) {
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                // Check if process is still running
                if Command::new("kill").arg("-0").arg(pid.to_string()).status().is_ok() {
                    return Ok(()); // Agent already running
                }
            }
        }
    }
    
    // Launch Tiles Agent.app
    let home_dir = env::home_dir().context("Failed to get home directory")?;
    let agent_app = home_dir.join("Applications/Tiles Agent.app");
    
    if agent_app.exists() {
        Command::new("open")
            .arg("-a")
            .arg(&agent_app)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("Failed to launch Tiles Agent")?;
    }
    
    Ok(())
}

fn stop_agent() -> Result<()> {
    let config_dir = get_config_dir()?;
    let agent_pid_file = config_dir.join("agent.pid");
    
    if !agent_pid_file.exists() {
        return Ok(());
    }
    
    if let Ok(pid_str) = fs::read_to_string(&agent_pid_file) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            let _ = Command::new("kill").arg(pid.to_string()).status();
        }
    }
    
    let _ = fs::remove_file(agent_pid_file);
    Ok(())
}

// Background model management functions
pub async fn start_model_background(model_name: &str, modelfile: Modelfile) -> Result<(), String> {
    use super::model_state::{get_state_file, ModelState};
    
    let state_file = get_state_file().map_err(|e| format!("Failed to get state file: {}", e))?;
    let mut state = ModelState::load(&state_file)
        .map_err(|e| format!("Failed to load model state: {}", e))?;
    
    // Check if model is already running
    state.cleanup_stale();
    if let Some(existing) = state.get_model(model_name) {
        return Err(format!(
            "Model '{}' is already running (PID: {})\nUse 'tiles stop {}' to stop it first.",
            model_name, existing.pid, model_name
        ));
    }
    
    let model_id = modelfile.from.as_ref().unwrap().clone();
    
    // Ensure server is running
    if !is_server_running().await {
        println!("🚀 Starting server on port 6969...");
        start_server_daemon()
            .map_err(|e| format!("Failed to start server: {}", e))?;
        
        // Wait for server to initialize
        let mut attempts = 0;
        let max_attempts = 15;
        while attempts < max_attempts {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            if is_server_running().await {
                println!("✓ Server started successfully");
                break;
            }
            attempts += 1;
        }
        
        if attempts >= max_attempts {
            return Err(String::from(
                "❌ Server failed to start within 15 seconds."
            ));
        }
    } else {
        println!("✓ Connected to server on port 6969");
    }
    
    // Load the model
    let memory_path = get_memory_path()
        .map_err(|e| format!("Failed to retrieve memory path: {}", e))?;
    load_model(&model_id, &memory_path).await?;
    
    // Get server PID to track the model
    let config_dir = get_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;
    let pid_file = config_dir.join("server.pid");
    let server_pid = if pid_file.exists() {
        fs::read_to_string(&pid_file)
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0)
    } else {
        0
    };
    
    // Add to state (using server PID since model runs in server)
    state.add_model(model_name.to_string(), model_id.clone(), server_pid);
    state.save(&state_file)
        .map_err(|e| format!("Failed to save model state: {}", e))?;
    
    println!("✓ Model '{}' ({}) loaded and ready", model_name, model_id);
    println!("  Use 'tiles ls' to see running models");
    println!("  Use 'tiles stop {}' to stop this model", model_name);
    
    // Start the agent to keep dock icon alive (macOS only, non-debug builds)
    if cfg!(target_os = "macos") && !cfg!(debug_assertions) {
        let _ = start_agent();
    }
    
    Ok(())
}

pub async fn stop_model(model_name: &str) -> Result<(), String> {
    use super::model_state::{get_state_file, ModelState};
    
    let state_file = get_state_file().map_err(|e| format!("Failed to get state file: {}", e))?;
    let mut state = ModelState::load(&state_file)
        .map_err(|e| format!("Failed to load model state: {}", e))?;
    
    state.cleanup_stale();
    
    let _model = state.remove_model(model_name)
        .ok_or_else(|| format!("Model '{}' is not running", model_name))?;
    
    println!("✓ Stopped model '{}'", model_name);
    
    // Save state
    state.save(&state_file)
        .map_err(|e| format!("Failed to save model state: {}", e))?;
    
    // If no models are running, stop the server and agent
    if state.is_empty() {
        println!("  No models running, stopping server...");
        let _ = stop_server_daemon();
        
        // Stop the agent (macOS only, non-debug builds)
        if cfg!(target_os = "macos") && !cfg!(debug_assertions) {
            let _ = stop_agent();
        }
    }
    
    Ok(())
}

pub fn list_running_models() -> Result<(), String> {
    use super::model_state::{get_state_file, ModelState};
    
    let state_file = get_state_file().map_err(|e| format!("Failed to get state file: {}", e))?;
    let mut state = ModelState::load(&state_file)
        .map_err(|e| format!("Failed to load model state: {}", e))?;
    
    state.cleanup_stale();
    
    let models = state.list_models();
    
    if models.is_empty() {
        println!("No models currently running.");
        println!("\nStart a model with: tiles run <model-name>");
        return Ok(());
    }
    
    println!("Running models:\n");
    println!("{:<20} {:<40} {:<10} {}", "NAME", "MODEL", "PID", "STARTED");
    println!("{}", "-".repeat(90));
    
    for model in models {
        println!("{:<20} {:<40} {:<10} {}", 
            model.name, 
            model.model_id, 
            model.pid, 
            model.started_at
        );
    }
    
    println!("\nUse 'tiles stop <model-name>' to stop a model");
    
    // Save cleaned state
    state.save(&state_file)
        .map_err(|e| format!("Failed to save model state: {}", e))?;
    
    Ok(())
}
