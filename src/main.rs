use std::error::Error;

use clap::{Args, Parser, Subcommand};
mod commands;
#[derive(Debug, Parser)]
#[command(name = "Tiles")]
#[command(version, about = "Private, on-device AI memory that personalizes the agents you use, on your terms. Works with Obsidian.")]
#[command(long_about = "Tiles - Private AI Memory\n\n\
    Models run in the background and persist after the CLI exits.\n\n\
    USAGE EXAMPLES:\n  \
      Tiles run memgpt       Start the memgpt model\n  \
      Tiles ls               List all running models\n  \
      Tiles stop memgpt      Stop a specific model\n\n\
    RECOMMENDED SETUP:\n  \
      • Tailscale (https://tailscale.com) - Access Tiles from anywhere\n  \
      • Amphetamine (macOS) - Keep your Mac awake for 24/7 availability\n  \
      • rsync (https://rsync.samba.org) - Sync memory and data across devices\n\n\
    For more info: https://tiles.run")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Runs a model by name (e.g., 'memgpt')
    ///
    /// The model name corresponds to a folder in the registry that contains a Modelfile.
    ///
    /// Example:
    ///   tiles run memgpt    # Runs the model from registry/memgpt/Modelfile
    Run { model: String },

    /// Lists all running models
    Ls,

    /// Stops a running model or the server
    ///
    /// Examples:
    ///   tiles stop memgpt     # Stops the memgpt model
    ///   tiles stop --server   # Stops the server (if no models are running)
    Stop {
        /// Model name to stop (if not provided, stops the server)
        model: Option<String>,
        /// Stop the server daemon
        #[arg(long)]
        server: bool,
    },

    /// Starts the server daemon
    Start,

    /// Checks the status of dependencies
    Health,

    /// Manage the daemon server (deprecated: use 'start' or 'stop' instead)
    #[command(hide = true)]
    Server(ServerArgs),
}

#[derive(Debug, Args)]
#[command(args_conflicts_with_subcommands = true)]
#[command(flatten_help = true)]
struct ServerArgs {
    #[command(subcommand)]
    command: Option<ServerCommands>,
}

#[derive(Debug, Subcommand)]
enum ServerCommands {
    /// Start the py server as a daemon
    Start,

    /// Stops the daemon py server
    Stop,
}
#[tokio::main]
pub async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { model } => {
            commands::run(model.as_str()).await;
        }
        Commands::Ls => {
            commands::list_models();
        }
        Commands::Stop { model, server } => {
            if server {
                commands::stop_server();
            } else if let Some(model_name) = model {
                commands::stop_model(&model_name).await;
            } else {
                eprintln!("Please specify a model name or use --server flag");
                eprintln!("Usage: tiles stop <model-name> or tiles stop --server");
            }
        }
        Commands::Start => {
            commands::start_server();
        }
        Commands::Health => {
            commands::check_health();
        }
        Commands::Server(server) => match server.command {
            Some(ServerCommands::Start) => commands::start_server(),
            Some(ServerCommands::Stop) => commands::stop_server(),
            _ => println!("Expected start or stop"),
        },
    }
    Ok(())
}
