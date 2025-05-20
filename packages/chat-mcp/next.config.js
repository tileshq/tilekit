/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
      if (isServer) {
        // Add thread-stream to externals
        config.externals.push('thread-stream');
      }
      return config;
    },
  };
  
  module.exports = nextConfig;