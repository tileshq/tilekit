import { WasmExecutor, WasmExecutorOptions, createWasmExecutorFromBuffer } from './wasm-executor';

export interface McpServlet {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  meta?: {
    author?: string;
    version?: string;
    license?: string;
    lastContentAddress?: string;
    schema?: {
      tools?: Array<{
        name: string;
        description: string;
        inputSchema: {
          type: string;
          properties: Record<string, any>;
          required?: string[];
        };
      }>;
    };
  };
  binding?: {
    contentAddress?: string;
  };
  interface?: {
    function?: string;
  };
}

export interface McpExecutorOptions extends WasmExecutorOptions {
  baseUrl?: string;
  proxyUrl?: string;
}

export class McpClient {
  private baseUrl: string;
  private proxyUrl?: string;

  constructor(options: McpExecutorOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://www.mcp.run/api';
    this.proxyUrl = options.proxyUrl;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = this.proxyUrl 
      ? `${this.proxyUrl}?path=${encodeURIComponent(path)}`
      : `${this.baseUrl}/${path}`;

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`MCP API error: ${response.statusText}`);
    }
    return response;
  }

  async listServlets(): Promise<McpServlet[]> {
    const response = await this.fetch('servlets');
    return response.json();
  }

  async getServlet(slug: string): Promise<McpServlet> {
    const response = await this.fetch(`servlets/${slug}`);
    return response.json();
  }

  async createServletExecutor(
    servlet: McpServlet,
    options: McpExecutorOptions = {}
  ): Promise<WasmExecutor> {
    const contentAddress = servlet.meta?.lastContentAddress || 
                          servlet.binding?.contentAddress;
    
    if (!contentAddress) {
      throw new Error('Servlet has no content address');
    }

    const response = await this.fetch(`c/${contentAddress}`);
    const buffer = await response.arrayBuffer();

    // Merge options with servlet metadata
    const executorOptions: WasmExecutorOptions = {
      ...options,
      config: {
        ...options.config,
        servletSlug: servlet.slug,
        servletName: servlet.name,
      }
    };

    return createWasmExecutorFromBuffer(buffer, executorOptions);
  }
}

// Helper function to create an MCP client
export function createMcpClient(options: McpExecutorOptions = {}): McpClient {
  return new McpClient(options);
}

// Helper function to directly create a servlet executor
export async function createServletExecutor(
  slug: string,
  options: McpExecutorOptions = {}
): Promise<WasmExecutor> {
  const client = new McpClient(options);
  const servlet = await client.getServlet(slug);
  return client.createServletExecutor(servlet, options);
} 