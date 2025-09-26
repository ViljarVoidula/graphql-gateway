#!/bin/bash

# Environment loader script - loads .env.local and .env files if they exist
# Usage: source scripts/load-env.sh

set -e

# Function to load environment file if it exists
load_env_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        echo "Loading environment from $file"
        set -a
        source "$file"
        set +a
    fi
}

# Load environment files in order of priority
# .env.local takes precedence over .env
load_env_file ".env.local"
load_env_file ".env"

echo "Environment loaded successfully"
