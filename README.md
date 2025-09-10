# Tilekit
Modelfile based decentralized version control system for model weights.


## Philosophy

We're building the open source technology to make local-first personal models ubiquitous.

Here are five ideals we would like to strive for in local-first personal models:

1. **Private by default:** models and data stay within a privacy perimeter you control and can verify  
2. **Personalized updates:** models learn from your own data, with incremental and cheaply-communicable updates  
3. **Built to last:** models update without breaking, and old versions still work if you ever want to switch back  
4. **Clear how it works:** see how models interact, combine, and reason  
5. **Always with you:** models work offline, stay synced, and available across all your devices  

The project has two values: simplicity and pragmatism. These values will help people understand what's going on, helping us to go further and faster.

## Roadmap

We are working on a Swift implementation of the Modelfile[^1] format, originally introduced by Ollama. This software package acts as a declarative blueprint for creating and sharing open models, generating Modelpacks for each platform target from the same blueprint. Our goal is to develop this with the community and eventually establish it as a standard for customizing ML models.

We are starting with MLX backend on Mac, as its unified memory architecture makes it particularly viable for running local models. We chose Swift so it can run seamlessly across platforms, including iOS devices.

The project consists of four design choices[^2] that support and reinforce one another:

1. **Device-anchored identity with keyless ops:**  
   Clients must be provisioned through the device key chain and cannot access the registry by identity alone[^3]. Only after an identity is verified and linked to the device key can it enable keyless operations[^4] for seamless private training CI/CD pipelines.

2. **Immutable model builds:**  
   Every build is version-locked and reproducible, ensuring consistency and reliability across updates and platforms.

3. **Content-hashed model layers:**  
   Models are stored and referenced by cryptographic hashes of their layers, guaranteeing integrity and enabling efficient deduplication and sharing.

4. **Verifiable transparency and attestations:**  
   Every signing and build event is recorded in an append-only transparency log, producing cryptographic attestations that can be independently verified. This ensures accountability, prevents hidden modifications, and provides an auditable history of model provenance across devices and registries.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license [LICENSE-MIT.txt](https://github.com/tileslauncher/tilekit/blob/main/LICENSE-MIT.txt)
- Apache License, Version 2.0, [LICENSE-APACHE.txt](https://github.com/tileslauncher/tilekit/blob/main/LICENSE-APACHE.txt)

Downstream projects and end users may choose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.

[^1]: [Ollama Modelfile](https://ollama.readthedocs.io/en/modelfile/)  
[^2]: [Decentralizability](https://newsletter.squishy.computer/p/decentralizability)  
[^3]: [Keybase's New Key Model](https://keybase.io/blog/keybase-new-key-model)  
[^4]: [Sigstore: How It Works](https://www.sigstore.dev/how-it-works)
