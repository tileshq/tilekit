# WebAssembly Runner

A simple Next.js application that runs WebAssembly plugins using the Extism JS SDK.

## Features

- Upload and run custom WebAssembly (.wasm) files
- Use bundled example WASM files
- Configure function name, input, and plugin configuration
- Support for extism:host/env imports

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Using the WebAssembly Runner

1. Select a WASM file by either:
   - Uploading your own WASM file
   - Using one of the bundled example WASM files

2. Configure the execution:
   - Function Name: The exported function name to call (default: "call")
   - Input: The input to pass to the WebAssembly function
   - Config: Optional JSON configuration for the plugin

3. Click "Run WASM" to execute the WebAssembly plugin

## Example: Running eval-js.wasm

1. Click the "eval-js.wasm" button
2. Set Function Name to "call"
3. Input the following:
```json
{
  "params": {
    "name": "eval-js",
    "arguments": {
      "code": "2 + 2"
    }
  }
}
```
4. Click "Run WASM"

## Learn More

To learn more about WebAssembly and Extism, check out the following resources:

- [Extism Documentation](https://extism.org/docs)
- [WebAssembly Official Site](https://webassembly.org/)