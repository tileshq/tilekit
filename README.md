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

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license [LICENSE-MIT.txt](https://github.com/tileshq/tilekit/blob/main/LICENSE-MIT.txt)
- Apache License, Version 2.0, [LICENSE-APACHE.txt](https://github.com/tileshq/tilekit/blob/main/LICENSE-APACHE.txt)

Downstream projects and end users may choose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.

[^1]: [Ollama Modelfile](https://ollama.readthedocs.io/en/modelfile/)  
[^2]: [Decentralizability](https://newsletter.squishy.computer/p/decentralizability)  
[^3]: [Keybase's New Key Model](https://keybase.io/blog/keybase-new-key-model)  
[^4]: [Sigstore: How It Works](https://www.sigstore.dev/how-it-works)
