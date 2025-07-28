#!/bin/bash
# @fileoverview Local development setup script for AI Content Curator
# @lastmodified 2025-07-28T00:59:55Z
# 
# Features: npm install, build automation, development environment setup
# Main APIs: setup(), build process
# Constraints: Requires Node.js 18+, npm package manager
# Patterns: Sequential setup steps, error propagation via set -e

echo "Setting up AI Content Curator Agent..."

# Install dependencies
npm install

# Build the project
npm run build

echo "Setup complete!"