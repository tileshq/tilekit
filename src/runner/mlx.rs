use std::process::Command;

use crate::core::modelfile::Modelfile;

pub fn run(modelfile: Modelfile) {
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
    let mut mlx = Command::new("mlx_lm.chat")
        .args(args)
        .spawn()
        .expect("mlx runner failed");

    mlx.wait().expect("wait failed");
}
