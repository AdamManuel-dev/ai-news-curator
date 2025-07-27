# AI Content Curator - Cloud Deployment Scripts

This directory contains comprehensive deployment scripts for deploying the AI Content Curator application to both AWS and Azure cloud platforms using Docker containers and Kubernetes.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [AWS Deployment](#aws-deployment)
- [Azure Deployment](#azure-deployment)
- [CI/CD Pipelines](#cicd-pipelines)
- [Environment Configuration](#environment-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

## 🔍 Overview

The deployment scripts support four different deployment scenarios:

### AWS Options
1. **EKS (Kubernetes)** - Production-ready Kubernetes cluster with auto-scaling
2. **ECS (Docker)** - Serverless containers with Fargate

### Azure Options
1. **AKS (Kubernetes)** - Managed Kubernetes service with monitoring
2. **ACI (Docker)** - Serverless Docker container instances

## 🛠️ Prerequisites

### Common Requirements
- Docker installed and running
- Git access to the repository
- Environment variables configured

### AWS Deployment
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Configure AWS credentials
aws configure
```

### Azure Deployment
```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Install kubectl (if not already installed)
az aks install-cli

# Install Helm (if not already installed)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Login to Azure
az login
```

## ☁️ AWS Deployment

### EKS (Kubernetes) Deployment

Deploy to a managed Kubernetes cluster with auto-scaling and load balancing:

```bash
# Basic deployment
cd deployment/aws/scripts
./deploy-eks.sh

# Custom configuration
export AWS_REGION="us-east-1"
export CLUSTER_NAME="my-ai-curator"
export IMAGE_TAG="v1.2.0"
./deploy-eks.sh

# Check deployment status
./deploy-eks.sh status

# Scale the cluster
kubectl scale deployment/ai-news-curator --replicas=5 -n ai-news-curator-prod

# Cleanup
./deploy-eks.sh cleanup
```

**Features:**
- Auto-scaling from 2-5 nodes
- Application Load Balancer with SSL termination
- AWS Load Balancer Controller
- ECR integration
- CloudWatch monitoring
- Health checks and rolling updates

### ECS (Docker) Deployment

Deploy to serverless containers with Fargate:

```bash
# Basic deployment
cd deployment/aws/scripts
./deploy-ecs.sh

# Custom configuration
export AWS_REGION="us-west-2"
export ENVIRONMENT="staging"
export IMAGE_TAG="latest"
./deploy-ecs.sh

# Check deployment status
./deploy-ecs.sh status

# Cleanup
./deploy-ecs.sh cleanup
```

**Features:**
- Serverless containers (no server management)
- Application Load Balancer
- Auto-scaling based on CPU/memory
- VPC with public/private subnets
- ECR integration
- CloudWatch logging

## 🔵 Azure Deployment

### AKS (Kubernetes) Deployment

Deploy to Azure Kubernetes Service with monitoring and SSL certificates:

```bash
# Basic deployment
cd deployment/azure/scripts
./deploy-aks.sh

# Custom configuration
export AZURE_LOCATION="westus2"
export CLUSTER_NAME="my-ai-curator"
export ENVIRONMENT="production"
./deploy-aks.sh

# Check deployment status
./deploy-aks.sh status

# Scale the application
./deploy-aks.sh scale 5

# Cleanup
./deploy-aks.sh cleanup
```

**Features:**
- Cluster auto-scaler (2-5 nodes)
- NGINX Ingress Controller
- cert-manager for SSL certificates
- Azure Monitor integration
- ACR integration
- Azure CNI networking

### ACI (Docker) Deployment

Deploy to serverless Docker container instances with persistent storage:

```bash
# Basic deployment
cd deployment/azure/scripts
./deploy-aci.sh

# Custom configuration
export AZURE_LOCATION="eastus"
export ENVIRONMENT="development"
./deploy-aci.sh

# Check deployment status
./deploy-aci.sh status

# View logs
./deploy-aci.sh logs

# Restart containers
./deploy-aci.sh restart

# Cleanup
./deploy-aci.sh cleanup
```

**Features:**
- Serverless containers
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure File Storage for persistence
- Log Analytics workspace
- Public IP with DNS name

## 🔄 CI/CD Pipelines

### GitHub Actions (AWS)

Create `.github/workflows/deploy-aws.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-west-2
  ECR_REPOSITORY: ai-content-curator

jobs:
  deploy-eks:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
    
    - name: Deploy to EKS
      run: |
        export IMAGE_TAG=${{ github.sha }}
        ./deployment/aws/scripts/deploy-eks.sh
```

### GitHub Actions (Azure)

Create `.github/workflows/deploy-azure.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

env:
  AZURE_LOCATION: eastus
  ACR_NAME: aicontentcuratoracr

jobs:
  deploy-aks:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Azure Login
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
    
    - name: Deploy to AKS
      run: |
        export IMAGE_TAG=${{ github.sha }}
        ./deployment/azure/scripts/deploy-aks.sh
```

## ⚙️ Environment Configuration

### Environment Variables

Create environment-specific configuration files:

**`.env.production`**
```bash
NODE_ENV=production
LOG_LEVEL=warn
DB_HOST=production-db-host
REDIS_HOST=production-redis-host
ANTHROPIC_API_KEY=prod_key
OPENAI_API_KEY=prod_key
PINECONE_API_KEY=prod_key
```

**`.env.staging`**
```bash
NODE_ENV=staging
LOG_LEVEL=info
DB_HOST=staging-db-host
REDIS_HOST=staging-redis-host
```

### Secrets Management

#### AWS Secrets Manager
```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
    --name "ai-content-curator/production" \
    --description "Production secrets for AI Content Curator" \
    --secret-string '{"ANTHROPIC_API_KEY":"key","OPENAI_API_KEY":"key"}'
```

#### Azure Key Vault
```bash
# Store secrets in Azure Key Vault
az keyvault secret set \
    --vault-name "ai-content-curator-kv" \
    --name "anthropic-api-key" \
    --value "your-key"
```

## 📊 Monitoring & Logging

### AWS CloudWatch

Monitor your EKS/ECS deployments:

```bash
# View EKS cluster logs
aws logs describe-log-groups --log-group-name-prefix /aws/eks/ai-content-curator

# View ECS task logs
aws logs describe-log-groups --log-group-name-prefix /ecs/ai-content-curator
```

### Azure Monitor

Monitor your AKS/ACI deployments:

```bash
# View AKS logs
az monitor log-analytics query \
    --workspace "ai-content-curator-workspace" \
    --analytics-query "ContainerLog | where Name contains 'ai-content-curator'"

# View ACI logs
az container logs \
    --resource-group "ai-content-curator-rg" \
    --name "ai-content-curator-cg"
```

## 🐛 Troubleshooting

### Common Issues

#### AWS EKS
```bash
# Check cluster status
aws eks describe-cluster --name ai-content-curator

# Check node status
kubectl get nodes

# Check pod logs
kubectl logs -l app=ai-news-curator -n ai-news-curator-prod

# Check ingress
kubectl describe ingress -n ai-news-curator-prod
```

#### Azure AKS
```bash
# Check cluster status
az aks show --name ai-content-curator --resource-group ai-content-curator-rg

# Check node status
kubectl get nodes

# Check ingress controller
kubectl get pods -n ingress-nginx
```

#### Docker Issues
```bash
# Check if Docker is running
docker info

# Check container logs
docker logs <container-id>

# Rebuild image
docker build --no-cache -t ai-content-curator .
```

### Support

For deployment issues:

1. Check the specific script logs
2. Verify prerequisites are installed
3. Ensure cloud credentials are configured
4. Check resource quotas and limits
5. Review the application logs

### Resource Cleanup

#### AWS
```bash
# Remove EKS resources
./deployment/aws/scripts/deploy-eks.sh cleanup

# Remove ECS resources
./deployment/aws/scripts/deploy-ecs.sh cleanup

# Check for remaining resources
aws eks list-clusters
aws ecs list-clusters
```

#### Azure
```bash
# Remove AKS resources
./deployment/azure/scripts/deploy-aks.sh cleanup

# Remove ACI resources
./deployment/azure/scripts/deploy-aci.sh cleanup

# Check for remaining resources
az aks list
az container list
```

## 🔐 Security Best Practices

1. **Use IAM roles/Managed identities** instead of access keys
2. **Enable SSL/TLS** for all public endpoints
3. **Use private subnets** for databases and internal services
4. **Enable monitoring and alerting** for security events
5. **Regularly update** container images and dependencies
6. **Use secrets management** for sensitive data
7. **Enable network policies** to restrict pod-to-pod communication

## 💰 Cost Optimization

### AWS
- Use Spot instances for non-production workloads
- Configure HPA to scale down during low usage
- Use reserved instances for predictable workloads
- Monitor costs with AWS Cost Explorer

### Azure
- Use Azure Spot VMs for development
- Configure cluster autoscaler appropriately
- Use Azure Cost Management for monitoring
- Consider Azure Reserved VM Instances

---

For more detailed information, refer to the individual script files and cloud provider documentation. 