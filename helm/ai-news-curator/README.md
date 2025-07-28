# AI News Curator Helm Chart

This Helm chart deploys the AI News Curator application on a Kubernetes cluster using the Helm package manager.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure (for persistent storage)
- Ingress controller (nginx recommended)
- cert-manager (for TLS certificates)

## Installing the Chart

To install the chart with the release name `ai-news-curator`:

```bash
# Add dependencies
helm dependency update

# Install with default values
helm install ai-news-curator ./helm/ai-news-curator

# Install with environment-specific values
helm install ai-news-curator ./helm/ai-news-curator -f ./helm/ai-news-curator/values-production.yaml

# Install in specific namespace
helm install ai-news-curator ./helm/ai-news-curator --namespace ai-news-curator --create-namespace
```

## Uninstalling the Chart

To uninstall/delete the `ai-news-curator` deployment:

```bash
helm uninstall ai-news-curator
```

## Configuration

The following table lists the configurable parameters of the AI News Curator chart and their default values.

### Application Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.registry` | Image registry | `""` |
| `image.repository` | Image repository | `ai-news-curator` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `Always` |
| `replicaCount` | Number of replicas | `3` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.ports.http` | HTTP port | `80` |
| `service.targetPort` | Target port | `3000` |
| `service.sessionAffinity` | Session affinity | `ClientIP` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.hosts[0].host` | Hostname | `api.ainewscurator.example.com` |
| `ingress.tls` | TLS configuration | See values.yaml |

### Autoscaling Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `20` |
| `autoscaling.targetCPUUtilizationPercentage` | CPU target | `70` |
| `autoscaling.targetMemoryUtilizationPercentage` | Memory target | `80` |

### Database Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Enable PostgreSQL | `true` |
| `postgresql.auth.database` | Database name | `ai_news_curator` |
| `externalDatabase.enabled` | Use external database | `false` |
| `externalDatabase.host` | Database host | `""` |

### Redis Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.enabled` | Enable Redis | `true` |
| `redis.auth.enabled` | Enable Redis auth | `false` |
| `externalRedis.enabled` | Use external Redis | `false` |
| `externalRedis.host` | Redis host | `""` |

### Monitoring Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `monitoring.serviceMonitor.enabled` | Enable ServiceMonitor | `false` |
| `monitoring.prometheusRule.enabled` | Enable PrometheusRule | `false` |

### Security Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `networkPolicy.enabled` | Enable network policies | `true` |
| `podDisruptionBudget.enabled` | Enable PDB | `true` |
| `podSecurityContext.runAsNonRoot` | Run as non-root | `true` |
| `securityContext.readOnlyRootFilesystem` | Read-only root filesystem | `true` |

## Environment-Specific Configurations

### Development

```bash
helm install ai-news-curator ./helm/ai-news-curator -f ./helm/ai-news-curator/values-development.yaml
```

Features:
- Single replica
- Reduced resource limits
- Debug logging enabled
- Mock external APIs
- Insecure defaults for easier development

### Staging

```bash
helm install ai-news-curator ./helm/ai-news-curator -f ./helm/ai-news-curator/values-staging.yaml
```

Features:
- 2-5 replicas with HPA
- Moderate resource allocation
- Monitoring enabled
- Production-like security settings

### Production

```bash
helm install ai-news-curator ./helm/ai-news-curator -f ./helm/ai-news-curator/values-production.yaml
```

Features:
- 3-20 replicas with HPA
- High resource allocation
- External managed databases
- Full monitoring and alerting
- Production security settings
- Persistent logging

## Dependencies

This chart has the following dependencies:

- `postgresql` (Bitnami) - Internal PostgreSQL database
- `redis` (Bitnami) - Internal Redis cache

Dependencies are managed via `Chart.yaml` and can be disabled by setting `postgresql.enabled=false` and `redis.enabled=false` when using external services.

## Secrets Management

### Default Secrets

The chart can generate basic secrets automatically:

```yaml
secrets:
  create: true
  data:
    JWT_SECRET: "your-jwt-secret"
    OPENAI_API_KEY: "your-openai-key"
    # ... other secrets
```

### External Secrets

For production, use external secret management:

```yaml
secrets:
  create: false
  annotations:
    external-secrets.io/backend: "vault"
    external-secrets.io/key: "production/ai-news-curator"
```

## Health Checks

The application provides several health check endpoints:

- `/health` - Basic health check
- `/health/ready` - Readiness check
- `/health/live` - Liveness check
- `/metrics` - Prometheus metrics

## Monitoring

### Prometheus Integration

Enable ServiceMonitor for Prometheus scraping:

```yaml
monitoring:
  serviceMonitor:
    enabled: true
    interval: 30s
```

### Grafana Dashboards

Import the provided Grafana dashboards from `docker/grafana/dashboards/` for comprehensive monitoring.

### Alerting

Enable PrometheusRule for alerting:

```yaml
monitoring:
  prometheusRule:
    enabled: true
```

Default alerts include:
- Application down
- High error rate
- High latency
- Resource usage alerts

## Networking

### Network Policies

Network policies are enabled by default to restrict traffic:

```yaml
networkPolicy:
  enabled: true
  ingress:
    - from: []
      ports:
        - port: 3000
          protocol: TCP
```

### Ingress

The chart supports nginx ingress controller with features:
- TLS termination
- Rate limiting
- CORS configuration
- SSL redirect

## Persistence

### Log Persistence

Enable persistent logging:

```yaml
persistence:
  logs:
    enabled: true
    size: 10Gi
    storageClass: "fast-ssd"
```

## Troubleshooting

### Common Issues

1. **Pod startup failures**
   ```bash
   kubectl describe pod -l app.kubernetes.io/name=ai-news-curator
   kubectl logs -l app.kubernetes.io/name=ai-news-curator
   ```

2. **Database connection issues**
   ```bash
   kubectl exec -it deployment/ai-news-curator -- env | grep DB_
   ```

3. **Ingress not working**
   ```bash
   kubectl get ingress
   kubectl describe ingress ai-news-curator
   ```

### Debugging Commands

```bash
# Check all resources
kubectl get all -l app.kubernetes.io/name=ai-news-curator

# Check configuration
kubectl get configmap ai-news-curator-config -o yaml

# Check secrets (without values)
kubectl get secrets ai-news-curator-secrets

# Port forward for local access
kubectl port-forward svc/ai-news-curator 8080:80

# Check HPA status
kubectl get hpa ai-news-curator

# Check network policies
kubectl get networkpolicy ai-news-curator
```

## Upgrading

To upgrade the chart:

```bash
# Update dependencies
helm dependency update

# Upgrade with new values
helm upgrade ai-news-curator ./helm/ai-news-curator -f values-production.yaml

# Rollback if needed
helm rollback ai-news-curator 1
```

## Contributing

1. Make changes to the chart
2. Update version in `Chart.yaml`
3. Test with different values files
4. Update this README if needed

## License

This chart is licensed under the same license as the AI News Curator application.