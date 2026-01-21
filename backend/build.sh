#!/bin/bash
set -e

echo "🧹 Cleaning old build artifacts..."
rm -rf dist

echo "🔨 Building TypeScript..."
npx tsc

echo "✅ Build complete! Checking output..."
ls -la dist/
if [ -f "dist/index.js" ]; then
  echo "✅ dist/index.js exists!"
else
  echo "❌ ERROR: dist/index.js was not created!"
  echo "Dist contents:"
  find dist -type f
  exit 1
fi
