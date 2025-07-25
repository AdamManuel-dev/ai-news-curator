# Grafana Monitoring Dashboards

This directory contains pre-configured Grafana dashboards for monitoring the AI Content Curator Agent. These dashboards provide comprehensive observability into application performance, business metrics, infrastructure health, and alerting.

## Dashboard Overview

### 1. AI Content Curator - Overview (`ai-curator-overview.json`)
**Primary monitoring dashboard with key performance indicators**

**Metrics Covered:**
- Application Status & Health
- HTTP Request Metrics (rate, duration, status codes)
- Response Time Percentiles (50th, 95th, 99th)
- System Resource Usage (CPU, Memory)
- Error Rates by Type
- Active Request Count

**Refresh Rate:** 5 seconds  
**Time Range:** Last 15 minutes  
**Best For:** Real-time monitoring, NOC displays

### 2. AI Content Curator - Business Metrics (`ai-curator-business-metrics.json`)
**Business intelligence dashboard focusing on content processing and AI operations**

**Metrics Covered:**
- Content Discovery Metrics (total discovered, discovery rate by source)
- ML/AI Tagging Performance (accuracy, tags generated)
- Content Processing Pipeline Performance
- Vector Database Operations & Search Performance
- Cache Hit Rates & Performance
- External API Response Times (OpenAI, Pinecone, etc.)

**Refresh Rate:** 30 seconds  
**Time Range:** Last 1 hour  
**Best For:** Business stakeholders, performance optimization

### 3. AI Content Curator - Infrastructure (`ai-curator-infrastructure.json`)
**Infrastructure and database monitoring dashboard**

**Metrics Covered:**
- Database Health (PostgreSQL connections, query performance)
- Cache Layer Performance (Redis memory, operations, hit rates)
- System Resources (CPU, Memory, Disk, Network I/O)
- Component Health Status
- Service Availability

**Refresh Rate:** 30 seconds  
**Time Range:** Last 30 minutes  
**Best For:** DevOps teams, infrastructure monitoring

### 4. AI Content Curator - Alerts & Monitoring (`ai-curator-alerts.json`)
**Alerting and incident response dashboard**

**Metrics Covered:**
- Critical Alert Conditions (error rates, response times, resource usage)
- Service Availability Tracking
- Error Event Timeline
- Response Time Heatmaps
- Top Slowest Endpoints
- Recent Error Logs

**Refresh Rate:** 10 seconds  
**Time Range:** Last 1 hour  
**Best For:** Incident response, alerting, troubleshooting

## Setup Instructions

### 1. Start Monitoring Stack
```bash
# Start with monitoring profile
docker-compose --profile monitoring up -d

# Or start all services including monitoring
docker-compose --profile monitoring --profile tools up -d
```

### 2. Access Grafana
- **URL:** http://localhost:3001
- **Username:** admin  
- **Password:** admin

### 3. Verify Data Sources
The dashboards expect these data sources to be configured:
- **Prometheus:** http://prometheus:9090 (configured automatically)
- **Redis:** redis://redis:6379 (configured automatically)

### 4. Import Dashboards
Dashboards are automatically provisioned on startup. If you need to manually import:
1. Go to Grafana → "+" → Import
2. Upload the JSON files from this directory
3. Select "Prometheus" as the data source

## Metrics Collection

### Application Metrics
The application exposes metrics on `/metrics` endpoint using Prometheus client:
- HTTP request duration histograms
- Request counters by method/route/status
- Business metrics (content discovered, tags generated)
- System health gauges

### Infrastructure Metrics
Collected via exporters in Docker Compose:
- **Node Exporter:** System metrics (CPU, memory, disk, network)
- **PostgreSQL Exporter:** Database metrics
- **Redis Exporter:** Cache metrics

### Custom Metrics
Application-specific metrics defined in `src/middleware/metrics.ts`:
- `ai_curator_content_discovered_total`
- `ai_curator_tags_generated_total`
- `ai_curator_vector_operations_total`
- `ai_curator_cache_hit_rate`
- `ai_curator_system_health`

## Alert Rules

### Recommended Alert Thresholds
```yaml
# High Error Rate
- alert: HighErrorRate
  expr: rate(ai_curator_http_requests_total{status_code=~"5.."}[5m]) / rate(ai_curator_http_requests_total[5m]) > 0.05
  
# High Response Time
- alert: HighResponseTime
  expr: histogram_quantile(0.95, rate(ai_curator_http_request_duration_seconds_bucket[5m])) > 2
  
# High Memory Usage
- alert: HighMemoryUsage
  expr: (ai_curator_process_resident_memory_bytes / ai_curator_process_heap_bytes) * 100 > 85
  
# Database Down
- alert: DatabaseDown
  expr: up{job="postgres-exporter"} == 0
  
# Low Tagging Accuracy
- alert: LowTaggingAccuracy
  expr: ai_curator_tagging_accuracy < 70
```

## Dashboard Customization

### Adding New Panels
1. Edit the JSON files directly or use Grafana UI
2. Export updated dashboard as JSON
3. Replace the file in this directory
4. Restart Grafana to reload

### Custom Queries
Common PromQL patterns used in dashboards:
```promql
# Request rate
rate(ai_curator_http_requests_total[5m])

# Error rate percentage
rate(ai_curator_http_requests_total{status_code=~"5.."}[5m]) / rate(ai_curator_http_requests_total[5m]) * 100

# Response time percentiles
histogram_quantile(0.95, rate(ai_curator_http_request_duration_seconds_bucket[5m]))

# Top slow endpoints
topk(10, rate(ai_curator_http_request_duration_seconds_sum[5m]) / rate(ai_curator_http_request_duration_seconds_count[5m]))
```

## Troubleshooting

### Common Issues

**1. No Data in Dashboards**
- Verify Prometheus is scraping metrics: http://localhost:9090/targets
- Check application is exposing metrics: http://localhost:3000/metrics
- Confirm data source configuration in Grafana

**2. Dashboards Not Loading**
- Check Grafana logs: `docker-compose logs grafana`
- Verify dashboard files are mounted correctly
- Restart Grafana service

**3. Missing Metrics**
- Ensure application is generating business metrics
- Check that all exporters are running: `docker-compose ps`
- Verify network connectivity between services

### Debug Commands
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Test metrics endpoint
curl http://localhost:3000/metrics

# View Grafana logs
docker-compose logs -f grafana

# Check dashboard provisioning
docker exec -it ai-news-curator-grafana ls -la /etc/grafana/provisioning/dashboards/
```

## Performance Considerations

### Dashboard Optimization
- Use appropriate time ranges to avoid excessive data queries
- Consider using recording rules for complex calculations
- Set reasonable refresh intervals (5-30s for most dashboards)

### Resource Usage
- Each dashboard queries Prometheus every refresh interval
- Monitor Prometheus resource usage with many concurrent dashboards
- Consider using Grafana's built-in caching features

## Security Notes

- Change default Grafana admin password in production
- Consider enabling HTTPS for Grafana access
- Restrict network access to monitoring stack
- Use Grafana's built-in authentication/authorization features

## Integration

### External Alerting
These dashboards can be integrated with:
- **Prometheus Alertmanager** for rule-based alerting
- **PagerDuty/OpsGenie** for incident management
- **Slack/Teams** for notifications
- **Webhook endpoints** for custom integrations

### Data Retention
- Prometheus default retention: 15 days
- Adjust `--storage.tsdb.retention.time` for longer retention
- Consider external storage for long-term metrics (Thanos, Cortex)

---

For additional support or questions about these dashboards, see the main project documentation or create an issue in the project repository.