#!/bin/bash
# @fileoverview AWS EKS deployment with auto-scaling and load balancing
# @lastmodified 2025-07-28T00:59:55Z
# 
# Features: EKS cluster creation, ECR registry, ALB controller, Kustomize deployment
# Main APIs: create_eks_cluster(), build_and_push_image(), deploy_application()
# Constraints: Requires AWS CLI, eksctl, kubectl, helm, Docker
# Patterns: Resource existence checks, wait conditions, cleanup on failure

set -e

# Configuration
CLUSTER_NAME="ai-content-curator"
REGION="${AWS_REGION:-us-west-2}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${ECR_REGISTRY:-your-account.dkr.ecr.us-west-2.amazonaws.com}"

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
    
    command -v aws >/dev/null 2>&1 || { echo_error "aws CLI is required but not installed."; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { echo_error "kubectl is required but not installed."; exit 1; }
    command -v eksctl >/dev/null 2>&1 || { echo_error "eksctl is required but not installed."; exit 1; }
    command -v helm >/dev/null 2>&1 || { echo_error "helm is required but not installed."; exit 1; }
    
    # Check AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || { echo_error "AWS credentials not configured."; exit 1; }
    
    echo_info "Prerequisites check passed!"
}

# Create EKS cluster if it doesn't exist
create_eks_cluster() {
    echo_info "Checking if EKS cluster exists..."
    
    if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" >/dev/null 2>&1; then
        echo_info "EKS cluster '$CLUSTER_NAME' already exists"
    else
        echo_info "Creating EKS cluster '$CLUSTER_NAME'..."
        
        eksctl create cluster \
            --name="$CLUSTER_NAME" \
            --region="$REGION" \
            --version=1.28 \
            --nodegroup-name=standard-workers \
            --node-type=t3.medium \
            --nodes=3 \
            --nodes-min=2 \
            --nodes-max=5 \
            --ssh-access \
            --ssh-public-key=~/.ssh/id_rsa.pub \
            --managed \
            --asg-access \
            --external-dns-access \
            --full-ecr-access \
            --appmesh-access \
            --alb-ingress-access
            
        echo_info "EKS cluster created successfully!"
    fi
}

# Configure kubectl context
configure_kubectl() {
    echo_info "Configuring kubectl context..."
    aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER_NAME"
    kubectl config current-context
}

# Install AWS Load Balancer Controller
install_aws_load_balancer_controller() {
    echo_info "Installing AWS Load Balancer Controller..."
    
    # Create IAM OIDC provider
    eksctl utils associate-iam-oidc-provider --region="$REGION" --cluster="$CLUSTER_NAME" --approve
    
    # Create IAM service account for AWS Load Balancer Controller
    eksctl create iamserviceaccount \
        --cluster="$CLUSTER_NAME" \
        --namespace=kube-system \
        --name=aws-load-balancer-controller \
        --role-name="AmazonEKSLoadBalancerControllerRole" \
        --attach-policy-arn=arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess \
        --approve \
        --region="$REGION"
    
    # Install AWS Load Balancer Controller using Helm
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    
    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
        -n kube-system \
        --set clusterName="$CLUSTER_NAME" \
        --set serviceAccount.create=false \
        --set serviceAccount.name=aws-load-balancer-controller \
        --set region="$REGION" \
        --set vpcId=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$REGION" --query "cluster.resourcesVpcConfig.vpcId" --output text)
}

# Create ECR repository if it doesn't exist
create_ecr_repository() {
    echo_info "Creating ECR repository..."
    
    aws ecr describe-repositories --repository-names ai-content-curator --region "$REGION" >/dev/null 2>&1 || {
        aws ecr create-repository --repository-name ai-content-curator --region "$REGION"
        echo_info "ECR repository created"
    }
}

# Build and push Docker image
build_and_push_image() {
    echo_info "Building and pushing Docker image..."
    
    # Get ECR login token
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
    
    # Build and tag image
    docker build -t ai-content-curator:$IMAGE_TAG .
    docker tag ai-content-curator:$IMAGE_TAG "$REGISTRY/ai-content-curator:$IMAGE_TAG"
    
    # Push image
    docker push "$REGISTRY/ai-content-curator:$IMAGE_TAG"
    
    echo_info "Image pushed to $REGISTRY/ai-content-curator:$IMAGE_TAG"
}

# Deploy application using Kustomize
deploy_application() {
    echo_info "Deploying application to EKS..."
    
    # Create temporary kustomization for EKS deployment
    cat > kustomization-eks.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - k8s/overlays/$ENVIRONMENT

images:
  - name: ai-news-curator
    newName: $REGISTRY/ai-content-curator
    newTag: $IMAGE_TAG

patchesStrategicMerge:
  - deployment/aws/kubernetes/eks-patches.yaml

EOF

    # Apply the deployment
    kubectl apply -k . -f kustomization-eks.yaml
    
    # Wait for deployment to be ready
    kubectl wait --for=condition=available --timeout=300s deployment/ai-news-curator -n ai-news-curator-prod
    
    # Clean up temporary file
    rm kustomization-eks.yaml
    
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
    
    # Get Load Balancer URL if available
    LB_HOSTNAME=$(kubectl get ingress ai-news-curator-ingress -n ai-news-curator-prod -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "Not ready yet")
    if [ "$LB_HOSTNAME" != "Not ready yet" ]; then
        echo_info "Application URL: http://$LB_HOSTNAME"
    else
        echo_warn "Load balancer not ready yet. Check ingress status with: kubectl get ingress -n ai-news-curator-prod"
    fi
}

# Main deployment function
main() {
    echo_info "Starting AWS EKS deployment for AI Content Curator..."
    echo_info "Cluster: $CLUSTER_NAME"
    echo_info "Region: $REGION"
    echo_info "Environment: $ENVIRONMENT"
    echo_info "Image Tag: $IMAGE_TAG"
    
    check_prerequisites
    create_eks_cluster
    configure_kubectl
    install_aws_load_balancer_controller
    create_ecr_repository
    build_and_push_image
    deploy_application
    get_service_info
    
    echo_info "EKS deployment completed successfully! 🚀"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "cleanup")
        echo_info "Cleaning up EKS deployment..."
        kubectl delete -k k8s/overlays/$ENVIRONMENT || true
        eksctl delete cluster --name="$CLUSTER_NAME" --region="$REGION"
        echo_info "Cleanup completed!"
        ;;
    "status")
        configure_kubectl
        get_service_info
        ;;
    *)
        echo "Usage: $0 {deploy|cleanup|status}"
        echo "  deploy  - Deploy application to EKS (default)"
        echo "  cleanup - Remove EKS cluster and resources"
        echo "  status  - Show deployment status"
        exit 1
        ;;
esac 