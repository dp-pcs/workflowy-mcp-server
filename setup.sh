#!/bin/sh

# Install dependencies
echo "Installing dependencies..." >&2
npm install > /dev/null 2>&1

# Build project
echo "Building the project..." >&2
npm run build > /dev/null 2>&1

echo "Setup complete" >&2

# Output final JSON configuration to stdout (MANDATORY)
cat << EOF
{
  "command": "node",
  "args": ["build/index.js"],
  "env": {},
  "cwd": "$(pwd)"
}
EOF
