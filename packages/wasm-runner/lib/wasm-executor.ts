import { createPlugin } from 'extism';

export interface WasmExecutorOptions {
  useWasi?: boolean;
  config?: Record<string, any>;
  allowedHosts?: string[];
  allowedPaths?: Record<string, string>;
  logLevel?: string;
  runInWorker?: boolean;
}

export interface WasmExecutorResult {
  output: string;
  error?: string;
}

/**
 * Check if SharedArrayBuffer is available (required for threaded WASM)
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && typeof window !== 'undefined' && window.crossOriginIsolated === true;
}

export class WasmExecutor {
  private plugin: any;

  constructor(wasmBuffer: ArrayBuffer, options: WasmExecutorOptions = {}) {
    this.plugin = null;
    this.initialize(wasmBuffer, options);
  }

  private async initialize(wasmBuffer: ArrayBuffer, options: WasmExecutorOptions): Promise<void> {
    const pluginOptions: any = {
      useWasi: options.useWasi ?? true,
      config: options.config || {},
    };
    
    // Only use worker if supported and explicitly requested
    if (options.runInWorker) {
      // Check if SharedArrayBuffer is available
      if (isSharedArrayBufferAvailable()) {
        pluginOptions.runInWorker = true;
      } else {
        console.warn(
          'SharedArrayBuffer is not available. Cross-Origin Isolation is required for threaded WASM. ' +
          'Check that your server has the proper COOP/COEP headers. ' +
          'Falling back to single-threaded mode.'
        );
        pluginOptions.runInWorker = false;
      }
    } else {
      pluginOptions.runInWorker = false;
    }

    if (options.allowedHosts?.length) {
      pluginOptions.allowedHosts = options.allowedHosts;
    }

    if (options.allowedPaths && Object.keys(options.allowedPaths).length > 0) {
      pluginOptions.allowedPaths = options.allowedPaths;
    }

    if (options.logLevel) {
      pluginOptions.logger = console;
      pluginOptions.logLevel = options.logLevel;
    }

    this.plugin = await createPlugin(wasmBuffer, pluginOptions);
  }

  async execute(functionName: string, input: string): Promise<WasmExecutorResult> {
    try {
      const outputBuffer = await this.plugin.call(functionName, input);
      return {
        output: outputBuffer?.text() || ''
      };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async free(): Promise<void> {
    if (this.plugin) {
      // Clean up resources if needed
      this.plugin = null;
    }
  }
}

// Helper function to create a WASM executor from a file
export async function createWasmExecutorFromFile(
  file: File,
  options: WasmExecutorOptions = {}
): Promise<WasmExecutor> {
  const arrayBuffer = await file.arrayBuffer();
  return new WasmExecutor(arrayBuffer, options);
}

// Helper function to create a WASM executor from a buffer
export async function createWasmExecutorFromBuffer(
  buffer: ArrayBuffer,
  options: WasmExecutorOptions = {}
): Promise<WasmExecutor> {
  return new WasmExecutor(buffer, options);
} 