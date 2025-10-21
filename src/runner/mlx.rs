use reqwest::Client;
use serde_json::{Value, json};
use std::ffi::NulError;
use std::io::Write;
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

async fn run_model_with_server(modelfile: Modelfile) -> reqwest::Result<()> {
    // println!("gonna ping");
    // let _ = ping().await;
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    // loading the model from mem-agent via daeomn server
    let modelname = modelfile.from.as_ref().unwrap();
    load_model(&modelname).await.unwrap();
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
                if let Ok(response) = chat(input, &modelname).await {
                    println!(">> {}", response)
                } else {
                    println!(">> failed to respond")
                }
            }
        }
    }
    Ok(())
}

async fn ping() -> reqwest::Result<()> {
    let client = Client::new();
    let res = client.get("http://127.0.0.1:6969/ping").send().await?;
    println!("{}", res.text().await?);
    Ok(())
}

async fn load_model(model_name: &str) -> Result<(), String> {
    let client = Client::new();
    let body = json!({
        "model": model_name
    });
    let res = client
        .post("http://127.0.0.1:6969/start")
        .json(&body)
        .send()
        .await
        .unwrap();
    // println!("{:?}", res);
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
