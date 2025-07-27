#!/bin/bash

# AI Content Curator - Azure AKS Deployment Script
# This script deploys the application to Azure Kubernetes Service

set -e

# Configuration
CLUSTER_NAME="ai-content-curator"
RESOURCE_GROUP="ai-content-curator-rg"
LOCATION="${AZURE_LOCATION:-eastus}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${ACR_REGISTRY:-yourregistry.azurecr.io}"
ACR_NAME="${ACR_NAME:-aicontentcuratoracr}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo_info "Checking prerequisites..."
    
    command -v az >/dev/null 2>&1 || { echo_error "Azure CLI is required but not installed."; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { echo_error "kubectl is required but not installed."; exit 1; }
    command -v helm >/dev/null 2>&1 || { echo_error "helm is required but not installed."; exit 1; }
    
    # Check Azure login
    az account show >/dev/null 2>&1 || { echo_error "Azure CLI not logged in. Run 'az login'"; exit 1; }
    
    echo_info "Prerequisites check passed!"
}

# Create resource group
create_resource_group() {
    echo_info "Creating resource group..."
    
    az group create \
        --name "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --output table
    
    echo_info "Resource group created: $RESOURCE_GROUP"
}

# Create Azure Container Registry
create_acr() {
    echo_info "Creating Azure Container Registry..."
    
    # Check if ACR exists
    if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
        echo_info "ACR already exists: $ACR_NAME"
    else
        az acr create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$ACR_NAME" \
            --sku Basic \
            --admin-enabled true \
            --output table
        
        echo_info "ACR created: $ACR_NAME"
    fi
    
    # Get ACR login server
    ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "loginServer" --output tsv)
    REGISTRY="$ACR_LOGIN_SERVER"
}

# Create AKS cluster
create_aks_cluster() {
    echo_info "Creating AKS cluster..."
    
    # Check if cluster exists
    if az aks show --name "$CLUSTER_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
        echo_info "AKS cluster already exists: $CLUSTER_NAME"
    else
        echo_info "Creating AKS cluster (this may take 10-15 minutes)..."
        
        az aks create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$CLUSTER_NAME" \
            --node-count 3 \
            --node-vm-size Standard_D2s_v3 \
            --kubernetes-version 1.28.0 \
            --enable-addons monitoring \
            --enable-managed-identity \
            --attach-acr "$ACR_NAME" \
            --enable-cluster-autoscaler \
            --min-count 2 \
            --max-count 5 \
            --network-plugin azure \
            --network-policy azure \
            --output table
        
        echo_info "AKS cluster created successfully!"
    fi
}

# Configure kubectl
configure_kubectl() {
    echo_info "Configuring kubectl..."
    
    az aks get-credentials \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CLUSTER_NAME" \
        --overwrite-existing
    
    kubectl config current-context
    
    # Verify cluster connection
    kubectl get nodes
}

# Install NGINX Ingress Controller
install_nginx_ingress() {
    echo_info "Installing NGINX Ingress Controller..."
    
    # Add NGINX Helm repository
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    # Install or upgrade NGINX Ingress Controller
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz \
        --set controller.replicaCount=2 \
        --set controller.metrics.enabled=true \
        --set controller.metrics.serviceMonitor.enabled=true \
        --wait
    
    echo_info "NGINX Ingress Controller installed"
}

# Install cert-manager for SSL certificates
install_cert_manager() {
    echo_info "Installing cert-manager..."
    
    # Add cert-manager Helm repository
    helm repo add jetstack https://charts.jetstack.io
    helm repo update
    
    # Install cert-manager
    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.13.0 \
        --set installCRDs=true \
        --wait
    
    echo_info "cert-manager installed"
}

# Build and push Docker image
build_and_push_image() {
    echo_info "Building and pushing Docker image..."
    
    # Login to ACR
    az acr login --name "$ACR_NAME"
    
    # Build and tag image
    docker build -t ai-content-curator:$IMAGE_TAG .
    docker tag ai-content-curator:$IMAGE_TAG "$REGISTRY/ai-content-curator:$IMAGE_TAG"
    
    # Push image
    docker push "$REGISTRY/ai-content-curator:$IMAGE_TAG"
    
    echo_info "Image pushed to $REGISTRY/ai-content-curator:$IMAGE_TAG"
}

# Create Azure-specific Kubernetes resources
create_azure_resources() {
    echo_info "Creating Azure-specific Kubernetes resources..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace ai-news-curator-prod --dry-run=client -o yaml | kubectl apply -f -
    
    # Create cluster issuer for Let's Encrypt
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    echo_info "Azure-specific resources created"
}

# Deploy application using Kustomize
deploy_application() {
    echo_info "Deploying application to AKS..."
    
    # Create temporary kustomization for AKS deployment
    cat > kustomization-aks.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - k8s/overlays/$ENVIRONMENT

images:
  - name: ai-news-curator
    newName: $REGISTRY/ai-content-curator
    newTag: $IMAGE_TAG

patchesStrategicMerge:
  - deployment/azure/kubernetes/aks-patches.yaml

EOF

    # Apply the deployment
    kubectl apply -k . -f kustomization-aks.yaml
    
    # Wait for deployment to be ready
    kubectl wait --for=condition=available --timeout=300s deployment/ai-news-curator -n ai-news-curator-prod
    
    # Clean up temporary file
    rm kustomization-aks.yaml
    
    echo_info "Application deployed successfully!"
}

# Get service URLs
get_service_info() {
    echo_info "Getting service information..."
    
    echo_info "Deployment status:"
    kubectl get deployments -n ai-news-curator-prod
    
    echo_info "Service endpoints:"
    kubectl get services -n ai-news-curator-prod
    
    echo_info "Ingress information:"
    kubectl get ingress -n ai-news-curator-prod
    
    # Get Load Balancer IP
    echo_info "Waiting for external IP..."
    EXTERNAL_IP=""
    while [ -z $EXTERNAL_IP ]; do
        echo "Waiting for external IP..."
        EXTERNAL_IP=$(kubectl get ingress ai-news-curator-ingress -n ai-news-curator-prod --template="{{range .status.loadBalancer.ingress}}{{.ip}}{{end}}" 2>/dev/null || echo "")
        [ -z "$EXTERNAL_IP" ] && sleep 10
    done
    
    echo_info "Application URL: http://$EXTERNAL_IP"
    echo_info "Health check: http://$EXTERNAL_IP/health"
    
    # Show node information
    echo_info "Cluster nodes:"
    kubectl get nodes -o wide
}

# Setup monitoring
setup_monitoring() {
    echo_info "Setting up monitoring..."
    
    # Install Azure Monitor for containers (if not already enabled)
    az aks enable-addons \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CLUSTER_NAME" \
        --addons monitoring \
        --workspace-resource-id "$(az monitor log-analytics workspace create --resource-group "$RESOURCE_GROUP" --workspace-name "ai-content-curator-workspace" --query id -o tsv)" 2>/dev/null || true
    
    echo_info "Monitoring configured"
}

# Main deployment function
main() {
    echo_info "Starting Azure AKS deployment for AI Content Curator..."
    echo_info "Cluster: $CLUSTER_NAME"
    echo_info "Resource Group: $RESOURCE_GROUP"
    echo_info "Location: $LOCATION"
    echo_info "Environment: $ENVIRONMENT"
    echo_info "Image Tag: $IMAGE_TAG"
    
    check_prerequisites
    create_resource_group
    create_acr
    create_aks_cluster
    configure_kubectl
    install_nginx_ingress
    install_cert_manager
    build_and_push_image
    create_azure_resources
    deploy_application
    setup_monitoring
    get_service_info
    
    echo_info "AKS deployment completed successfully! 🚀"
    echo_info "You can monitor your cluster in the Azure portal:"
    echo_info "https://portal.azure.com/#@/resource/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerService/managedClusters/$CLUSTER_NAME"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "cleanup")
        echo_info "Cleaning up AKS deployment..."
        kubectl delete -k k8s/overlays/$ENVIRONMENT || true
        az aks delete --name "$CLUSTER_NAME" --resource-group "$RESOURCE_GROUP" --yes --no-wait
        az group delete --name "$RESOURCE_GROUP" --yes --no-wait
        echo_info "Cleanup initiated (running in background)!"
        ;;
    "status")
        configure_kubectl
        get_service_info
        ;;
    "scale")
        REPLICAS="${2:-3}"
        echo_info "Scaling application to $REPLICAS replicas..."
        kubectl scale deployment/ai-news-curator --replicas="$REPLICAS" -n ai-news-curator-prod
        kubectl wait --for=condition=available --timeout=300s deployment/ai-news-curator -n ai-news-curator-prod
        echo_info "Scaling completed!"
        ;;
    *)
        echo "Usage: $0 {deploy|cleanup|status|scale [replicas]}"
        echo "  deploy  - Deploy application to AKS (default)"
        echo "  cleanup - Remove AKS cluster and resources"
        echo "  status  - Show deployment status"
        echo "  scale   - Scale application (default: 3 replicas)"
        exit 1
        ;;
esac 