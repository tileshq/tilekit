/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Allow WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Fix for "Module not found: Can't resolve 'node-fetch'" error
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'node-fetch': false,
      };
    }

    return config;
  },
  // Add security headers for SharedArrayBuffer support
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
  // Improve hydration handling
  experimental: {
    // Disable runtime JS for better hydration
    runtime: 'nodejs',
    // Ensure proper hydration with server components
    serverComponents: true,
    // Improve client-side navigation
    scrollRestoration: true
  }
};

module.exports = nextConfig;