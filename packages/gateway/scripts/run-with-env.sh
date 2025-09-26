#!/bin/bash

# Wrapper script to run commands with environment variables loaded
# Usage: ./scripts/run-with-env.sh <command> [args...]

set -e

# Change to the directory where this script is located, then go up one level to package root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_ROOT"

# Source environment variables
source scripts/load-env.sh

# Execute the command passed as arguments
exec "$@"
