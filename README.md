# Tiles - Web Applets + MCP.run Serverlets Integration

This example demonstrates how to integrate [Unternet Web Applets](https://github.com/unternet-organization/web-applets) with [MCP.run Serverlets](https://github.com/dylibso/mcp.run-servlets) running client-side using the `@dylibso/mcpx` package.

## Integration Approach

This example demonstrates a simple web application that:

1. Provides a web applet interface with a defined action (`greet`)
2. Implements the Web Applets protocol for communication
3. Calls a simulated MCP.run serverlet on the client side

## Key Components

- **Web Applet Interface**: Follows the Web Applets specification for defining actions and handling messages
- **MCP.run Serverlet API**: Simulates the behavior of a serverlet using the same response format
- **Client-Side Integration**: Shows how serverlet calls can be made from the browser

## Running the Example

1. Install dependencies:
   ```
   bun install
   ```

2. Start the server:
   ```
   bun start
   ```

3. Open http://localhost:3000 in your browser

## Extending the Example

To create a more sophisticated integration:

1. Create a real MCP.run serverlet using the Extism PDK
2. Use the `@dylibso/mcpx` package to load and execute the serverlet
3. Build a more complex Web Applet that leverages multiple serverlet capabilities

## Architecture

```
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│   Web Applet    │<────>│   MCP.run SDK   │
│   (Frontend)    │      │   (Client-side) │
│                 │      │                 │
└─────────────────┘      └─────────────────┘
        ^                        ^
        │                        │
        │                        │
        v                        v
┌─────────────────────────────────────────┐
│                                         │
│         Messaging Protocol              │
│     (Actions, Data, Events, etc.)       │
│                                         │
└─────────────────────────────────────────┘
```

## Resources

- [Web Applets Documentation](https://unternet.co/docs/web-applets/introduction)
- [MCP.run Serverlets Repository](https://github.com/dylibso/mcp.run-servlets)
- [Model Context Protocol](https://modelcontextprotocol.github.io/)