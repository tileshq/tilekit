use std::process::Command;

use crate::core::modelfile::Modelfile;

pub fn run(modelfile: &Modelfile) {
    println!("{:?}", modelfile);
    let mut mlx = Command::new("mlx_lm.chat")
        .args([
            "--model",
            modelfile.from.as_ref().unwrap(),
            "--system-prompt",
            modelfile.system.as_ref().unwrap(),
        ])
        .spawn()
        .expect("mlx runner failed");

    mlx.wait().expect("wait failed");
}
