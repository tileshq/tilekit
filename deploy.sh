#!/bin/sh
# Build the project
echo "Building the project..."
bun run build

# Check if the build was successful
if [ $? -ne 0 ]; then
  echo "Build failed. Exiting."
  exit 1
fi

# Serve the built files
echo "Starting the server..."
bun run serve 