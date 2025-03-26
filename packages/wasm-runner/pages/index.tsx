import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createPortal } from 'react-dom';
import type { NextPage } from 'next';
import { 
  createMcpClient, 
  createWasmExecutorFromFile,
  type McpServlet,
  type WasmExecutorOptions,
  isSharedArrayBufferAvailable
} from '../lib';

interface Servlet {
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
      }>
    };
  };
  binding?: {
    contentAddress?: string;
  };
  interface?: {
    function?: string;
  };
}

interface ArtifactData {
  toolName: string;
  result: any;
  isError?: boolean;
}

interface ToolResult {
  toolName: string;
  result?: any;
  error?: string;
}

interface ConversationMessage {
  role: string;
  content: any;
  type?: string;
}

const Home: NextPage = () => {
  const [wasmFile, setWasmFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>('');
  const [input, setInput] = useState<string>('');
  const [config, setConfig] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [servletLoading, setServletLoading] = useState<boolean>(false);
  const [selectedFunction, setSelectedFunction] = useState<string>('call');
  const [servlets, setServlets] = useState<Servlet[]>([]);
  const [selectedServlet, setSelectedServlet] = useState<string>('');
  const [servletMetadata, setServletMetadata] = useState<Servlet | null>(null);
  const [message, setMessage] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [agentMode, setAgentMode] = useState<boolean>(true);
  const [artifactData, setArtifactData] = useState<ArtifactData | null>(null);
  const [allowedHosts, setAllowedHosts] = useState<string>('');
  const [allowedPaths, setAllowedPaths] = useState<string>('');
  const [logLevel, setLogLevel] = useState<string>('');
  const [runInWorker, setRunInWorker] = useState<boolean>(true);
  const [isSharedArrayBufferAvail, setIsSharedArrayBufferAvail] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Check if SharedArrayBuffer is available
  useEffect(() => {
    setIsSharedArrayBufferAvail(isSharedArrayBufferAvailable());
  }, []);
  
  // Create MCP client with proxy
  const mcpClient = createMcpClient({
    proxyUrl: '/api/proxy'
  });
  
  // Fetch servlets when component mounts
  useEffect(() => {
    fetchServlets();
  }, []);
  
  // Update iframe content when artifact data changes
  useEffect(() => {
    if (!artifactData) return;
    
    // Generate HTML for the artifact
    const html = generateArtifactHtml(artifactData.result, artifactData.toolName);
    
    // Create a Blob with the HTML content
    const blob = new Blob([html], { type: 'text/html' });
    
    // Create a URL for the Blob
    const blobUrl = URL.createObjectURL(blob);
    
    // Update the iframe src to use the blob URL
    if (iframeRef.current) {
      iframeRef.current.src = blobUrl;
    }
    
    // Clean up the URL when we're done with it
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [artifactData]);
  
  // Function to generate artifact HTML for tool results
  const generateArtifactHtml = (toolResult: any, toolName: string): string => {
    if (!toolResult) return '<div class="error">No result available</div>';
    
    let content = '';
    const isError = toolResult.error !== undefined;
    
    // Generate appropriate HTML based on tool result type
    if (isError) {
      content = `<div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-message">${toolResult.error}</div>
      </div>`;
    } else if (typeof toolResult === 'object') {
      // For JSON results, create a nice interactive tree view
      try {
        // For better JSON visualization, we'll create an interactive viewer
        content = `
          <div class="json-result">
            <div class="json-controls">
              <button id="expandAll">Expand All</button>
              <button id="collapseAll">Collapse All</button>
              <button id="copyJSON">Copy JSON</button>
            </div>
            <div id="jsonViewer" class="json-viewer">
              <pre>${JSON.stringify(toolResult, null, 2)}</pre>
            </div>
          </div>
          <script>
            document.getElementById('expandAll').addEventListener('click', function() {
              // Implement expand logic if needed
              alert('Expand all functionality would go here');
            });
            
            document.getElementById('collapseAll').addEventListener('click', function() {
              // Implement collapse logic if needed
              alert('Collapse all functionality would go here');
            });
            
            document.getElementById('copyJSON').addEventListener('click', function() {
              const jsonText = ${JSON.stringify(JSON.stringify(toolResult, null, 2))};
              navigator.clipboard.writeText(jsonText)
                .then(() => {
                  alert('JSON copied to clipboard');
                })
                .catch(err => {
                  console.error('Could not copy JSON: ', err);
                });
            });
          </script>
        `;
      } catch (e) {
        content = `<div class="json-result">
          <pre>${JSON.stringify(toolResult, null, 2)}</pre>
        </div>`;
      }
    } else if (typeof toolResult === 'string') {
      if (toolResult.startsWith('<html>') || toolResult.startsWith('<!DOCTYPE')) {
        // If the result is already HTML, use it directly
        content = toolResult;
      } else if (toolResult.startsWith('{') && toolResult.endsWith('}')) {
        // Try to parse as JSON if it looks like JSON
        try {
          const jsonObj = JSON.parse(toolResult);
          content = `
            <div class="json-result">
              <pre>${JSON.stringify(jsonObj, null, 2)}</pre>
            </div>`;
        } catch (e) {
          // If not valid JSON, treat as text
          content = formatTextContent(toolResult);
        }
      } else {
        // For plain text results, format it nicely
        content = formatTextContent(toolResult);
      }
    } else {
      // Default case
      content = `<div class="text-result">${String(toolResult)}</div>`;
    }
    
    // Helper function to format text content with syntax highlighting for code blocks
    function formatTextContent(text: string): string {
      // Handle markdown-style code blocks
      const formattedText = text
        .replace(/\n```([a-z]*)\n([\s\S]*?)\n```/g, (match, language, code) => {
          return `<div class="code-block ${language}"><pre>${code}</pre></div>`;
        })
        // Replace URLs with clickable links
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>')
        // Add paragraph breaks
        .replace(/\n\n/g, '</p><p>');
      
      return `<div class="text-result"><p>${formattedText}</p></div>`;
    }
    
    // Generate the full HTML document with styles
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${toolName} Result</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
          line-height: 1.5;
          color: #333;
          padding: 1rem;
          margin: 0;
          background-color: #f9f9f9;
        }
        
        /* Header styling */
        .artifact-header {
          display: flex;
          align-items: center;
          padding-bottom: 0.5rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #e0e0e0;
          position: sticky;
          top: 0;
          background-color: #f9f9f9;
          z-index: 10;
        }
        
        .tool-name {
          font-weight: 600;
          font-size: 1.25rem;
          color: #0070f3;
          margin: 0;
        }
        
        /* Main content container */
        .result-container {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 1rem;
          max-height: calc(100vh - 120px);
          overflow: auto;
        }
        
        /* Text result styling */
        .text-result {
          white-space: pre-wrap;
          font-size: 0.9rem;
          line-height: 1.6;
        }
        
        .text-result p {
          margin-top: 0;
          margin-bottom: 1rem;
        }
        
        .text-result a {
          color: #0070f3;
          text-decoration: none;
        }
        
        .text-result a:hover {
          text-decoration: underline;
        }
        
        /* Code block styling */
        .code-block {
          background-color: #f5f5f5;
          border-radius: 4px;
          border-left: 3px solid #0070f3;
          padding: 0.75rem;
          margin: 1rem 0;
          overflow-x: auto;
        }
        
        .code-block pre {
          margin: 0;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
          font-size: 0.85rem;
        }
        
        /* Different language highlighting */
        .code-block.javascript, .code-block.js {
          border-left-color: #f7df1e;
        }
        
        .code-block.python, .code-block.py {
          border-left-color: #3572A5;
        }
        
        .code-block.html {
          border-left-color: #e34c26;
        }
        
        .code-block.css {
          border-left-color: #563d7c;
        }
        
        /* JSON result styling */
        .json-result {
          background-color: #f8f8f8;
          border-radius: 6px;
          padding: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .json-controls {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        
        .json-controls button {
          background-color: #f0f7ff;
          color: #0070f3;
          border: 1px solid #d1e9ff;
          padding: 0.3rem 0.6rem;
          font-size: 0.8rem;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .json-controls button:hover {
          background-color: #0070f3;
          color: white;
        }
        
        .json-viewer {
          background-color: #fff;
          border-radius: 4px;
          border: 1px solid #eaeaea;
          padding: 0.75rem;
          overflow: auto;
          max-height: 300px;
        }
        
        .json-viewer pre {
          margin: 0;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
          font-size: 0.85rem;
          line-height: 1.5;
        }
        
        /* Error styling */
        .error-container {
          display: flex;
          align-items: center;
          background-color: #fff0f0;
          border-left: 3px solid #ff4d4f;
          padding: 0.75rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        
        .error-icon {
          font-size: 1.25rem;
          margin-right: 0.75rem;
        }
        
        .error-message {
          color: #cf1322;
          font-size: 0.9rem;
        }
        
        /* Button styling */
        button {
          background-color: #0070f3;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          margin-top: 0.5rem;
          transition: background-color 0.2s;
        }
        
        button:hover {
          background-color: #0051a2;
        }
        
        /* Responsive styling */
        @media (max-width: 600px) {
          body {
            padding: 0.5rem;
          }
          
          .result-container {
            padding: 0.75rem;
          }
          
          .json-controls {
            flex-wrap: wrap;
          }
          
          .tool-name {
            font-size: 1.1rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="artifact-header">
        <h1 class="tool-name">${toolName} Result</h1>
      </div>
      <div class="result-container">
        ${content}
      </div>
    </body>
    </html>`;
  };

  // Update fetchServlets to use mcpClient
  const fetchServlets = async (): Promise<void> => {
    try {
      const servletList = await mcpClient.listServlets();
      setServlets(servletList);
    } catch (error) {
      console.error("Error fetching servlets:", error);
      setResult(`Error fetching servlets list: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Update fetchServletContent to use mcpClient
  const fetchServletContent = async (slug: string): Promise<void> => {
    if (!slug) return;

    setServletLoading(true);
    setServletMetadata(null);
    
    try {
      const servletData = await mcpClient.getServlet(slug);
      setServletMetadata(servletData);
      
      const executor = await mcpClient.createServletExecutor(servletData);
      // Store executor or its output as needed
      // ... 
    } catch (error) {
      console.error("Error fetching servlet content:", error);
      setResult(`Error fetching servlet content: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setServletLoading(false);
    }
  };

  // Handle servlet selection
  const handleServletChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const servlet = e.target.value;
    setSelectedServlet(servlet);
    if (servlet) {
      fetchServletContent(servlet);
    } else {
      setServletMetadata(null); // Clear metadata if no servlet is selected
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      setWasmFile(e.target.files[0]);
      setSelectedServlet(''); // Clear servlet selection when uploading a file
      setServletMetadata(null); // Clear servlet metadata
    }
  };

  const handlePredefinedWasm = async (fileName: string): Promise<void> => {
    try {
      const response = await fetch(`/wasm/${fileName}`);
      const buffer = await response.arrayBuffer();
      const file = new File([buffer], fileName, { type: 'application/wasm' });
      setWasmFile(file);
      setSelectedServlet(''); // Clear servlet selection when selecting predefined WASM
      setServletMetadata(null); // Clear servlet metadata
    } catch (error) {
      console.error("Error loading predefined WASM:", error);
      setResult(`Error loading ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Update runWasm to use WasmExecutor
  const runWasm = async (): Promise<void> => {
    if (!wasmFile) {
      setResult('Please select a WASM file or servlet first');
      return;
    }

    setIsLoading(true);
    setResult('');

    try {
      // Setup executor options
      const executorOptions: WasmExecutorOptions = {
        useWasi: true,
        config: config.trim() ? JSON.parse(config) : {},
        runInWorker,
        allowedHosts: allowedHosts.trim() ? allowedHosts.split(',').map(host => host.trim()) : undefined,
        logLevel: logLevel.trim() || undefined
      };

      // Add allowed paths if provided
      if (allowedPaths.trim()) {
        executorOptions.allowedPaths = {};
        for (const pathPair of allowedPaths.split(',')) {
          const [hostPath, guestPath] = pathPair.split(':').map(p => p.trim());
          if (hostPath && guestPath) {
            executorOptions.allowedPaths[hostPath] = guestPath;
          } else {
            throw new Error(`Invalid path format: ${pathPair}. Should be /host/path:/guest/path`);
          }
        }
      }

      // Create and execute WASM
      const executor = await createWasmExecutorFromFile(wasmFile, executorOptions);
      const result = await executor.execute(selectedFunction || 'call', input);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setResult(result.output);
      
      // Clean up
      await executor.free();
    } catch (error) {
      console.error("WASM execution error:", error);
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Process natural language prompt using Claude and servlet tools
  const processPrompt = async (): Promise<void> => {
    if (!selectedServlet || !servletMetadata) {
      setResult('Please select a servlet first');
      return;
    }
    
    if (!message.trim()) {
      setResult('Please enter a prompt');
      return;
    }
    
    setIsLoading(true);
    setResult('');
    setArtifactData(null); // Clear any previous artifact data
    setConversationHistory([
      { role: 'user', content: message }
    ]);
    
    try {
      // Create tools from servlet metadata
      const servletTools: Array<{
        name: string;
        description: string;
        inputSchema: any;
        servletSlug: string;
      }> = [];
      
      // Check if the servlet has tools defined in its metadata
      if (servletMetadata.meta?.schema?.tools && servletMetadata.meta.schema.tools.length > 0) {
        // Use the tools directly from the servlet metadata
        servletTools.push(...servletMetadata.meta.schema.tools.map(tool => ({
          ...tool,
          name: tool.name.split('/').pop() || tool.name,
          servletSlug: selectedServlet
        })));
      } else {
        // Create a default tool for the servlet
        servletTools.push({
          name: (servletMetadata.name || selectedServlet).split('/').pop() || selectedServlet,
          description: servletMetadata.description || `Execute ${selectedServlet} servlet`,
          inputSchema: {
            type: "object",
            properties: {},
          },
          servletSlug: selectedServlet
        });
      }
      
      // Prepare servlet info
      const contentAddress = servletMetadata.meta?.lastContentAddress || 
                            (servletMetadata.binding?.contentAddress);
      
      // Prepare plugin options
      const pluginOptions: any = {
        functionName: servletMetadata.interface?.function || selectedFunction || 'call',
        config: config ? JSON.parse(config) : {},
        runInWorker
      };
      
      // Add allowed hosts if provided
      if (allowedHosts.trim()) {
        pluginOptions.allowedHosts = allowedHosts.split(',').map(host => host.trim());
      }
      
      // Add allowed paths if provided
      if (allowedPaths.trim()) {
        pluginOptions.allowedPaths = {};
        for (const pathPair of allowedPaths.split(',')) {
          const [hostPath, guestPath] = pathPair.split(':').map(p => p.trim());
          if (hostPath && guestPath) {
            pluginOptions.allowedPaths[hostPath] = guestPath;
          }
        }
      }
      
      // Add log level if provided
      if (logLevel.trim()) {
        pluginOptions.logLevel = logLevel;
      }
                            
      const servletInfoList = [{
        slug: selectedServlet,
        contentAddress,
        ...pluginOptions
      }];
      
      // Call the conversation API
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: message,
          servletTools,
          servletInfoList
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Display the final message
      setResult(data.finalMessage.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n'));
      
      // Set conversation history
      setConversationHistory(data.conversationHistory);
      
      // Find tool results to display as artifacts
      const toolResults = data.conversationHistory.find(
        (msg: ConversationMessage) => msg.role === 'user' && msg.type === 'tool_results'
      );
      
      if (toolResults && toolResults.content && toolResults.content.length > 0) {
        // Use the last tool result as the artifact
        const lastToolResult: ToolResult = toolResults.content[toolResults.content.length - 1];
        setArtifactData({
          toolName: lastToolResult.toolName,
          result: lastToolResult.result || lastToolResult.error,
          isError: !!lastToolResult.error
        });
      }
      
    } catch (error) {
      console.error("Error processing prompt:", error);
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setArtifactData(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <Head>
        <title>Tilekit</title>
        <meta name="description" content="Personal software framework that powers the tiles.run notebook interface." />
        <link rel="icon" href="/icons/favicon.ico" />
      </Head>

      <main>
        <div className="title-container">
          <img src="/icons/tilekit.svg" alt="tilekit.dev logo" className="title-icon" />
          <h1>Tilekit</h1>
        </div>
        
        <p className="subtitle">The present demo shows WebAssembly packaged MCP serverlets running locally.</p>
        
        {!isSharedArrayBufferAvail && (
          <div className="warning-banner">
            <div className="warning-icon">⚠️</div>
            <div className="warning-text">
              <strong>Notice:</strong> Cross-Origin Isolation is not enabled. WASM will run in single-threaded mode.
              {process.env.NODE_ENV === 'development' && (
                <span> This may be because you're running in development mode. The production build should have this enabled.</span>
              )}
            </div>
          </div>
        )}
        
        <div className="card">
          <h2>1. Select the MCP servlet</h2>
          
          <div className="input-group">
            <label>
              Select a Servlet from MCP.run:
              <select 
                value={selectedServlet} 
                onChange={handleServletChange}
                disabled={servletLoading}
                className="servlet-select"
              >
                <option value="">-- Select a Servlet --</option>
                {servlets.map((servlet) => (
                  <option key={servlet.slug} value={servlet.slug}>
                    {servlet.slug}
                  </option>
                ))}
              </select>
              {servletLoading && <span className="loading-text">Loading servlet...</span>}
            </label>
          </div>
          
          <p className="or-divider">OR</p>
          
          <div className="file-selector">
            <input
              type="file"
              accept=".wasm"
              onChange={handleFileChange}
              ref={fileInputRef}
            />
            <p>Or use a predefined WASM file:</p>
            <div className="button-group">
              <button onClick={() => handlePredefinedWasm('eval-js.wasm')}>
                eval-js.wasm
              </button>
            </div>
            {wasmFile && (
              <p className="selected-file">
                Selected: {wasmFile.name}
              </p>
            )}
          </div>
          
          {/* Display servlet metadata when available */}
          {servletMetadata && (
            <div className="servlet-metadata">
              <h3>Servlet Information</h3>
              
              {/* Description - display if available */}
              {servletMetadata.description && (
                <div className="metadata-item">
                  <strong>Description:</strong> {servletMetadata.description}
                </div>
              )}
              
              {/* Name - display if available */}
              {servletMetadata.name && (
                <div className="metadata-item">
                  <strong>Name:</strong> {servletMetadata.name}
                </div>
              )}
              
              {/* Tags - display if available */}
              {servletMetadata.tags && servletMetadata.tags.length > 0 && (
                <div className="metadata-item">
                  <strong>Tags:</strong> {servletMetadata.tags.join(', ')}
                </div>
              )}
              
              {/* Creation date - display if available */}
              {servletMetadata.created && (
                <div className="metadata-item">
                  <strong>Created:</strong> {new Date(servletMetadata.created).toLocaleString()}
                </div>
              )}
              
              {/* Updated date - display if available */}
              {servletMetadata.updated && (
                <div className="metadata-item">
                  <strong>Updated:</strong> {new Date(servletMetadata.updated).toLocaleString()}
                </div>
              )}
              
              {/* Author, version, license from meta */}
              {servletMetadata.meta && (
                <>
                  {servletMetadata.meta.author && (
                    <div className="metadata-item">
                      <strong>Author:</strong> {servletMetadata.meta.author}
                    </div>
                  )}
                  {servletMetadata.meta.version && (
                    <div className="metadata-item">
                      <strong>Version:</strong> {servletMetadata.meta.version}
                    </div>
                  )}
                  {servletMetadata.meta.license && (
                    <div className="metadata-item">
                      <strong>License:</strong> {servletMetadata.meta.license}
                    </div>
                  )}
                </>
              )}
              
              {/* Tools section */}
              {servletMetadata.meta?.schema?.tools && servletMetadata.meta.schema.tools.length > 0 && (
                <div className="metadata-item tools-section">
                  <strong>Available Tools:</strong>
                  {servletMetadata.meta.schema.tools.map((tool, index) => (
                    <div key={index} className="tool-item">
                      <h4>{tool.name}</h4>
                      <p>{tool.description}</p>
                      
                      {tool.inputSchema && (
                        <div className="tool-input-schema">
                          <h5>Input Requirements:</h5>
                          
                          {/* Required fields */}
                          {tool.inputSchema.required && tool.inputSchema.required.length > 0 && (
                            <div className="required-fields">
                              <strong>Required fields:</strong> {tool.inputSchema.required.join(', ')}
                            </div>
                          )}
                          
                          {/* Properties */}
                          {tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                            <div className="input-properties">
                              <strong>Properties:</strong>
                              <ul>
                                {Object.entries(tool.inputSchema.properties).map(([propName, propDetails]) => (
                                  <li key={propName}>
                                    <code>{propName}</code> ({(propDetails as any).type}): 
                                    {(propDetails as any).description && <span> {(propDetails as any).description}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Debug section to show raw metadata - can be commented out in production */}
              <div className="metadata-debug">
                <details>
                  <summary>View Raw Metadata</summary>
                  <pre className="raw-metadata">
                    {JSON.stringify(servletMetadata, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>2. {agentMode ? "AI Assistant Mode" : "Manual Mode"}</h2>
          
          <div className="mode-toggle">
            <button 
              onClick={() => setAgentMode(false)} 
              className={`mode-button ${!agentMode ? 'active' : ''}`}
            >
              Manual Mode
            </button>
            <button 
              onClick={() => setAgentMode(true)} 
              className={`mode-button ${agentMode ? 'active' : ''}`}
            >
              AI Assistant Mode
            </button>
          </div>
          
          {agentMode ? (
            <div className="ai-mode">
              <div className="prompt-container">
                <div className="prompt-input-container">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask in natural language what you'd like the servlet to do..."
                    rows={2}
                    className="prompt-input"
                  />
                  <select 
                    value={selectedServlet} 
                    onChange={handleServletChange}
                    disabled={servletLoading || isLoading}
                    className="servlet-select-inline"
                  >
                    <option value="">-- Select Servlet --</option>
                    {servlets.map((servlet) => (
                      <option key={servlet.slug} value={servlet.slug}>
                        {servlet.slug}
                      </option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={processPrompt}
                  disabled={isLoading || !selectedServlet || servletLoading || !message.trim()}
                  className="run-button"
                >
                  {isLoading ? 'Processing...' : 'Send'}
                </button>
                
                {/* Config field for AI mode */}
                <div className="input-group small-margin-top">
                  <label>
                    Config (JSON):
                    <textarea
                      value={config}
                      onChange={(e) => setConfig(e.target.value)}
                      placeholder='{"key": "value"}'
                      rows={2}
                      className="config-input"
                    />
                  </label>
                </div>
                
                <div className="advanced-options-toggle">
                  <details>
                    <summary>Advanced Options</summary>
                    <div className="advanced-options">
                      <div className="input-group">
                        <label>
                          Allowed Hosts (comma separated):
                          <input
                            type="text"
                            value={allowedHosts}
                            onChange={(e) => setAllowedHosts(e.target.value)}
                            placeholder="example.com,api.example.org"
                            className="small-input"
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Allowed Paths (host:guest, comma separated):
                          <input
                            type="text"
                            value={allowedPaths}
                            onChange={(e) => setAllowedPaths(e.target.value)}
                            placeholder="/host/path:/guest/path,/another/host:/another/guest"
                            className="small-input"
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Log Level:
                          <select 
                            value={logLevel}
                            onChange={(e) => setLogLevel(e.target.value)}
                            className="small-select"
                          >
                            <option value="">-- None --</option>
                            <option value="error">Error</option>
                            <option value="warn">Warning</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                            <option value="trace">Trace</option>
                          </select>
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={runInWorker}
                            onChange={(e) => setRunInWorker(e.target.checked)}
                          />
                          Run in Web Worker (Recommended)
                        </label>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              
              {conversationHistory.length > 0 && (
                <div className="conversation-history">
                  <h3>Conversation</h3>
                  <div className="conversation-container">
                    {conversationHistory.map((msg, index) => (
                      <div key={index} className={`message ${msg.role}`}>
                        {msg.type === 'tool_results' ? (
                          <div className="tool-results">
                            <h4>Tool Results:</h4>
                            {(msg.content as ToolResult[]).map((tool, toolIndex) => (
                              <div key={toolIndex} className="tool-result-item">
                                <div className="tool-result-header">
                                  <strong>{tool.toolName}:</strong>
                                  <button 
                                    className="view-artifact-button"
                                    onClick={() => setArtifactData({
                                      toolName: tool.toolName,
                                      result: tool.result || tool.error,
                                      isError: !!tool.error
                                    })}
                                  >
                                    View as Artifact
                                  </button>
                                </div>
                                <pre className="tool-result-content">
                                  {typeof tool.result === 'object' 
                                    ? JSON.stringify(tool.result, null, 2)
                                    : tool.result || tool.error}
                                </pre>
                              </div>
                            ))}
                          </div>
                        ) : Array.isArray(msg.content) ? (
                          <div className="message-content">
                            {msg.content
                              .filter((block: any) => block.type === 'text')
                              .map((block: any, blockIndex: number) => (
                                <div key={blockIndex}>{block.text}</div>
                              ))}
                            {msg.content
                              .filter((block: any) => block.type === 'tool_use')
                              .map((block: any, blockIndex: number) => (
                                <div key={blockIndex} className="tool-use">
                                  <strong>Using Tool: {block.name}</strong>
                                  <pre className="tool-use-input">
                                    {JSON.stringify(block.input, null, 2)}
                                  </pre>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="message-content">{msg.content}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="manual-mode">
              <div className="input-group">
                <label>
                  Function Name:
                  <input
                    type="text"
                    value={selectedFunction}
                    onChange={(e) => setSelectedFunction(e.target.value)}
                    placeholder="Function name (default: call)"
                  />
                </label>
              </div>

              <div className="input-group">
                <label>
                  Input:
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter input for the WASM function"
                    rows={5}
                  />
                </label>
              </div>

              <div className="input-group">
                <label>
                  Config (JSON):
                  <textarea
                    value={config}
                    onChange={(e) => setConfig(e.target.value)}
                    placeholder='{"key": "value"}'
                    rows={3}
                  />
                </label>
              </div>
              
              <div className="input-group">
                <label>
                  Allowed Hosts (comma separated):
                  <input
                    type="text"
                    value={allowedHosts}
                    onChange={(e) => setAllowedHosts(e.target.value)}
                    placeholder="example.com,api.example.org"
                  />
                </label>
              </div>
              
              <div className="input-group">
                <label>
                  Allowed Paths (host:guest, comma separated):
                  <input
                    type="text"
                    value={allowedPaths}
                    onChange={(e) => setAllowedPaths(e.target.value)}
                    placeholder="/host/path:/guest/path,/another/host:/another/guest"
                  />
                </label>
              </div>
              
              <div className="input-group">
                <label>
                  Log Level:
                  <select 
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                  >
                    <option value="">-- None --</option>
                    <option value="error">Error</option>
                    <option value="warn">Warning</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                    <option value="trace">Trace</option>
                  </select>
                </label>
              </div>
              
              <div className="input-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={runInWorker}
                    onChange={(e) => setRunInWorker(e.target.checked)}
                  />
                  Run in Web Worker (Recommended)
                </label>
              </div>

              <button 
                onClick={runWasm}
                disabled={isLoading || !wasmFile || servletLoading}
                className="run-button"
              >
                {isLoading ? 'Running...' : 'Run WASM'}
              </button>
            </div>
          )}
        </div>

        <div className="card result-card">
          <h2>3. Result</h2>
          {artifactData ? (
            <div className="artifact-container">
              <div className="artifact-heading">
                <h3 className="artifact-title">{artifactData.toolName} Artifact</h3>
                <button 
                  className="toggle-view-button"
                  onClick={() => setArtifactData(null)}
                >
                  Show Raw Output
                </button>
              </div>
              <iframe 
                ref={iframeRef}
                className="artifact-iframe"
                title="Tool Result Artifact"
                sandbox="allow-scripts allow-popups allow-same-origin"
                frameBorder="0"
              />
            </div>
          ) : (
            <pre className="result-box">{result || 'No result yet'}</pre>
          )}
        </div>
      </main>

      <footer className="footer">
      Tilekit is the underlying personal software framework that powers the <a href="https://tiles.run/" className="builder-link">tiles.run</a> notebook interface. Github: <a href="https://github.com/Agent54/tilekit/tree/dev/packages/wasm-runner" className="builder-link">Agent54/tilekit</a>
      <br /> Designed and built by <a href="https://ankeshbharti.com" className="builder-link">@feynon</a> and <a href="https://aswinc.blog" className="builder-link">@chandanaveli</a>.
      </footer>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          max-width: 800px;
          margin: 0 auto;
        }

        main {
          padding: 2rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        h1 {
          margin: 0 0 1.5rem;
          line-height: 1.15;
          font-size: 3rem;
          font-weight: 700;
        }

        .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 2rem;
          font-size: 1.1rem;
          max-width: 90%;
        }
        
        .card {
          margin: 1rem 0;
          padding: 1.5rem;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          width: 100%;
        }

        .input-group {
          margin-bottom: 1rem;
        }
        
        .small-margin-top {
          margin-top: 0.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
        }

        input, textarea, select {
          width: 100%;
          padding: 0.5rem;
          margin-top: 0.25rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        input[type="checkbox"] {
          width: auto;
          margin-right: 0.5rem;
        }
        
        .checkbox-label {
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        
        .advanced-options-toggle {
          margin-top: 1rem;
        }
        
        .advanced-options-toggle summary {
          cursor: pointer;
          color: #0070f3;
          font-size: 0.9rem;
          padding: 0.5rem 0;
        }
        
        .advanced-options-toggle summary:hover {
          text-decoration: underline;
        }
        
        .advanced-options {
          background-color: #f5f5f5;
          padding: 0.75rem;
          border-radius: 4px;
          margin-top: 0.5rem;
        }
        
        .small-input, .small-select {
          font-size: 0.9rem;
          padding: 0.4rem;
        }
        
        .servlet-select {
          height: 38px;
        }

        button {
          padding: 0.5rem 1rem;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.3s;
          margin-right: 0.5rem;
          margin-bottom: 0.5rem;
        }

        button:hover {
          background-color: #0051a2;
        }

        button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .run-button {
          margin-top: 1rem;
          width: 100%;
          padding: 0.75rem;
          font-size: 1.1rem;
        }

        .button-group {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .selected-file {
          margin-top: 0.5rem;
          font-weight: bold;
        }
        
        .loading-text {
          display: inline-block;
          margin-left: 0.5rem;
          color: #666;
          font-style: italic;
        }

        .result-card {
          background-color: #f7f7f7;
        }

        .result-box {
          background-color: #333;
          color: #fff;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
          min-height: 100px;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .or-divider {
          text-align: center;
          margin: 1.5rem 0;
          font-weight: bold;
          position: relative;
        }
        
        .or-divider::before,
        .or-divider::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 45%;
          height: 1px;
          background-color: #eaeaea;
        }
        
        .or-divider::before {
          left: 0;
        }
        
        .or-divider::after {
          right: 0;
        }

        .servlet-metadata {
          margin-top: 1.5rem;
          padding: 1rem;
          background-color: #f5f5f5;
          border-radius: 6px;
          border-left: 4px solid #0070f3;
        }
        
        .metadata-item {
          margin-bottom: 0.75rem;
        }
        
        .tools-section {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e0e0e0;
        }
        
        .tool-item {
          background-color: #eef5ff;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 0.75rem;
          border-left: 3px solid #0070f3;
        }
        
        .tool-item h4 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          color: #0051a2;
        }
        
        .tool-item h5 {
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }
        
        .tool-input-schema {
          margin-top: 0.75rem;
          background-color: #f9f9f9;
          padding: 0.75rem;
          border-radius: 4px;
          font-size: 0.9rem;
        }
        
        .required-fields {
          margin-bottom: 0.5rem;
        }
        
        .input-properties {
          margin-top: 0.5rem;
        }
        
        .input-properties ul {
          margin-top: 0.25rem;
          padding-left: 1.5rem;
        }
        
        .input-properties li {
          margin-bottom: 0.25rem;
        }
        
        .example-code {
          background-color: #f0f0f0;
          padding: 0.5rem;
          border-radius: 4px;
          overflow-x: auto;
          margin: 0.5rem 0;
          font-size: 0.9rem;
        }
        
        .metadata-debug {
          margin-top: 1.5rem;
          border-top: 1px dashed #ccc;
          padding-top: 1rem;
        }
        
        .raw-metadata {
          background-color: #f0f0f0;
          padding: 0.5rem;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 0.8rem;
          max-height: 200px;
          overflow-y: auto;
        }
        
        /* Mode toggle styles */
        .mode-toggle {
          display: flex;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 1rem;
        }
        
        .mode-button {
          flex: 1;
          margin: 0 0.25rem;
          background-color: #f0f0f0;
          color: #333;
          border: 1px solid #ddd;
          padding: 0.75rem;
        }
        
        .mode-button.active {
          background-color: #0070f3;
          color: white;
          border: 1px solid #0070f3;
        }
        
        /* AI Assistant mode styles */
        .ai-mode {
          display: flex;
          flex-direction: column;
        }
        
        .prompt-container {
          margin-bottom: 1rem;
        }
        
        .prompt-input-container {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .prompt-input {
          flex: 1;
          resize: none;
          border-radius: 20px;
          padding: 0.75rem 1rem;
        }
        
        .servlet-select-inline {
          width: 150px;
          height: 38px;
          align-self: flex-end;
        }
        
        .config-input {
          resize: none;
          font-size: 0.9rem;
        }
        
        /* Conversation history styles */
        .conversation-history {
          margin-top: 1.5rem;
          border-top: 1px solid #eaeaea;
          padding-top: 1rem;
        }
        
        .conversation-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 400px;
          overflow-y: auto;
          padding: 0.5rem;
          background-color: #f9f9f9;
          border-radius: 6px;
        }
        
        .message {
          padding: 0.75rem;
          border-radius: 8px;
          max-width: 85%;
        }
        
        .message.user {
          align-self: flex-end;
          background-color: #0070f3;
          color: white;
        }
        
        .message.assistant {
          align-self: flex-start;
          background-color: #e9e9e9;
          color: #333;
        }
        
        .tool-results {
          background-color: #e6f7ff;
          padding: 0.5rem;
          border-radius: 4px;
          margin-top: 0.5rem;
          border-left: 2px solid #0070f3;
        }
        
        .tool-results h4 {
          margin-top: 0;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
          color: #0051a2;
        }
        
        .tool-result-item {
          margin-bottom: 0.5rem;
        }
        
        .tool-result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }
        
        .tool-result-item strong {
          color: #333;
        }
        
        .view-artifact-button {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          background-color: #e6f7ff;
          color: #0070f3;
          border: 1px solid #91d5ff;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .view-artifact-button:hover {
          background-color: #0070f3;
          color: white;
          border-color: #0070f3;
        }
        
        .tool-result-content {
          background-color: #fff;
          padding: 0.5rem;
          border-radius: 4px;
          margin: 0.25rem 0;
          font-size: 0.85rem;
          max-height: 150px;
          overflow-y: auto;
          color: #333;
        }
        
        .tool-use {
          background-color: #e6f7ff;
          padding: 0.5rem;
          border-radius: 4px;
          margin-top: 0.5rem;
          border-left: 2px solid #0070f3;
        }
        
        .tool-use-input {
          background-color: #fff;
          padding: 0.5rem;
          border-radius: 4px;
          margin: 0.25rem 0;
          font-size: 0.85rem;
        }
        
        /* Artifact styles */
        .artifact-container {
          background-color: #fff;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          overflow: hidden;
        }
        
        .artifact-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background-color: #f0f7ff;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .artifact-title {
          margin: 0;
          font-size: 1.1rem;
          color: #0070f3;
        }
        
        .toggle-view-button {
          background-color: #ffffff;
          color: #0070f3;
          border: 1px solid #0070f3;
          padding: 0.3rem 0.75rem;
          font-size: 0.8rem;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .toggle-view-button:hover {
          background-color: #0070f3;
          color: white;
        }
        
        .artifact-iframe {
          width: 100%;
          height: 400px;
          border: none;
          overflow: auto;
        }

        .footer {
          text-align: center;
          padding: 2rem 0;
          color: #666;
          font-size: 0.9rem;
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.5;
        }

        .title-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .title-icon {
          width: 40px;
          height: 40px;
          object-fit: contain;
          display: flex;
          align-self: center;
        }

        h1 {
          margin: 0;
          line-height: 1;
          display: flex;
          align-self: center;
        }

        .builder-links {
          margin-top: 1rem;
          display: flex;
          justify-content: center;
          gap: 0.5rem;
          font-size: 0.8rem;
        }

        .builder-link {
          color: #0070f3;
          text-decoration: none;
          position: relative;
        }

        .builder-link::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          bottom: -1px;
          left: 0;
          background-color: #0070f3;
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.3s ease;
        }

        .builder-link:hover::after {
          transform: scaleX(1);
          transform-origin: left;
        }

        .warning-banner {
          display: flex;
          align-items: center;
          background-color: #fff8e1;
          border: 1px solid #ffd54f;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          width: 100%;
        }
        
        .warning-icon {
          font-size: 1.5rem;
          margin-right: 1rem;
        }
        
        .warning-text {
          font-size: 0.9rem;
          line-height: 1.4;
          color: #5d4037;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
};

export default Home;