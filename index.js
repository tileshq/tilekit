// This is a placeholder file to help Vercel understand the project structure
// The actual Next.js application is in the chat-mcp directory

// Import Next.js to ensure it's detected
import next from 'next';

// Export a simple function that redirects to the chat-mcp directory
export default function handler(req, res) {
  // Redirect to the chat-mcp directory
  res.redirect('/chat-mcp');
} 