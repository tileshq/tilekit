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
    if model.starts_with("driaforall/mem-agent") {
        let _res = run_model_with_server(modelfile).await;
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
async fn run_model_with_server(modelfile: Modelfile) -> reqwest::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    // loading the model from mem-agent via daemon server
    let memory_path = get_memory_path()
        .context("Retrieving memory_path failed")
        .unwrap();
    let modelname = modelfile.from.as_ref().unwrap();
    load_model(modelname, &memory_path).await.unwrap();
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

// async fn ping() -> reqwest::Result<()> {
//     let client = Client::new();
//     let res = client.get("http://127.0.0.1:6969/ping").send().await?;
//     println!("{}", res.text().await?);
//     Ok(())
// }

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
        .unwrap();
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
        let data_dir = match env::var("XDG_DATA_HOME") {
            Ok(val) => PathBuf::from(val),
            Err(_err) => home_dir.join(".local/share"),
        };
        Ok(data_dir.join("tiles/server"))
    }
}
fn get_config_dir() -> Result<PathBuf> {
    if cfg!(debug_assertions) {
        let base_dir = env::current_dir().context("Failed to fetch CURRENT_DIR")?;
        Ok(base_dir.join(".tiles_dev/tiles"))
    } else {
        let home_dir = env::home_dir().context("Failed to fetch $HOME")?;
        let config_dir = match env::var("XDG_CONFIG_HOME") {
            Ok(val) => PathBuf::from(val),
            Err(_err) => home_dir.join(".config"),
        };
        Ok(config_dir.join("tiles"))
    }
}

fn get_data_dir() -> Result<PathBuf> {
    if cfg!(debug_assertions) {
        let base_dir = env::current_dir().context("Failed to fetch CURRENT_DIR")?;
        Ok(base_dir.join(".tiles_dev/tiles"))
    } else {
        let home_dir = env::home_dir().context("Failed to fetch $HOME")?;
        let data_dir = match env::var("XDG_DATA_HOME") {
            Ok(val) => PathBuf::from(val),
            Err(_err) => home_dir.join(".local/share"),
        };
        Ok(data_dir.join("tiles"))
    }
}
