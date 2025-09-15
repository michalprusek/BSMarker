#!/bin/bash

# Production Deployment Script for BSMarker
# This script should be run on the production server (bsmarker.utia.cas.cz)

set -e  # Exit on error

echo "🚀 Starting BSMarker Production Deployment..."
echo "============================================"

# Change to project directory
cd /home/prusek/BSMarker || cd /root/BSMarker || { echo "Error: BSMarker directory not found"; exit 1; }

echo "📍 Current directory: $(pwd)"

# Step 1: Pull latest changes from dev branch
echo ""
echo "📥 Step 1: Pulling latest changes from dev branch..."
git fetch origin
git checkout dev
git pull origin dev

# Step 2: Show recent commits
echo ""
echo "📝 Recent commits:"
git log --oneline -5

# Step 3: Build production containers
echo ""
echo "🔨 Step 2: Building production containers (this may take several minutes)..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Step 4: Stop and remove old containers
echo ""
echo "🛑 Step 3: Stopping old containers..."
docker-compose -f docker-compose.prod.yml down

# Step 5: Start new containers
echo ""
echo "▶️ Step 4: Starting new containers..."
docker-compose -f docker-compose.prod.yml up -d

# Step 6: Wait for services to be healthy
echo ""
echo "⏳ Step 5: Waiting for services to be healthy..."
sleep 10

# Step 7: Check container status
echo ""
echo "✅ Step 6: Checking container status..."
docker-compose -f docker-compose.prod.yml ps

# Step 8: Check logs for any errors
echo ""
echo "📋 Step 7: Checking recent logs for errors..."
docker-compose -f docker-compose.prod.yml logs --tail=20 backend frontend nginx

echo ""
echo "✨ Deployment complete!"
echo "============================================"
echo ""
echo "🔍 Please verify:"
echo "1. Visit https://bsmarker.utia.cas.cz"
echo "2. Test login functionality"
echo "3. Test right-click on bounding boxes"
echo "4. Verify all 3 context menu options work"
echo ""
echo "📊 To monitor logs:"
echo "docker-compose -f docker-compose.prod.yml logs -f [service_name]"
