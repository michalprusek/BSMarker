#!/bin/bash

echo "🚀 Starting BSMarker application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start containers
echo "📦 Building Docker containers..."
docker-compose build

echo "🔧 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ BSMarker is running!"
    echo ""
    echo "🌐 Access the application at:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend API: http://localhost:8000"
    echo "   API Docs: http://localhost:8000/docs"
    echo "   MinIO Console: http://localhost:9001"
    echo ""
    echo "📧 Default admin credentials:"
    echo "   Email: admin@bsmarker.com"
    echo "   Password: admin123"
    echo ""
    echo "To stop the application, run: ./stop.sh"
else
    echo "❌ Failed to start services. Check logs with: docker-compose logs"
    exit 1
fi
