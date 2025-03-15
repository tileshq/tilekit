// This is a simplified example of integrating mcp.run serverlets with web applets

// Define the MCP URL and parameters for direct API access
const MCP_BASE_URL = "https://api.mcp.run";
const MCP_SSE_URL = `${MCP_BASE_URL}/sse?nonce=Bf38L0jw-DiM3_qnhDmVcw&username=feynon&profile=feynon%2Ftiles&sig=uj-4VXrcBp8mkux5cBH-fO3-qEd4-P26O1xf4ELrxEY`;

// Parse the URL to extract parameters
const mcpUrl = new URL(MCP_SSE_URL);
const nonce = mcpUrl.searchParams.get('nonce');
const username = mcpUrl.searchParams.get('username');
const profile = mcpUrl.searchParams.get('profile') || "feynon/tiles";
const sig = mcpUrl.searchParams.get('sig');

// Session management
let sessionId: string | null = null;
let useMockImplementation = false;

// Function to initialize a session with MCP
async function initMcpSession() {
  try {
    console.log("Initializing MCP session...");
    
    // Make a POST request to the /auth endpoint to create a new session
    const sessionResponse = await fetch(`${MCP_BASE_URL}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nonce: nonce,
        username: username,
        profile: profile,
        sig: sig
      })
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.status} ${sessionResponse.statusText}`);
    }
    
    const sessionData = await sessionResponse.json();
    sessionId = sessionData.sid;
    
    console.log(`Created MCP session with ID: ${sessionId}`);
    return sessionId;
  } catch (error) {
    console.error("Failed to initialize MCP session:", error);
    console.log("Falling back to mock implementation for demonstration purposes.");
    useMockImplementation = true;
    return null;
  }
}

// Function to call a tool with the session ID
async function callMcpTool(toolName: string, args: Record<string, any>) {
  // If we're using the mock implementation, handle the request locally
  if (useMockImplementation) {
    console.log(`Using mock implementation for tool: ${toolName}`);
    
    // Mock implementation for HTML-to-Markdown
    if (toolName === "html-to-markdown") {
      const url = args.url;
      console.log(`Mock HTML-to-Markdown for URL: ${url}`);
      
      try {
        // Fetch the HTML content
        const response = await fetch(url);
        const html = await response.text();
        
        // Create a simple mock markdown conversion
        // In a real implementation, this would use a proper HTML-to-Markdown converter
        const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || "No title found";
        const bodyText = html.replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 500);
        
        const markdown = `# ${title}\n\n${bodyText}...\n\n*This is a mock conversion for demonstration purposes.*`;
        
        return {
          content: [{
            type: "text",
            text: markdown
          }]
        };
      } catch (error) {
        console.error(`Error in mock HTML-to-Markdown:`, error);
        throw new Error(`Failed to fetch or convert HTML: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Default mock response for unknown tools
    return {
      content: [{
        type: "text",
        text: `Mock response for tool '${toolName}' with args: ${JSON.stringify(args)}`
      }]
    };
  }
  
  // Make sure we have a session for the real implementation
  if (!sessionId) {
    await initMcpSession();
    if (!sessionId && !useMockImplementation) {
      throw new Error("Could not create MCP session");
    }
  }
  
  // If we're now using the mock implementation after trying to initialize the session
  if (useMockImplementation) {
    return callMcpTool(toolName, args);
  }
  
  try {
    // Make the tool call with the session ID
    const response = await fetch(`${MCP_BASE_URL}/tools/call?sid=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: toolName,
        arguments: args
      })
    });
    
    if (!response.ok) {
      throw new Error(`Tool call failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling tool '${toolName}':`, error);
    
    // If we encounter an error with the real implementation, fall back to the mock
    if (!useMockImplementation) {
      console.log("Falling back to mock implementation due to tool call error.");
      useMockImplementation = true;
      return callMcpTool(toolName, args);
    }
    
    throw error;
  }
}

// Initialize session on startup
initMcpSession().then(sid => {
  if (sid) {
    console.log(`Successfully initialized MCP session for profile: ${profile}`);
  } else {
    console.error("Failed to initialize MCP session. Some functionality may not work.");
  }
});

// This is a simplified example of integrating mcp.run serverlets with web applets
// First, we create a simple HTTP server
const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve our web applet
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(appletHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }
    
    // Serve the manifest for web applets
    if (url.pathname === '/manifest.json') {
      return new Response(JSON.stringify(appletManifest), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Endpoint to handle client-side serverlet calls for greeting
    if (url.pathname === '/api/greet' && req.method === 'POST') {
      try {
        const body = await req.json();
        const name = body.name || 'World';
        
        // In a real implementation, we would use the McpX client to call a serverlet
        // This is a simplified example that mimics the serverlet response
        const response = {
          content: [
            {
              type: "text",
              text: `Hello ${name} from mcp.run serverlet!`
            }
          ]
        };
        
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: typeof error === 'object' && error !== null ? (error as Error).message : "Failed to process request" 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Endpoint to handle HTML-to-Markdown conversion
    if (url.pathname === '/api/html-to-markdown' && req.method === 'POST') {
      try {
        const body = await req.json();
        const urlToFetch = body.url;
        
        if (!urlToFetch) {
          return new Response(JSON.stringify({ 
            error: "URL is required" 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        console.log(`Calling HTML-to-Markdown serverlet with URL: ${urlToFetch}`);
        
        // Use our helper function to call the tool with session management
        const rawResult = await callMcpTool("html-to-markdown", { url: urlToFetch });
        
        console.log("MCP client response:", rawResult);
        
        // Log the raw response for debugging
        console.log("HTML-to-Markdown serverlet raw response:", rawResult);
        
        // Ensure the response has the expected structure
        let content = [];
        
        if (Array.isArray(rawResult.content)) {
          // Standard format with content array
          content = rawResult.content;
        } else if (typeof rawResult.content === 'string') {
          // Direct string content
          content = [{
            type: "text",
            text: rawResult.content
          }];
        } else if (typeof rawResult === 'string') {
          // Direct string result
          content = [{
            type: "text",
            text: rawResult
          }];
        } else {
          // Fallback: stringify the whole response
          content = [{
            type: "text",
            text: typeof rawResult === 'object' && rawResult !== null 
              ? JSON.stringify(rawResult)
              : "Received non-standard response from serverlet"
          }];
        }
        
        const result = { content };
        
        // Log the structured content for debugging
        console.log("Structured content:", 
          content[0]?.text 
            ? content[0].text.substring(0, 100) + "..." 
            : "No text content found");
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error("Error calling HTML-to-Markdown serverlet:", error);
        
        // Prepare a friendly error response
        let errorMessage = "Failed to convert HTML to markdown";
        
        if (typeof error === 'object' && error !== null) {
          // Handle specific error from mcpClient
          const errorObj = error as Error;
          if (errorObj.message) {
            errorMessage = errorObj.message;
            
            // Check for specific session-related errors
            if (errorMessage.includes("querystring must have required property 'sid'")) {
              errorMessage = "Session error: The MCP client is not properly authenticated. Please check your configuration.";
            }
          }
        }
        
        return new Response(JSON.stringify({ 
          error: errorMessage,
          content: [{
            type: "text",
            text: `Error: ${errorMessage}`
          }]
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Serve applet.js
    if (url.pathname === '/applet.js') {
      return new Response(appletJs, {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

// Web Applet Manifest
const appletManifest = {
  name: "Tiles Applet",
  description: "A web applet that integrates with mcp.run serverlets for greeting and HTML-to-Markdown conversion",
  version: "1.0.0",
  actions: [
    {
      id: "greet",
      name: "Greet",
      description: "Greet a person by name",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name to greet"
          }
        },
        required: ["name"]
      }
    },
    {
      id: "htmlToMarkdown",
      name: "HTML to Markdown",
      description: "Convert a webpage to markdown format",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the webpage to convert"
          }
        },
        required: ["url"]
      }
    }
  ]
};

// HTML for our web applet page
const appletHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tiles - Web Applet + MCP.run Integration</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    .container {
      margin-bottom: 2rem;
      padding: 1rem;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    .result {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
    button, input {
      padding: 0.5rem;
      margin: 0.5rem 0;
    }
    input[type="text"], input[type="url"] {
      width: 80%;
      max-width: 500px;
    }
    h2 {
      margin-top: 0;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid #ccc;
      margin-bottom: 1rem;
    }
    .tab {
      padding: 0.5rem 1rem;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .tab.active {
      background-color: #f5f5f5;
      border: 1px solid #ccc;
      border-bottom-color: white;
      margin-bottom: -1px;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
  </style>
</head>
<body>
  <h1>Tiles - Web Applet + MCP.run Integration</h1>
  <p>This example integrates Unternet web applets with mcp.run serverlets.</p>
  
  <div class="tabs">
    <div class="tab active" data-tab="greet">Greeting</div>
    <div class="tab" data-tab="html-to-markdown">HTML to Markdown</div>
  </div>
  
  <div id="greet-content" class="tab-content active">
    <div class="container">
      <h2>Greeting Serverlet</h2>
      <div>
        <label for="name">Name:</label>
        <input type="text" id="name" placeholder="Enter your name">
        <button id="greetBtn">Greet</button>
      </div>
      
      <div class="result" id="greet-result">
        Greeting result will appear here...
      </div>
    </div>
  </div>
  
  <div id="html-to-markdown-content" class="tab-content">
    <div class="container">
      <h2>HTML to Markdown Serverlet</h2>
      <p>Enter a URL to fetch and convert to markdown:</p>
      <div>
        <label for="url">URL:</label>
        <input type="url" id="url" placeholder="https://example.com">
        <button id="convertBtn">Convert</button>
      </div>
      
      <div class="result" id="markdown-result">
        Markdown result will appear here...
      </div>
    </div>
  </div>
  
  <script src="/applet.js"></script>
</body>
</html>`;

// JavaScript for the web applet client-side
const appletJs = `// Web Applet implementation
class TilesApplet {
  constructor() {
    this.setupTabListeners();
    this.setupActionListeners();
    this.declareActions();
    this.sendReadyMessage();
  }
  
  // Set up tab navigation
  setupTabListeners() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab
        tab.classList.add('active');
        
        // Show corresponding content
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId + '-content').classList.add('active');
      });
    });
  }
  
  // Set up action event listeners
  setupActionListeners() {
    // Greeting functionality
    document.getElementById('greetBtn').addEventListener('click', () => {
      const name = document.getElementById('name').value || 'World';
      this.greet(name);
    });
    
    // HTML to Markdown functionality
    document.getElementById('convertBtn').addEventListener('click', () => {
      const url = document.getElementById('url').value;
      if (url) {
        this.convertHtmlToMarkdown(url);
      } else {
        document.getElementById('markdown-result').textContent = 'Please enter a URL';
      }
    });
    
    // Listen for action messages from the applet host
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.type === 'action') {
        const { actionId, params } = message;
        
        if (actionId === 'greet') {
          this.greet(params.name);
        } else if (actionId === 'htmlToMarkdown') {
          this.convertHtmlToMarkdown(params.url);
        }
      }
    });
  }
  
  // Declare the actions this applet supports
  declareActions() {
    const actions = [
      {
        id: 'greet',
        name: 'Greet',
        description: 'Greet a person by name',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name to greet'
            }
          },
          required: ['name']
        }
      },
      {
        id: 'htmlToMarkdown',
        name: 'HTML to Markdown',
        description: 'Convert a webpage to markdown format',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the webpage to convert'
            }
          },
          required: ['url']
        }
      }
    ];
    
    // Send the actions to the applet host
    window.parent.postMessage({ type: 'actions', actions }, '*');
  }
  
  // Send a ready message to the applet host
  sendReadyMessage() {
    window.parent.postMessage({ type: 'ready' }, '*');
  }
  
  // Greet action implementation
  async greet(name) {
    try {
      // Call our serverlet-like API endpoint
      const response = await fetch('/api/greet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      
      const result = await response.json();
      
      // Display the result
      document.getElementById('greet-result').textContent = result.content[0].text;
      
      // Also send the result as data to the applet host
      window.parent.postMessage({
        type: 'data',
        data: { result: result.content[0].text }
      }, '*');
      
      return result;
    } catch (error) {
      console.error('Error greeting:', error);
      document.getElementById('greet-result').textContent = 'Error: ' + error.message;
    }
  }
  
  // HTML to Markdown action implementation
  async convertHtmlToMarkdown(url) {
    try {
      // Show loading state
      document.getElementById('markdown-result').textContent = 'Converting...';
      
      // Call our HTML-to-Markdown API endpoint
      const response = await fetch('/api/html-to-markdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const result = await response.json();
      
      // Check for error responses
      if (result.error) {
        const errorMsg = typeof result.error === 'string' 
          ? result.error 
          : JSON.stringify(result.error);
          
        console.error("Server reported error:", errorMsg);
        throw new Error(errorMsg);
      }
      
      // Make sure we have content before trying to access it
      let markdownText = 'No content returned or invalid response format';
      
      // Handle various response formats that might come from the server
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        if (result.content[0].text) {
          markdownText = result.content[0].text;
        } else if (typeof result.content[0] === 'string') {
          markdownText = result.content[0];
        }
      } else if (typeof result.content === 'string') {
        markdownText = result.content;
      } else if (typeof result === 'string') {
        markdownText = result;
      }
      
      // Log the processed content for debugging
      console.log('Processed markdown content:', markdownText.substring(0, 100) + '...');
      
      // Display the result
      document.getElementById('markdown-result').textContent = markdownText;
      
      // Also send the result as data to the applet host
      window.parent.postMessage({
        type: 'data',
        data: { 
          url: url,
          markdown: markdownText
        }
      }, '*');
      
      return result;
    } catch (error) {
      console.error('Error converting HTML to Markdown:', error);
      document.getElementById('markdown-result').textContent = 'Error: ' + (error.message || 'Failed to convert HTML to markdown');
    }
  }
}

// Initialize the applet
new TilesApplet();
`;

// Log that the server is running
console.log(`✅ Tiles server with Web Applet + MCP.run integration is listening on http://localhost:${server.port}`);