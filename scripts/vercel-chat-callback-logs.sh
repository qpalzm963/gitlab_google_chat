#!/usr/bin/env bash
set -euo pipefail

since="${1:-2m}"

# Usage:
#   ./scripts/vercel-chat-callback-logs.sh 2m
#   ./scripts/vercel-chat-callback-logs.sh 10m

npx vercel logs --environment production --since "$since" | grep -F "chat-callback"

