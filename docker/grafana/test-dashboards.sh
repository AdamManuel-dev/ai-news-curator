#!/bin/bash

# Test script to verify Grafana dashboards are working correctly
# This script starts the monitoring stack and performs basic health checks

set -e

echo "🚀 Starting AI Content Curator Monitoring Stack..."

# Start the monitoring services
echo "📊 Starting Prometheus and Grafana..."
docker-compose --profile monitoring up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Function to check if a service is responding
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo "🔍 Checking $service_name at $url..."
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        echo "✅ $service_name is responding correctly"
        return 0
    else
        echo "❌ $service_name is not responding properly"
        return 1
    fi
}

# Check Prometheus
echo ""
echo "=== Prometheus Health Check ==="
check_service "Prometheus" "http://localhost:9090/-/healthy"
check_service "Prometheus Targets" "http://localhost:9090/api/v1/targets"

# Check Grafana
echo ""
echo "=== Grafana Health Check ==="
check_service "Grafana" "http://localhost:3001/api/health"

# Check if dashboards are loaded
echo ""
echo "=== Dashboard Verification ==="
echo "🔍 Checking if dashboards are provisioned..."

# Get list of dashboards via Grafana API (using admin:admin credentials)
dashboard_count=$(curl -s -u admin:admin http://localhost:3001/api/search | jq '. | length' 2>/dev/null || echo "0")

if [ "$dashboard_count" -gt 0 ]; then
    echo "✅ Found $dashboard_count dashboard(s) in Grafana"
    
    # List dashboard titles
    echo "📋 Available dashboards:"
    curl -s -u admin:admin http://localhost:3001/api/search | jq -r '.[] | "  - \(.title)"' 2>/dev/null || echo "  Could not retrieve dashboard list"
else
    echo "❌ No dashboards found in Grafana"
fi

# Check if application metrics endpoint is available
echo ""
echo "=== Application Metrics Check ==="
if docker-compose ps app | grep -q "Up"; then
    echo "🔍 Checking application metrics endpoint..."
    if docker-compose exec -T app curl -s http://localhost:3000/metrics | head -n 5 >/dev/null 2>&1; then
        echo "✅ Application metrics endpoint is responding"
        
        # Check for specific metrics
        echo "🔍 Checking for AI Curator specific metrics..."
        if docker-compose exec -T app curl -s http://localhost:3000/metrics | grep -q "ai_curator_"; then
            echo "✅ AI Curator metrics are being generated"
        else
            echo "⚠️  AI Curator metrics not found - dashboards may show no data"
        fi
    else
        echo "❌ Application metrics endpoint is not responding"
    fi
else
    echo "⚠️  Application container is not running - starting it now..."
    docker-compose up -d app
    sleep 10
    check_service "Application Metrics" "http://localhost:3000/metrics"
fi

# Final summary
echo ""
echo "=== Summary ==="
echo "📊 Grafana: http://localhost:3001 (admin/admin)"
echo "📈 Prometheus: http://localhost:9090"
echo "🚀 Application: http://localhost:3000"
echo ""
echo "📋 Available Dashboards:"
echo "  1. AI Content Curator - Overview"
echo "  2. AI Content Curator - Business Metrics"
echo "  3. AI Content Curator - Infrastructure"
echo "  4. AI Content Curator - Alerts & Monitoring"
echo ""
echo "✅ Monitoring stack verification complete!"
echo ""
echo "💡 Next steps:"
echo "  - Open Grafana and verify dashboards are loading"
echo "  - Generate some API traffic to see metrics in action"
echo "  - Set up alerting rules in Prometheus if needed"