#!/bin/bash

echo "🔍 Finding Vercel processes..."
echo "📊 Current Vercel processes:"
ps aux | grep -i vercel | grep -v grep
echo ""

echo "🛑 Killing Vercel processes..."
# More comprehensive process killing
pkill -f "vercel"
pkill -f "next"  # Sometimes Next.js processes persist
pkill -f "node.*3000"  # Kill any node processes on port 3000

# Wait a moment for processes to terminate
sleep 2

echo "🔍 Checking for remaining processes..."
remaining=$(ps aux | grep -i vercel | grep -v grep)
if [ -z "$remaining" ]; then
    echo "✅ All Vercel processes terminated."
else
    echo "⚠️  Some processes may still be running:"
    echo "$remaining"
fi

# Check if port 3000 is still in use
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is still in use. Killing processes using port 3000..."
    lsof -ti:3000 | xargs kill -9
else
    echo "✅ Port 3000 is available."
fi

