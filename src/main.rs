use std::error::Error;

use clap::{Parser, Subcommand};
use tilekit::modelfile;
mod commands;
#[derive(Debug, Parser)]
#[command(name = "tilekit")]
#[command(version, about = "Run, fine-tune models locally with Modelfile", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Runs the given Modelfile
    Run { modelfile: String },
}
pub fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { modelfile } => {
            commands::run(modelfile.as_str());
        }
    }
    // let mut modf = modelfile::parse_from_file("fixtures/a.modelfile")?;
    // modf.add_parameter("temperature", "0.5")?;
    // modf.add_message("user", "Is Rust a functional language")?;
    // modf.add_message("assistant", "no")?;
    // modf.build()?;
    // println!("{:?}", modf.to_string());

    // let mut mlx = Command::new("mlx_lm.chat")
    //     .arg("--model")
    //     .arg("mlx-community/dolphin3.0-llama3.2-1B-4Bit")
    //     .spawn()
    //     .expect("mlx runner failed");

    // mlx.wait().expect("wait failed");

    Ok(())
}
