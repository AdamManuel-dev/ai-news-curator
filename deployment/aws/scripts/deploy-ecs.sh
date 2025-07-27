#!/bin/bash

# AI Content Curator - AWS ECS Deployment Script
# This script deploys the application to Amazon ECS using Fargate

set -e

# Configuration
CLUSTER_NAME="ai-content-curator"
SERVICE_NAME="ai-content-curator-service"
TASK_FAMILY="ai-content-curator-task"
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
    command -v docker >/dev/null 2>&1 || { echo_error "docker is required but not installed."; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo_error "jq is required but not installed."; exit 1; }
    
    # Check AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || { echo_error "AWS credentials not configured."; exit 1; }
    
    echo_info "Prerequisites check passed!"
}

# Create VPC and networking resources
create_vpc_resources() {
    echo_info "Creating VPC and networking resources..."
    
    # Check if VPC exists
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=ai-content-curator-vpc" \
        --query "Vpcs[0].VpcId" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "None")
    
    if [ "$VPC_ID" = "None" ] || [ "$VPC_ID" = "null" ]; then
        echo_info "Creating VPC..."
        
        # Create VPC
        VPC_ID=$(aws ec2 create-vpc \
            --cidr-block 10.0.0.0/16 \
            --query "Vpc.VpcId" \
            --output text \
            --region "$REGION")
        
        aws ec2 create-tags \
            --resources "$VPC_ID" \
            --tags Key=Name,Value=ai-content-curator-vpc \
            --region "$REGION"
        
        # Enable DNS hostnames
        aws ec2 modify-vpc-attribute \
            --vpc-id "$VPC_ID" \
            --enable-dns-hostnames \
            --region "$REGION"
        
        # Create Internet Gateway
        IGW_ID=$(aws ec2 create-internet-gateway \
            --query "InternetGateway.InternetGatewayId" \
            --output text \
            --region "$REGION")
        
        aws ec2 attach-internet-gateway \
            --vpc-id "$VPC_ID" \
            --internet-gateway-id "$IGW_ID" \
            --region "$REGION"
        
        # Create subnets
        SUBNET1_ID=$(aws ec2 create-subnet \
            --vpc-id "$VPC_ID" \
            --cidr-block 10.0.1.0/24 \
            --availability-zone "${REGION}a" \
            --query "Subnet.SubnetId" \
            --output text \
            --region "$REGION")
        
        SUBNET2_ID=$(aws ec2 create-subnet \
            --vpc-id "$VPC_ID" \
            --cidr-block 10.0.2.0/24 \
            --availability-zone "${REGION}b" \
            --query "Subnet.SubnetId" \
            --output text \
            --region "$REGION")
        
        # Create route table and routes
        ROUTE_TABLE_ID=$(aws ec2 create-route-table \
            --vpc-id "$VPC_ID" \
            --query "RouteTable.RouteTableId" \
            --output text \
            --region "$REGION")
        
        aws ec2 create-route \
            --route-table-id "$ROUTE_TABLE_ID" \
            --destination-cidr-block 0.0.0.0/0 \
            --gateway-id "$IGW_ID" \
            --region "$REGION"
        
        # Associate subnets with route table
        aws ec2 associate-route-table \
            --subnet-id "$SUBNET1_ID" \
            --route-table-id "$ROUTE_TABLE_ID" \
            --region "$REGION"
        
        aws ec2 associate-route-table \
            --subnet-id "$SUBNET2_ID" \
            --route-table-id "$ROUTE_TABLE_ID" \
            --region "$REGION"
        
        echo_info "VPC and networking resources created"
    else
        echo_info "Using existing VPC: $VPC_ID"
    fi
    
    # Get subnet IDs
    SUBNET_IDS=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=$VPC_ID" \
        --query "Subnets[].SubnetId" \
        --output text \
        --region "$REGION")
}

# Create security groups
create_security_groups() {
    echo_info "Creating security groups..."
    
    # Check if security group exists
    SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=ai-content-curator-sg" "Name=vpc-id,Values=$VPC_ID" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "None")
    
    if [ "$SG_ID" = "None" ] || [ "$SG_ID" = "null" ]; then
        echo_info "Creating security group..."
        
        SG_ID=$(aws ec2 create-security-group \
            --group-name ai-content-curator-sg \
            --description "Security group for AI Content Curator" \
            --vpc-id "$VPC_ID" \
            --query "GroupId" \
            --output text \
            --region "$REGION")
        
        # Allow HTTP traffic
        aws ec2 authorize-security-group-ingress \
            --group-id "$SG_ID" \
            --protocol tcp \
            --port 3000 \
            --cidr 0.0.0.0/0 \
            --region "$REGION"
        
        # Allow ALB traffic
        aws ec2 authorize-security-group-ingress \
            --group-id "$SG_ID" \
            --protocol tcp \
            --port 80 \
            --cidr 0.0.0.0/0 \
            --region "$REGION"
        
        aws ec2 authorize-security-group-ingress \
            --group-id "$SG_ID" \
            --protocol tcp \
            --port 443 \
            --cidr 0.0.0.0/0 \
            --region "$REGION"
        
        echo_info "Security group created: $SG_ID"
    else
        echo_info "Using existing security group: $SG_ID"
    fi
}

# Create ECS cluster
create_ecs_cluster() {
    echo_info "Creating ECS cluster..."
    
    # Check if cluster exists
    EXISTING_CLUSTER=$(aws ecs describe-clusters \
        --clusters "$CLUSTER_NAME" \
        --query "clusters[0].status" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "INACTIVE")
    
    if [ "$EXISTING_CLUSTER" != "ACTIVE" ]; then
        aws ecs create-cluster \
            --cluster-name "$CLUSTER_NAME" \
            --capacity-providers FARGATE \
            --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
            --region "$REGION"
        
        echo_info "ECS cluster created: $CLUSTER_NAME"
    else
        echo_info "ECS cluster already exists: $CLUSTER_NAME"
    fi
}

# Create ECR repository
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

# Create IAM roles
create_iam_roles() {
    echo_info "Creating IAM roles..."
    
    # Task execution role
    EXECUTION_ROLE_ARN=$(aws iam get-role --role-name ecsTaskExecutionRole --query "Role.Arn" --output text 2>/dev/null || echo "None")
    
    if [ "$EXECUTION_ROLE_ARN" = "None" ]; then
        # Create execution role
        cat > task-execution-assume-role-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
        
        aws iam create-role \
            --role-name ecsTaskExecutionRole \
            --assume-role-policy-document file://task-execution-assume-role-policy.json \
            --region "$REGION"
        
        aws iam attach-role-policy \
            --role-name ecsTaskExecutionRole \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
            --region "$REGION"
        
        EXECUTION_ROLE_ARN=$(aws iam get-role --role-name ecsTaskExecutionRole --query "Role.Arn" --output text)
        
        rm task-execution-assume-role-policy.json
        echo_info "Task execution role created"
    else
        echo_info "Using existing task execution role"
    fi
}

# Create task definition
create_task_definition() {
    echo_info "Creating ECS task definition..."
    
    cat > task-definition.json << EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "ai-content-curator",
      "image": "$REGISTRY/ai-content-curator:$IMAGE_TAG",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {"name": "NODE_ENV", "value": "$ENVIRONMENT"},
        {"name": "PORT", "value": "3000"},
        {"name": "AWS_REGION", "value": "$REGION"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-content-curator",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF
    
    # Create log group
    aws logs create-log-group \
        --log-group-name /ecs/ai-content-curator \
        --region "$REGION" 2>/dev/null || true
    
    # Register task definition
    aws ecs register-task-definition \
        --cli-input-json file://task-definition.json \
        --region "$REGION"
    
    rm task-definition.json
    echo_info "Task definition created"
}

# Create Application Load Balancer
create_load_balancer() {
    echo_info "Creating Application Load Balancer..."
    
    # Check if ALB exists
    ALB_ARN=$(aws elbv2 describe-load-balancers \
        --names "ai-content-curator-alb" \
        --query "LoadBalancers[0].LoadBalancerArn" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "None")
    
    if [ "$ALB_ARN" = "None" ] || [ "$ALB_ARN" = "null" ]; then
        # Create ALB
        ALB_ARN=$(aws elbv2 create-load-balancer \
            --name ai-content-curator-alb \
            --subnets $SUBNET_IDS \
            --security-groups "$SG_ID" \
            --scheme internet-facing \
            --type application \
            --ip-address-type ipv4 \
            --query "LoadBalancers[0].LoadBalancerArn" \
            --output text \
            --region "$REGION")
        
        # Create target group
        TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
            --name ai-content-curator-tg \
            --protocol HTTP \
            --port 3000 \
            --vpc-id "$VPC_ID" \
            --target-type ip \
            --health-check-path /health \
            --health-check-interval-seconds 30 \
            --health-check-timeout-seconds 5 \
            --healthy-threshold-count 2 \
            --unhealthy-threshold-count 3 \
            --query "TargetGroups[0].TargetGroupArn" \
            --output text \
            --region "$REGION")
        
        # Create listener
        aws elbv2 create-listener \
            --load-balancer-arn "$ALB_ARN" \
            --protocol HTTP \
            --port 80 \
            --default-actions Type=forward,TargetGroupArn="$TARGET_GROUP_ARN" \
            --region "$REGION"
        
        echo_info "ALB created: $ALB_ARN"
    else
        echo_info "Using existing ALB: $ALB_ARN"
        TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups \
            --names "ai-content-curator-tg" \
            --query "TargetGroups[0].TargetGroupArn" \
            --output text \
            --region "$REGION")
    fi
}

# Create ECS service
create_ecs_service() {
    echo_info "Creating ECS service..."
    
    # Check if service exists
    EXISTING_SERVICE=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --query "services[0].status" \
        --output text \
        --region "$REGION" 2>/dev/null || echo "INACTIVE")
    
    if [ "$EXISTING_SERVICE" != "ACTIVE" ]; then
        aws ecs create-service \
            --cluster "$CLUSTER_NAME" \
            --service-name "$SERVICE_NAME" \
            --task-definition "$TASK_FAMILY" \
            --desired-count 2 \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
            --load-balancers "targetGroupArn=$TARGET_GROUP_ARN,containerName=ai-content-curator,containerPort=3000" \
            --region "$REGION"
        
        echo_info "ECS service created: $SERVICE_NAME"
    else
        echo_info "Updating existing ECS service..."
        aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --task-definition "$TASK_FAMILY" \
            --region "$REGION"
    fi
}

# Get service information
get_service_info() {
    echo_info "Getting service information..."
    
    # Wait for service to be stable
    echo_info "Waiting for service to be stable..."
    aws ecs wait services-stable \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$REGION"
    
    # Get ALB DNS name
    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --names "ai-content-curator-alb" \
        --query "LoadBalancers[0].DNSName" \
        --output text \
        --region "$REGION")
    
    echo_info "Service deployed successfully!"
    echo_info "Application URL: http://$ALB_DNS"
    echo_info "Health check: http://$ALB_DNS/health"
    
    # Service status
    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --query "services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount}" \
        --output table \
        --region "$REGION"
}

# Main deployment function
main() {
    echo_info "Starting AWS ECS deployment for AI Content Curator..."
    echo_info "Cluster: $CLUSTER_NAME"
    echo_info "Region: $REGION"
    echo_info "Environment: $ENVIRONMENT"
    echo_info "Image Tag: $IMAGE_TAG"
    
    check_prerequisites
    create_vpc_resources
    create_security_groups
    create_ecs_cluster
    create_ecr_repository
    build_and_push_image
    create_iam_roles
    create_task_definition
    create_load_balancer
    create_ecs_service
    get_service_info
    
    echo_info "ECS deployment completed successfully! 🚀"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "cleanup")
        echo_info "Cleaning up ECS deployment..."
        aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --desired-count 0 --region "$REGION" 2>/dev/null || true
        aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$REGION" 2>/dev/null || true
        aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --force --region "$REGION" 2>/dev/null || true
        aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$REGION" 2>/dev/null || true
        echo_info "Cleanup completed!"
        ;;
    "status")
        get_service_info
        ;;
    *)
        echo "Usage: $0 {deploy|cleanup|status}"
        echo "  deploy  - Deploy application to ECS (default)"
        echo "  cleanup - Remove ECS service and cluster"
        echo "  status  - Show deployment status"
        exit 1
        ;;
esac 