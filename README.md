# Tilekit
Modelfile-based SDK that lets developers to lets developers customize local models and agent experiences within [Tiles](https://www.tiles.run/).

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

### Registry Structure

Models are organized in the `registry/` folder. Each model has its own folder with a `Modelfile` inside:

```
registry/
├── memgpt/
│   └── Modelfile
├── another-model/
│   └── Modelfile
└── ...
```

To run a model:
```bash
cargo run run memgpt  # Runs the model defined in registry/memgpt/Modelfile
```

The folder name becomes the model name that you use with the CLI.

### Running Models

Models run in the background and persist after the CLI exits:

```bash
# Start a model (runs in background)
cargo run run memgpt         # Dev
tiles run memgpt            # Production

# List running models
cargo run ls                 # Dev
tiles ls                    # Production

# Stop a specific model
cargo run stop memgpt        # Dev
tiles stop memgpt           # Production
```

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

**Development (debug) builds:**
- Server starts automatically on first model run
- Models run in background and persist after CLI exits
- Use `tiles ls` to see running models
- Use `tiles stop <model>` to stop individual models

**Production (release) builds:**
- Same behavior as dev builds
- Server auto-starts and auto-stops based on running models

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
