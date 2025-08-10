#!/bin/bash

echo "🛑 Stopping BSMarker application..."

docker-compose down

echo "✅ BSMarker has been stopped."
echo ""
echo "To completely remove containers and volumes, run:"
echo "  docker-compose down -v"