#!/bin/bash
# Overleaf AI LaTeX Studio Pro Launcher Script

APP_DIR="/home/medimg/.gemini/antigravity/scratch/latex-overleaf-app"
PORT=8090

echo "======================================================="
echo "   🚀 Starting AI-Overleaf LaTeX Research Workspace   "
echo "======================================================="

# Navigate to app directory
cd "$APP_DIR" || exit 1

# Check if server is already running
if pgrep -f "python3 server.py" > /dev/null; then
  echo "⚠️ Server daemon is already running on port $PORT."
else
  echo "Starting backend compiler & database server..."
  python3 server.py &
  sleep 1
fi

echo ""
echo "✅ Application successfully launched!"
echo "🌐 Open in Browser: http://localhost:$PORT/"
echo "======================================================="
