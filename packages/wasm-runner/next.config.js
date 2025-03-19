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
  // For ESM module compatibility
  experimental: {
    esmExternals: 'loose',
  },
};

module.exports = nextConfig;