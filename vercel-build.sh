#!/bin/sh
# Modified build script for Vercel deployment
echo "Building chat-mcp for Vercel deployment..."

# First, ensure Next.js is installed in the root directory
echo "Ensuring Next.js is installed in root directory..."
npm list next || npm install next@14.2.4 --no-save

# Navigate to chat-mcp directory
cd chat-mcp

# Install dependencies
echo "Installing dependencies..."
npm install

# Create a symlink to the root node_modules/next if needed
if [ ! -d "node_modules/next" ]; then
  echo "Creating symlink to Next.js..."
  mkdir -p node_modules
  ln -sf ../../node_modules/next node_modules/next
fi

# Build the application
echo "Building the application..."
npm run build

# Ensure .next directory exists and is properly structured
echo "Verifying .next directory..."
if [ -d ".next" ]; then
  echo ".next directory exists"
  # Create a marker file to ensure Vercel recognizes the directory
  touch .next/.vercel_build_output
else
  echo "ERROR: .next directory was not created during build"
  mkdir -p .next
  echo "Created empty .next directory as fallback"
  touch .next/.vercel_build_output
fi

# Copy package.json to .next for Vercel to detect Next.js
echo "Copying package.json to .next directory..."
cp package.json .next/

# List contents of .next for debugging
echo "Contents of .next directory:"
ls -la .next

echo "Build completed successfully!" 