# Kubernetes Deployment Manifests

This directory contains Kubernetes manifests for deploying the AI News Curator application using Kustomize.

## Directory Structure

```
k8s/
├── base/                    # Base manifests
│   ├── namespace.yaml      # Namespace definition
│   ├── configmap.yaml      # Application configuration
│   ├── secret.yaml         # Sensitive configuration
│   ├── deployment.yaml     # Main application deployment
│   ├── service.yaml        # Service definition
│   ├── hpa.yaml           # Horizontal Pod Autoscaler
│   ├── pdb.yaml           # Pod Disruption Budget
│   ├── networkpolicy.yaml  # Network security policies
│   ├── ingress.yaml       # Ingress configuration
│   ├── postgres-*.yaml    # PostgreSQL resources
│   ├── redis-*.yaml       # Redis resources
│   └── kustomization.yaml # Kustomize configuration
└── overlays/               # Environment-specific configurations
    ├── development/       # Development environment
    ├── staging/          # Staging environment
    └── production/       # Production environment
```

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- kustomize (or kubectl 1.14+)
- Helm (for cert-manager and ingress-nginx)

## Initial Setup

### 1. Install Required Controllers

```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# Install cert-manager for TLS certificates
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### 2. Create Storage Classes (if needed)

```bash
# Check if standard storage class exists
kubectl get storageclass

# If not, create one for your cloud provider
# Example for AWS EBS:
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp2
reclaimPolicy: Retain
allowVolumeExpansion: true
EOF
```

## Deployment

### Development Environment

```bash
# Preview what will be deployed
kubectl kustomize k8s/overlays/development

# Deploy to development
kubectl apply -k k8s/overlays/development

# Check deployment status
kubectl -n ai-news-curator-dev get pods
kubectl -n ai-news-curator-dev get svc
```

### Staging Environment

```bash
# Deploy to staging
kubectl apply -k k8s/overlays/staging

# Monitor deployment
kubectl -n ai-news-curator-staging rollout status deployment/ai-news-curator
```

### Production Environment

```bash
# First, create secrets file
cp k8s/overlays/production/secrets.env.example k8s/overlays/production/secrets.env
# Edit secrets.env with production values

# Deploy to production
kubectl apply -k k8s/overlays/production

# Verify deployment
kubectl -n ai-news-curator-prod get all
```

## Configuration Management

### Update Configuration

```bash
# Edit configmap
kubectl -n ai-news-curator edit configmap ai-news-curator-config

# Restart pods to pick up changes
kubectl -n ai-news-curator rollout restart deployment/ai-news-curator
```

### Update Secrets

```bash
# Create new secret from file
kubectl -n ai-news-curator create secret generic ai-news-curator-secrets \
  --from-env-file=secrets.env \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl -n ai-news-curator rollout restart deployment/ai-news-curator
```

## Scaling

### Manual Scaling

```bash
# Scale deployment
kubectl -n ai-news-curator scale deployment/ai-news-curator --replicas=5

# Check HPA status
kubectl -n ai-news-curator get hpa
```

### Update Resource Limits

Edit the appropriate overlay patch file and apply:

```bash
kubectl apply -k k8s/overlays/production
```

## Monitoring

### Check Application Health

```bash
# Get pod status
kubectl -n ai-news-curator get pods

# Check logs
kubectl -n ai-news-curator logs -l app=ai-news-curator -f

# Check metrics
kubectl -n ai-news-curator top pods
```

### Access Application

```bash
# Port forward for local testing
kubectl -n ai-news-curator port-forward svc/ai-news-curator-service 8080:80

# Get ingress address
kubectl -n ai-news-curator get ingress
```

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl -n ai-news-curator describe pod <pod-name>
   kubectl -n ai-news-curator logs <pod-name> -p
   ```

2. **Database connection issues**
   ```bash
   # Check postgres pod
   kubectl -n ai-news-curator logs -l app=postgres
   
   # Test connection
   kubectl -n ai-news-curator exec -it deploy/postgres -- psql -U postgres
   ```

3. **Persistent volume issues**
   ```bash
   kubectl get pv
   kubectl get pvc -n ai-news-curator
   ```

4. **Ingress not working**
   ```bash
   # Check ingress controller
   kubectl -n ingress-nginx get pods
   
   # Check ingress status
   kubectl -n ai-news-curator describe ingress
   ```

## Maintenance

### Database Backup

```bash
# Create backup
kubectl -n ai-news-curator exec deploy/postgres -- pg_dump -U postgres ai_news_curator > backup.sql

# Restore backup
kubectl -n ai-news-curator exec -i deploy/postgres -- psql -U postgres ai_news_curator < backup.sql
```

### Rolling Updates

```bash
# Update image tag in kustomization.yaml
# Then apply:
kubectl apply -k k8s/overlays/production

# Monitor rollout
kubectl -n ai-news-curator-prod rollout status deployment/ai-news-curator
```

### Rollback

```bash
# View rollout history
kubectl -n ai-news-curator rollout history deployment/ai-news-curator

# Rollback to previous version
kubectl -n ai-news-curator rollout undo deployment/ai-news-curator

# Rollback to specific revision
kubectl -n ai-news-curator rollout undo deployment/ai-news-curator --to-revision=2
```

## Security Considerations

1. **Secrets Management**: Use external secret management (Vault, Sealed Secrets, etc.) in production
2. **Network Policies**: Ensure network policies are enforced by your CNI
3. **Pod Security**: Consider using Pod Security Standards
4. **RBAC**: Implement proper RBAC for service accounts
5. **Image Scanning**: Scan container images for vulnerabilities

## Resource Requirements

### Minimum Cluster Requirements
- 3 nodes (for HA)
- 4 vCPUs per node
- 8GB RAM per node
- 50GB storage per node

### Application Requirements (Production)
- API: 3-20 pods, 500m-1000m CPU, 512Mi-1Gi memory each
- PostgreSQL: 1 pod, 500m CPU, 512Mi memory, 10Gi storage
- Redis: 1 pod, 200m CPU, 256Mi memory, 2Gi storage

## Helm Chart (Future)

A Helm chart is planned for easier deployment. Track progress in issue #XXX.