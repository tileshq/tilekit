use std::error::Error;

use clap::{Parser, Subcommand};
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
    /// Runs the given modelfile Path
    Run { modelfile_path: String },

    /// Checks the status of dependencies
    Health,
}
pub fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { modelfile_path } => {
            commands::run(modelfile_path.as_str());
        }
        Commands::Health => {
            commands::check_health();
        }
    }
    Ok(())
}
