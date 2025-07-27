#!/bin/bash

# AI Content Curator - Unified Deployment Script
# This script provides a simple interface for deploying to AWS or Azure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

echo_header() {
    echo -e "${CYAN}$1${NC}"
}

echo_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Print banner
print_banner() {
    echo_header "╔══════════════════════════════════════════════════════════════════╗"
    echo_header "║                   AI Content Curator                            ║"
    echo_header "║                 Cloud Deployment Scripts                        ║"
    echo_header "╚══════════════════════════════════════════════════════════════════╝"
    echo
}

# Show deployment options
show_deployment_options() {
    echo_header "🚀 Available Deployment Options:"
    echo
    echo "  AWS DEPLOYMENTS:"
    echo "    1) EKS (Kubernetes)  - Production-ready K8s cluster with auto-scaling"
    echo "    2) ECS (Docker)      - Serverless containers with Fargate"
    echo
    echo "  AZURE DEPLOYMENTS:"
    echo "    3) AKS (Kubernetes)  - Managed Kubernetes service with monitoring"
    echo "    4) ACI (Docker)      - Serverless Docker container instances"
    echo
    echo "  MANAGEMENT:"
    echo "    5) Status            - Check deployment status"
    echo "    6) Cleanup           - Remove cloud resources"
    echo "    7) Setup             - Install prerequisites"
    echo "    8) Exit"
    echo
}

# Check prerequisites
check_common_prerequisites() {
    echo_step "Checking common prerequisites..."
    
    command -v docker >/dev/null 2>&1 || { echo_error "Docker is required but not installed."; return 1; }
    command -v git >/dev/null 2>&1 || { echo_error "Git is required but not installed."; return 1; }
    
    # Check if Docker is running
    docker info >/dev/null 2>&1 || { echo_error "Docker is not running. Please start Docker."; return 1; }
    
    echo_info "Common prerequisites check passed!"
    return 0
}

# Check AWS prerequisites
check_aws_prerequisites() {
    echo_step "Checking AWS prerequisites..."
    
    command -v aws >/dev/null 2>&1 || { echo_error "AWS CLI is required. Run 'deployment/deploy.sh setup'"; return 1; }
    command -v kubectl >/dev/null 2>&1 || { echo_error "kubectl is required. Run 'deployment/deploy.sh setup'"; return 1; }
    
    # Check AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || { echo_error "AWS credentials not configured. Run 'aws configure'"; return 1; }
    
    echo_info "AWS prerequisites check passed!"
    return 0
}

# Check Azure prerequisites
check_azure_prerequisites() {
    echo_step "Checking Azure prerequisites..."
    
    command -v az >/dev/null 2>&1 || { echo_error "Azure CLI is required. Run 'deployment/deploy.sh setup'"; return 1; }
    command -v kubectl >/dev/null 2>&1 || { echo_error "kubectl is required. Run 'deployment/deploy.sh setup'"; return 1; }
    
    # Check Azure login
    az account show >/dev/null 2>&1 || { echo_error "Azure CLI not logged in. Run 'az login'"; return 1; }
    
    echo_info "Azure prerequisites check passed!"
    return 0
}

# Get environment configuration
get_environment_config() {
    echo_step "Environment Configuration"
    
    # Environment
    if [ -z "$ENVIRONMENT" ]; then
        echo "Select environment:"
        echo "  1) production"
        echo "  2) staging"
        echo "  3) development"
        read -p "Choose environment [1-3] (default: 1): " env_choice
        case ${env_choice:-1} in
            1) ENVIRONMENT="production" ;;
            2) ENVIRONMENT="staging" ;;
            3) ENVIRONMENT="development" ;;
            *) ENVIRONMENT="production" ;;
        esac
    fi
    
    # Image tag
    if [ -z "$IMAGE_TAG" ]; then
        read -p "Enter image tag (default: latest): " tag_input
        IMAGE_TAG=${tag_input:-latest}
    fi
    
    export ENVIRONMENT
    export IMAGE_TAG
    
    echo_info "Environment: $ENVIRONMENT"
    echo_info "Image Tag: $IMAGE_TAG"
}

# Deploy to AWS EKS
deploy_aws_eks() {
    echo_header "🚀 Deploying to AWS EKS..."
    
    check_common_prerequisites || exit 1
    check_aws_prerequisites || exit 1
    get_environment_config
    
    # Additional EKS-specific config
    if [ -z "$AWS_REGION" ]; then
        read -p "Enter AWS region (default: us-west-2): " region_input
        export AWS_REGION=${region_input:-us-west-2}
    fi
    
    if [ -z "$CLUSTER_NAME" ]; then
        read -p "Enter cluster name (default: ai-content-curator): " cluster_input
        export CLUSTER_NAME=${cluster_input:-ai-content-curator}
    fi
    
    echo_info "Starting EKS deployment..."
    echo_info "Region: $AWS_REGION"
    echo_info "Cluster: $CLUSTER_NAME"
    
    cd "$(dirname "$0")/aws/scripts"
    ./deploy-eks.sh
    
    echo_info "EKS deployment completed! 🎉"
}

# Deploy to AWS ECS
deploy_aws_ecs() {
    echo_header "🚀 Deploying to AWS ECS..."
    
    check_common_prerequisites || exit 1
    check_aws_prerequisites || exit 1
    get_environment_config
    
    # Additional ECS-specific config
    if [ -z "$AWS_REGION" ]; then
        read -p "Enter AWS region (default: us-west-2): " region_input
        export AWS_REGION=${region_input:-us-west-2}
    fi
    
    echo_info "Starting ECS deployment..."
    echo_info "Region: $AWS_REGION"
    
    cd "$(dirname "$0")/aws/scripts"
    ./deploy-ecs.sh
    
    echo_info "ECS deployment completed! 🎉"
}

# Deploy to Azure AKS
deploy_azure_aks() {
    echo_header "🚀 Deploying to Azure AKS..."
    
    check_common_prerequisites || exit 1
    check_azure_prerequisites || exit 1
    get_environment_config
    
    # Additional AKS-specific config
    if [ -z "$AZURE_LOCATION" ]; then
        read -p "Enter Azure location (default: eastus): " location_input
        export AZURE_LOCATION=${location_input:-eastus}
    fi
    
    if [ -z "$CLUSTER_NAME" ]; then
        read -p "Enter cluster name (default: ai-content-curator): " cluster_input
        export CLUSTER_NAME=${cluster_input:-ai-content-curator}
    fi
    
    echo_info "Starting AKS deployment..."
    echo_info "Location: $AZURE_LOCATION"
    echo_info "Cluster: $CLUSTER_NAME"
    
    cd "$(dirname "$0")/azure/scripts"
    ./deploy-aks.sh
    
    echo_info "AKS deployment completed! 🎉"
}

# Deploy to Azure ACI
deploy_azure_aci() {
    echo_header "🚀 Deploying to Azure ACI..."
    
    check_common_prerequisites || exit 1
    check_azure_prerequisites || exit 1
    get_environment_config
    
    # Additional ACI-specific config
    if [ -z "$AZURE_LOCATION" ]; then
        read -p "Enter Azure location (default: eastus): " location_input
        export AZURE_LOCATION=${location_input:-eastus}
    fi
    
    echo_info "Starting ACI deployment..."
    echo_info "Location: $AZURE_LOCATION"
    
    cd "$(dirname "$0")/azure/scripts"
    ./deploy-aci.sh
    
    echo_info "ACI deployment completed! 🎉"
}

# Check deployment status
check_deployment_status() {
    echo_header "📊 Checking Deployment Status..."
    
    echo "Which deployment would you like to check?"
    echo "  1) AWS EKS"
    echo "  2) AWS ECS"
    echo "  3) Azure AKS"
    echo "  4) Azure ACI"
    echo
    read -p "Choose option [1-4]: " status_choice
    
    case $status_choice in
        1)
            echo_info "Checking AWS EKS status..."
            cd "$(dirname "$0")/aws/scripts"
            ./deploy-eks.sh status
            ;;
        2)
            echo_info "Checking AWS ECS status..."
            cd "$(dirname "$0")/aws/scripts"
            ./deploy-ecs.sh status
            ;;
        3)
            echo_info "Checking Azure AKS status..."
            cd "$(dirname "$0")/azure/scripts"
            ./deploy-aks.sh status
            ;;
        4)
            echo_info "Checking Azure ACI status..."
            cd "$(dirname "$0")/azure/scripts"
            ./deploy-aci.sh status
            ;;
        *)
            echo_error "Invalid option"
            ;;
    esac
}

# Cleanup resources
cleanup_resources() {
    echo_header "🧹 Cleanup Cloud Resources"
    echo_warn "This will delete all cloud resources and may result in data loss!"
    
    echo "Which deployment would you like to cleanup?"
    echo "  1) AWS EKS"
    echo "  2) AWS ECS"
    echo "  3) Azure AKS"
    echo "  4) Azure ACI"
    echo
    read -p "Choose option [1-4]: " cleanup_choice
    
    read -p "Are you sure you want to proceed? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo_info "Cleanup cancelled."
        return
    fi
    
    case $cleanup_choice in
        1)
            echo_info "Cleaning up AWS EKS..."
            cd "$(dirname "$0")/aws/scripts"
            ./deploy-eks.sh cleanup
            ;;
        2)
            echo_info "Cleaning up AWS ECS..."
            cd "$(dirname "$0")/aws/scripts"
            ./deploy-ecs.sh cleanup
            ;;
        3)
            echo_info "Cleaning up Azure AKS..."
            cd "$(dirname "$0")/azure/scripts"
            ./deploy-aks.sh cleanup
            ;;
        4)
            echo_info "Cleaning up Azure ACI..."
            cd "$(dirname "$0")/azure/scripts"
            ./deploy-aci.sh cleanup
            ;;
        *)
            echo_error "Invalid option"
            ;;
    esac
}

# Setup prerequisites
setup_prerequisites() {
    echo_header "🛠️  Setup Prerequisites"
    
    echo "Which cloud provider would you like to setup for?"
    echo "  1) AWS"
    echo "  2) Azure"
    echo "  3) Both"
    echo
    read -p "Choose option [1-3]: " setup_choice
    
    case $setup_choice in
        1|3)
            echo_step "Setting up AWS prerequisites..."
            
            # Install AWS CLI
            if ! command -v aws >/dev/null 2>&1; then
                echo_info "Installing AWS CLI..."
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # macOS
                    curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
                    sudo installer -pkg AWSCLIV2.pkg -target /
                    rm AWSCLIV2.pkg
                else
                    # Linux
                    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
                    unzip awscliv2.zip
                    sudo ./aws/install
                    rm -rf aws awscliv2.zip
                fi
            fi
            
            # Install eksctl
            if ! command -v eksctl >/dev/null 2>&1; then
                echo_info "Installing eksctl..."
                curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
                sudo mv /tmp/eksctl /usr/local/bin
            fi
            ;;
    esac
    
    case $setup_choice in
        2|3)
            echo_step "Setting up Azure prerequisites..."
            
            # Install Azure CLI
            if ! command -v az >/dev/null 2>&1; then
                echo_info "Installing Azure CLI..."
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # macOS
                    brew install azure-cli
                else
                    # Linux
                    curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
                fi
            fi
            ;;
    esac
    
    # Install kubectl
    if ! command -v kubectl >/dev/null 2>&1; then
        echo_info "Installing kubectl..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            brew install kubectl
        else
            # Linux
            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
            sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
            rm kubectl
        fi
    fi
    
    # Install Helm
    if ! command -v helm >/dev/null 2>&1; then
        echo_info "Installing Helm..."
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi
    
    echo_info "Prerequisites setup completed!"
    echo_warn "Please configure your cloud credentials:"
    echo "  AWS: Run 'aws configure'"
    echo "  Azure: Run 'az login'"
}

# Interactive mode
interactive_mode() {
    while true; do
        print_banner
        show_deployment_options
        
        read -p "Select an option [1-8]: " choice
        echo
        
        case $choice in
            1)
                deploy_aws_eks
                ;;
            2)
                deploy_aws_ecs
                ;;
            3)
                deploy_azure_aks
                ;;
            4)
                deploy_azure_aci
                ;;
            5)
                check_deployment_status
                ;;
            6)
                cleanup_resources
                ;;
            7)
                setup_prerequisites
                ;;
            8)
                echo_info "Goodbye! 👋"
                exit 0
                ;;
            *)
                echo_error "Invalid option. Please choose 1-8."
                ;;
        esac
        
        echo
        read -p "Press Enter to continue..."
        echo
    done
}

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        "aws-eks")
            deploy_aws_eks
            ;;
        "aws-ecs")
            deploy_aws_ecs
            ;;
        "azure-aks")
            deploy_azure_aks
            ;;
        "azure-aci")
            deploy_azure_aci
            ;;
        "status")
            check_deployment_status
            ;;
        "cleanup")
            cleanup_resources
            ;;
        "setup")
            setup_prerequisites
            ;;
        *)
            echo "Usage: $0 [aws-eks|aws-ecs|azure-aks|azure-aci|status|cleanup|setup]"
            echo
            echo "Commands:"
            echo "  aws-eks     Deploy to AWS EKS"
            echo "  aws-ecs     Deploy to AWS ECS"
            echo "  azure-aks   Deploy to Azure AKS"
            echo "  azure-aci   Deploy to Azure ACI"
            echo "  status      Check deployment status"
            echo "  cleanup     Remove cloud resources"
            echo "  setup       Install prerequisites"
            echo
            echo "Run without arguments for interactive mode."
            exit 1
            ;;
    esac
fi 