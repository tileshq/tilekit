// API route to proxy requests to mcp.run to avoid CORS issues
import type { NextApiRequest, NextApiResponse } from 'next';

interface ErrorResponse {
  error: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<any | ErrorResponse | Buffer>
) {
  const { path } = req.query;
  
  try {
    // Build the target URL
    const targetUrl = `https://www.mcp.run/api/${path || ''}`;
    
    // Forward the request
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      // Only include body for non-GET requests
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) }),
    });
    
    // Check content type
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/wasm')) {
      // Handle binary WASM response
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'application/wasm');
      res.status(response.status).send(Buffer.from(buffer));
    } else if (contentType && contentType.includes('application/json')) {
      // Handle JSON response
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      // Handle other response types
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from external API' });
  }
}