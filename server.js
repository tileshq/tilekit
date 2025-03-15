// Simple server to serve the built files
import { serve } from "bun";
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.PORT || 3001;

// Create a simple HTTP server
const server = serve({
  port: port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    
    // Handle API requests
    if (pathname.startsWith('/api/')) {
      return await handleApiRequest(req, pathname);
    }
    
    // Default to index.html for root path
    if (pathname === '/') {
      pathname = '/index.html';
    }
    
    // Try to serve the file from the build directory
    try {
      const filePath = `./build${pathname}`;
      
      // Check if the file exists
      if (fs.existsSync(filePath)) {
        const file = Bun.file(filePath);
        return new Response(file);
      } else {
        console.error(`File not found: ${filePath}`);
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error(`Error serving ${pathname}:`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
});

// Handle API requests
async function handleApiRequest(req, pathname) {
  // Load the index.js file from the build directory
  const indexJsPath = path.join('build', 'index.js');
  
  try {
    // Import the built index.js file
    const indexModule = await import(`./${indexJsPath}`);
    
    // Greeting API
    if (pathname === '/api/greet' && req.method === 'POST') {
      try {
        const body = await req.json();
        const name = body.name || 'World';
        
        // Create a simple response in the expected format
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
        console.error('Error handling greet request:', error);
        return new Response(JSON.stringify({ 
          error: typeof error === 'object' && error !== null ? (error.message || "Unknown error") : "Failed to process request" 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // HTML to Markdown API
    if (pathname === '/api/html-to-markdown' && req.method === 'POST') {
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
        
        console.log(`Processing HTML-to-Markdown request for URL: ${urlToFetch}`);
        
        // Fetch the HTML content
        const response = await fetch(urlToFetch);
        const html = await response.text();
        
        // Create a simple mock markdown conversion
        const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || "No title found";
        const bodyText = html.replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 500);
        
        const markdown = `# ${title}\n\n${bodyText}...\n\n*This is a simple HTML to Markdown conversion.*`;
        
        return new Response(JSON.stringify({
          content: [{
            type: "text",
            text: markdown
          }]
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error handling HTML-to-Markdown request:', error);
        return new Response(JSON.stringify({ 
          error: typeof error === 'object' && error !== null ? (error.message || "Unknown error") : "Failed to process request",
          content: [{
            type: "text",
            text: `Error: ${typeof error === 'object' && error !== null ? (error.message || "Unknown error") : "Failed to process request"}`
          }]
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // If we get here, the API endpoint is not supported
    return new Response(JSON.stringify({ 
      error: "API endpoint not found" 
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`Error loading index.js:`, error);
    return new Response(JSON.stringify({ 
      error: "Internal server error" 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

console.log(`✅ Server is running at http://localhost:${port}`); 