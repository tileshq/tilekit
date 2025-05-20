# Tilekit

Tilekit is the underlying personal software toolkit that powers the tiles.run notebook interface. This work is exploratory in nature and not meant for external use.

## Demo

This project demonstrates how to integrate with mcp.run serverlets. It includes:

1. Session management with MCP
2. Calling MCP tools with proper error handling
3. Fallback to mock implementations for demonstration purposes

## Explorations
- On-device execution of gemma-3-4b-it-GGUF as the model provider for MCP servlets (WIP)
- ElectricSQL integration for CRDTs and client side SQLite

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/tiles.git
   cd tiles
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Development

To run the development server:

```bash
npm run start
```

This will start the server at http://localhost:3000.

## Building

To build the project:

```bash
npm run build
```

This will:
1. Build the JavaScript bundle
2. Extract the HTML, JavaScript, and manifest from the source code
3. Save them to the `build` directory

## Serving the Built Files

To serve the built files:

```bash
npm run serve
```

This will start a server at http://localhost:3000 that serves the files from the `build` directory.

## Running WASM Runner Demos

The project includes a WASM runner demo in the `packages/wasm-runner` directory. To run the demo:

1. Navigate to the wasm-runner directory:
   ```bash
   cd packages/wasm-runner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

This will start the WASM runner demo at http://localhost:3000. The demo showcases:
- WASM module execution in the browser
- Integration with MCP serverlets
- Real-time code execution and visualization

## Project Structure

- `index.ts`: Main entry point for the application
- `build.js`: Build script to extract HTML and JavaScript from index.ts
- `server.js`: Server script to serve the built files
- `build/`: Directory containing the built files
  - `index.html`: HTML file for the web applet
  - `applet.js`: JavaScript file for the web applet
  - `manifest.json`: Manifest file for the web applet
  - `index.js`: Built JavaScript bundle
- `packages/wasm-runner/`: WASM execution demo and playground
  - `pages/`: Next.js pages and components
  - `lib/`: Core WASM execution logic
  - `public/`: Static assets

## License

Apache License 2.0.
© 2025 Tiles HQ. All rights reserved. 