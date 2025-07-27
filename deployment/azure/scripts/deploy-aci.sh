#!/bin/bash

# AI Content Curator - Azure Container Instances Deployment Script
# This script deploys the application to Azure Container Instances

set -e

# Configuration
RESOURCE_GROUP="ai-content-curator-rg"
LOCATION="${AZURE_LOCATION:-eastus}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${ACR_REGISTRY:-yourregistry.azurecr.io}"
ACR_NAME="${ACR_NAME:-aicontentcuratoracr}"
CONTAINER_GROUP_NAME="ai-content-curator-cg"
STORAGE_ACCOUNT_NAME="aicontentcuratorstorage"

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
    command -v docker >/dev/null 2>&1 || { echo_error "docker is required but not installed."; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo_error "jq is required but not installed."; exit 1; }
    
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
    
    # Get ACR credentials
    ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "loginServer" --output tsv)
    ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "username" --output tsv)
    ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" --output tsv)
    
    REGISTRY="$ACR_LOGIN_SERVER"
}

# Create storage account for persistent data
create_storage_account() {
    echo_info "Creating storage account..."
    
    # Check if storage account exists
    if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
        echo_info "Storage account already exists: $STORAGE_ACCOUNT_NAME"
    else
        az storage account create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$STORAGE_ACCOUNT_NAME" \
            --location "$LOCATION" \
            --sku Standard_LRS \
            --kind StorageV2 \
            --output table
        
        echo_info "Storage account created: $STORAGE_ACCOUNT_NAME"
    fi
    
    # Get storage account key
    STORAGE_KEY=$(az storage account keys list \
        --resource-group "$RESOURCE_GROUP" \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --query "[0].value" \
        --output tsv)
    
    # Create file shares for persistent data
    az storage share create \
        --name "ai-curator-data" \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --account-key "$STORAGE_KEY" \
        --quota 10 \
        --output table 2>/dev/null || true
    
    az storage share create \
        --name "ai-curator-logs" \
        --account-name "$STORAGE_ACCOUNT_NAME" \
        --account-key "$STORAGE_KEY" \
        --quota 5 \
        --output table 2>/dev/null || true
}

# Create Azure Database for PostgreSQL
create_postgres_database() {
    echo_info "Creating Azure Database for PostgreSQL..."
    
    POSTGRES_SERVER_NAME="ai-content-curator-db"
    POSTGRES_ADMIN_USER="postgres"
    POSTGRES_ADMIN_PASSWORD="$(openssl rand -base64 32)"
    
    # Check if PostgreSQL server exists
    if az postgres server show --name "$POSTGRES_SERVER_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
        echo_info "PostgreSQL server already exists: $POSTGRES_SERVER_NAME"
    else
        echo_info "Creating PostgreSQL server (this may take a few minutes)..."
        
        az postgres server create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$POSTGRES_SERVER_NAME" \
            --location "$LOCATION" \
            --admin-user "$POSTGRES_ADMIN_USER" \
            --admin-password "$POSTGRES_ADMIN_PASSWORD" \
            --sku-name GP_Gen5_2 \
            --version 13 \
            --storage-size 51200 \
            --output table
        
        # Configure firewall to allow Azure services
        az postgres server firewall-rule create \
            --resource-group "$RESOURCE_GROUP" \
            --server "$POSTGRES_SERVER_NAME" \
            --name "AllowAzureServices" \
            --start-ip-address 0.0.0.0 \
            --end-ip-address 0.0.0.0
        
        # Create database
        az postgres db create \
            --resource-group "$RESOURCE_GROUP" \
            --server-name "$POSTGRES_SERVER_NAME" \
            --name "ai_news_curator"
        
        echo_info "PostgreSQL server created: $POSTGRES_SERVER_NAME"
        echo_warn "PostgreSQL admin password: $POSTGRES_ADMIN_PASSWORD"
        echo_warn "Please save this password securely!"
    fi
    
    POSTGRES_HOST="$POSTGRES_SERVER_NAME.postgres.database.azure.com"
}

# Create Azure Cache for Redis
create_redis_cache() {
    echo_info "Creating Azure Cache for Redis..."
    
    REDIS_NAME="ai-content-curator-cache"
    
    # Check if Redis cache exists
    if az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
        echo_info "Redis cache already exists: $REDIS_NAME"
    else
        echo_info "Creating Redis cache (this may take 15-20 minutes)..."
        
        az redis create \
            --resource-group "$RESOURCE_GROUP" \
            --name "$REDIS_NAME" \
            --location "$LOCATION" \
            --sku Basic \
            --vm-size c0 \
            --output table
        
        echo_info "Redis cache created: $REDIS_NAME"
    fi
    
    # Get Redis connection details
    REDIS_HOST=$(az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query "hostName" --output tsv)
    REDIS_KEY=$(az redis list-keys --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query "primaryKey" --output tsv)
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

# Create Application Gateway (for load balancing)
create_application_gateway() {
    echo_info "Creating Application Gateway..."
    
    VNET_NAME="ai-content-curator-vnet"
    SUBNET_NAME="ai-content-curator-subnet"
    PUBLIC_IP_NAME="ai-content-curator-ip"
    APP_GATEWAY_NAME="ai-content-curator-gateway"
    
    # Create virtual network
    az network vnet create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VNET_NAME" \
        --address-prefix 10.0.0.0/16 \
        --subnet-name "$SUBNET_NAME" \
        --subnet-prefix 10.0.0.0/24 \
        --location "$LOCATION" \
        --output table 2>/dev/null || true
    
    # Create public IP
    az network public-ip create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$PUBLIC_IP_NAME" \
        --location "$LOCATION" \
        --allocation-method Static \
        --sku Standard \
        --output table 2>/dev/null || true
    
    # Get public IP address
    PUBLIC_IP=$(az network public-ip show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$PUBLIC_IP_NAME" \
        --query "ipAddress" \
        --output tsv)
    
    echo_info "Public IP created: $PUBLIC_IP"
}

# Deploy container group
deploy_container_group() {
    echo_info "Deploying container group..."
    
    # Create container group with multiple containers
    cat > container-group.yaml << EOF
apiVersion: 2019-12-01
location: $LOCATION
name: $CONTAINER_GROUP_NAME
properties:
  containers:
  - name: ai-content-curator-app
    properties:
      image: $REGISTRY/ai-content-curator:$IMAGE_TAG
      resources:
        requests:
          cpu: 1.0
          memoryInGb: 2.0
      ports:
      - port: 3000
        protocol: TCP
      environmentVariables:
      - name: NODE_ENV
        value: $ENVIRONMENT
      - name: PORT
        value: "3000"
      - name: DB_HOST
        value: $POSTGRES_HOST
      - name: DB_NAME
        value: ai_news_curator
      - name: DB_USER
        value: $POSTGRES_ADMIN_USER@$POSTGRES_SERVER_NAME
      - name: DB_PASSWORD
        secureValue: $POSTGRES_ADMIN_PASSWORD
      - name: REDIS_HOST
        value: $REDIS_HOST
      - name: REDIS_PASSWORD
        secureValue: $REDIS_KEY
      - name: REDIS_PORT
        value: "6380"
      - name: AZURE_REGION
        value: $LOCATION
      volumeMounts:
      - name: data-volume
        mountPath: /app/data
      - name: logs-volume
        mountPath: /app/logs
      livenessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 30
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 15
        periodSeconds: 5
  imageRegistryCredentials:
  - server: $REGISTRY
    username: $ACR_USERNAME
    password: $ACR_PASSWORD
  ipAddress:
    type: Public
    ports:
    - protocol: TCP
      port: 3000
    dnsNameLabel: ai-content-curator-$(date +%s)
  osType: Linux
  restartPolicy: Always
  volumes:
  - name: data-volume
    azureFile:
      shareName: ai-curator-data
      storageAccountName: $STORAGE_ACCOUNT_NAME
      storageAccountKey: $STORAGE_KEY
  - name: logs-volume
    azureFile:
      shareName: ai-curator-logs
      storageAccountName: $STORAGE_ACCOUNT_NAME
      storageAccountKey: $STORAGE_KEY
tags:
  Environment: $ENVIRONMENT
  Application: AI-Content-Curator
EOF

    # Deploy the container group
    az container create \
        --resource-group "$RESOURCE_GROUP" \
        --file container-group.yaml \
        --output table
    
    # Clean up temporary file
    rm container-group.yaml
    
    echo_info "Container group deployed successfully!"
}

# Get service information
get_service_info() {
    echo_info "Getting service information..."
    
    # Get container group status
    az container show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CONTAINER_GROUP_NAME" \
        --query "{Status:instanceView.state,IP:ipAddress.ip,FQDN:ipAddress.fqdn}" \
        --output table
    
    # Get application URL
    CONTAINER_IP=$(az container show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CONTAINER_GROUP_NAME" \
        --query "ipAddress.ip" \
        --output tsv)
    
    CONTAINER_FQDN=$(az container show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CONTAINER_GROUP_NAME" \
        --query "ipAddress.fqdn" \
        --output tsv)
    
    echo_info "Container deployed successfully!"
    echo_info "Application URL: http://$CONTAINER_IP:3000"
    echo_info "Application FQDN: http://$CONTAINER_FQDN:3000"
    echo_info "Health check: http://$CONTAINER_IP:3000/health"
    
    # Show container logs
    echo_info "Recent container logs:"
    az container logs \
        --resource-group "$RESOURCE_GROUP" \
        --name "$CONTAINER_GROUP_NAME" \
        --container-name ai-content-curator-app \
        --tail 20
}

# Setup monitoring
setup_monitoring() {
    echo_info "Setting up monitoring..."
    
    # Create Log Analytics workspace
    WORKSPACE_NAME="ai-content-curator-workspace"
    
    az monitor log-analytics workspace create \
        --resource-group "$RESOURCE_GROUP" \
        --workspace-name "$WORKSPACE_NAME" \
        --location "$LOCATION" \
        --output table 2>/dev/null || true
    
    # Get workspace ID
    WORKSPACE_ID=$(az monitor log-analytics workspace show \
        --resource-group "$RESOURCE_GROUP" \
        --workspace-name "$WORKSPACE_NAME" \
        --query "customerId" \
        --output tsv)
    
    WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
        --resource-group "$RESOURCE_GROUP" \
        --workspace-name "$WORKSPACE_NAME" \
        --query "primarySharedKey" \
        --output tsv)
    
    echo_info "Monitoring workspace created: $WORKSPACE_NAME"
    echo_info "Workspace ID: $WORKSPACE_ID"
}

# Main deployment function
main() {
    echo_info "Starting Azure Container Instances deployment for AI Content Curator..."
    echo_info "Resource Group: $RESOURCE_GROUP"
    echo_info "Location: $LOCATION"
    echo_info "Environment: $ENVIRONMENT"
    echo_info "Image Tag: $IMAGE_TAG"
    
    check_prerequisites
    create_resource_group
    create_acr
    create_storage_account
    create_postgres_database
    create_redis_cache
    build_and_push_image
    create_application_gateway
    deploy_container_group
    setup_monitoring
    get_service_info
    
    echo_info "ACI deployment completed successfully! 🚀"
    echo_info "You can monitor your containers in the Azure portal:"
    echo_info "https://portal.azure.com/#@/resource/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerInstance/containerGroups/$CONTAINER_GROUP_NAME"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "cleanup")
        echo_info "Cleaning up ACI deployment..."
        az container delete --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_GROUP_NAME" --yes 2>/dev/null || true
        az group delete --name "$RESOURCE_GROUP" --yes --no-wait
        echo_info "Cleanup initiated (running in background)!"
        ;;
    "status")
        get_service_info
        ;;
    "logs")
        echo_info "Container logs:"
        az container logs \
            --resource-group "$RESOURCE_GROUP" \
            --name "$CONTAINER_GROUP_NAME" \
            --container-name ai-content-curator-app \
            --tail 50
        ;;
    "restart")
        echo_info "Restarting container group..."
        az container restart \
            --resource-group "$RESOURCE_GROUP" \
            --name "$CONTAINER_GROUP_NAME"
        echo_info "Container group restarted!"
        ;;
    *)
        echo "Usage: $0 {deploy|cleanup|status|logs|restart}"
        echo "  deploy  - Deploy application to ACI (default)"
        echo "  cleanup - Remove ACI and all resources"
        echo "  status  - Show deployment status"
        echo "  logs    - Show container logs"
        echo "  restart - Restart container group"
        exit 1
        ;;
esac 