# Tilekit
Modelfile-based SDK that lets developers to lets developers customize local models and agent experiences within [Tiles](https://www.tiles.run/).

## Quick Start

### Installation

Download and run the installer for your platform from the [releases page](https://github.com/tilesprivacy/tilekit/releases).

On macOS, double-click `Tiles.app` from the mounted ISO to start installation.

### Basic Usage

```bash
# Start a model (runs in background)
Tiles run memgpt

# List running models
Tiles ls

# Stop a model
Tiles stop memgpt

# View help
Tiles --help
```

### Recommended Setup

**For the best experience with Tiles, we recommend:**

- **[Tailscale](https://tailscale.com)** - Access your Tiles instance securely from anywhere, on any device
- **[Amphetamine](https://amphetamine.en.softonic.com/mac)** (macOS) - Keep your Mac awake when running models

These tools ensure your models stay accessible and responsive 24/7.

## Dev setup

- Clone the repo
- Install [just](https://github.com/casey/just)
- `cargo build` (for setting up local rust env)
- Install [uv](https://docs.astral.sh/uv/) for python server
- `cd server`
- `uv sync`

### Running

- Go to root and run `just serve` in another terminal to run the server
- Run the rust cli using cargo as usual

### Directory Structure

Tiles uses a single `~/.tiles/` directory for all data, making it portable and environment-agnostic:

```
~/.tiles/
├── registry/           # Model definitions
│   ├── memgpt/
│   │   └── Modelfile
│   └── other-model/
│       └── Modelfile
├── memory/            # AI memory storage
├── server/            # Python server (production only)
├── server.pid         # Server process ID
└── models.json        # Running models state
```

Models are organized in the `registry/` folder. Each model has its own folder with a `Modelfile` inside.

To run a model:
```bash
cargo run run memgpt  # Runs the model defined in ~/.tiles/registry/memgpt/Modelfile
```

The folder name becomes the model name that you use with the CLI.

### Running Models

Models run in the background and persist after the CLI exits:

```bash
# Start a model (runs in background)
cargo run run memgpt         # Dev
Tiles run memgpt            # Production

# List running models
cargo run ls                 # Dev
Tiles ls                    # Production

# Stop a specific model
cargo run stop memgpt        # Dev
Tiles stop memgpt           # Production
```

**How it works:**
1. When you start a model with `Tiles run`, it loads into the server and runs in the background
2. The CLI exits immediately - your model keeps running
3. On macOS (production), Tiles Agent keeps a dock icon visible while models are active
4. Use `Tiles ls` anytime to see what's running
5. When you stop the last model, the server and agent shut down automatically

**Production Features (macOS):**
- Tiles Agent.app appears in dock while models are running
- Models persist even if you close Terminal
- Access via `Tiles` command from anywhere

When you stop the last running model, the server automatically stops as well.

### Server Management

**The server starts automatically** when you run a model and stops when no models are running.

**Manual server control (if needed):**
```bash
# Start server manually
cargo run start              # Dev
tiles start                 # Production

# Stop server manually (only if no models running)
cargo run stop --server      # Dev
tiles stop --server         # Production
```

**Both development and production builds:**
- Use the same `~/.tiles/` directory structure (environment-agnostic)
- Server starts automatically on first model run
- Models run in background and persist after CLI exits
- Use `Tiles ls` to see running models
- Use `Tiles stop <model>` to stop individual models
- Server auto-starts and auto-stops based on running models

**Note:** Development builds use the local `server/` directory for the Python server, while production installs it to `~/.tiles/server/`.

### Packaging installers

- `just bundle` creates a tarball that includes the CLI binary and Python server.
- `just iso` wraps the bundle and installer script into an ISO that can be flashed with tools like Balena Etcher.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license [LICENSE-MIT.txt](https://github.com/tileshq/tilekit/blob/main/LICENSE-MIT.txt)
- Apache License, Version 2.0, [LICENSE-APACHE.txt](https://github.com/tileshq/tilekit/blob/main/LICENSE-APACHE.txt)

Downstream projects and end users may choose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.

[^1]: [Ollama Modelfile](https://ollama.readthedocs.io/en/modelfile/)  
[^2]: [Decentralizability](https://newsletter.squishy.computer/p/decentralizability)  
[^3]: [Keybase's New Key Model](https://keybase.io/blog/keybase-new-key-model)  
[^4]: [Sigstore: How It Works](https://www.sigstore.dev/how-it-works)
