# Tiles - Web Applet + MCP.run Integration

This project demonstrates the integration of Unternet web applets with mcp.run serverlets.

## Features

- Greeting serverlet: Greet a person by name
- HTML to Markdown serverlet: Convert a webpage to markdown format

## Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/tiles.git
   cd tiles
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

## Development

To run the development server:

```bash
bun run start
```

This will start the server at http://localhost:3000.

## Building

To build the project:

```bash
bun run build
```

This will:
1. Build the JavaScript bundle
2. Extract the HTML, JavaScript, and manifest from the source code
3. Save them to the `build` directory

## Serving the Built Files

To serve the built files:

```bash
bun run serve
```

This will start a server at http://localhost:3000 that serves the files from the `build` directory.

## Project Structure

- `index.ts`: Main entry point for the application
- `build.js`: Build script to extract HTML and JavaScript from index.ts
- `server.js`: Server script to serve the built files
- `build/`: Directory containing the built files
  - `index.html`: HTML file for the web applet
  - `applet.js`: JavaScript file for the web applet
  - `manifest.json`: Manifest file for the web applet
  - `index.js`: Built JavaScript bundle

## MCP.run Integration

This project demonstrates how to integrate with mcp.run serverlets. It includes:

1. Session management with MCP
2. Calling MCP tools with proper error handling
3. Fallback to mock implementations for demonstration purposes

## License

See the [LICENSE](LICENSE) file for details.