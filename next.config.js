/** @type {import('next').NextConfig} */
const nextConfig = {
  // This is a placeholder config that points to the actual Next.js app
  distDir: 'chat-mcp/.next',
  basePath: '',
  // Redirect all requests to the chat-mcp directory
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/chat-mcp/:path*',
      },
    ];
  },
};

module.exports = nextConfig; 