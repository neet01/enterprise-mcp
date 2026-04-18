variable "name" {
  description = "Logical name for the ECS service and related resources."
  type        = string
}

variable "service_kind" {
  description = "MCP service type, typically jira or confluence."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster ARN."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for the ECS service."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the ECS service ENIs."
  type        = list(string)
}

variable "image" {
  description = "Container image URI."
  type        = string
}

variable "container_port" {
  description = "Container port exposed by the MCP server."
  type        = number
  default     = 8090
}

variable "mcp_path" {
  description = "MCP endpoint path."
  type        = string
  default     = "/mcp"
}

variable "health_check_path" {
  description = "HTTP health check path."
  type        = string
  default     = "/health"
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired ECS service task count."
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum task count for autoscaling."
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum task count for autoscaling."
  type        = number
  default     = 6
}

variable "enable_autoscaling" {
  description = "Whether to enable ECS service autoscaling."
  type        = bool
  default     = true
}

variable "cpu_target_utilization" {
  description = "Target CPU utilization percentage for ECS autoscaling."
  type        = number
  default     = 70
}

variable "memory_target_utilization" {
  description = "Target memory utilization percentage for ECS autoscaling."
  type        = number
  default     = 75
}

variable "environment" {
  description = "Plaintext environment variables for the container."
  type        = map(string)
  default     = {}
}

variable "secret_environment" {
  description = "Secret environment variables for ECS. value_from should be a full Secrets Manager or SSM ARN."
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}

variable "assign_public_ip" {
  description = "Whether the ECS task should receive a public IP."
  type        = bool
  default     = false
}

variable "enable_execute_command" {
  description = "Whether ECS Exec should be enabled."
  type        = bool
  default     = true
}

variable "container_command" {
  description = "Optional override command for the container."
  type        = list(string)
  default     = null
}

variable "task_policy_statements" {
  description = "Additional IAM statements for the task role."
  type = list(object({
    sid       = optional(string)
    effect    = optional(string, "Allow")
    actions   = list(string)
    resources = list(string)
  }))
  default = []
}

variable "task_managed_policy_arns" {
  description = "Managed IAM policies to attach to the task role."
  type        = list(string)
  default     = []
}

variable "execution_kms_key_arns" {
  description = "KMS key ARNs the execution role can decrypt when reading secrets."
  type        = list(string)
  default     = []
}

variable "enable_load_balancer" {
  description = "Whether to create an ALB target group and attach the ECS service to it."
  type        = bool
  default     = true
}

variable "alb_security_group_id" {
  description = "Security group ID of the ALB allowed to reach this ECS service."
  type        = string
  default     = null
}

variable "ingress_cidr_blocks" {
  description = "Additional CIDR blocks allowed to reach the ECS service port."
  type        = list(string)
  default     = []
}

variable "listener_arn" {
  description = "Optional ALB listener ARN for automatic listener rule creation."
  type        = string
  default     = null
}

variable "listener_rule_priority" {
  description = "Priority for the optional ALB listener rule."
  type        = number
  default     = null
}

variable "host_headers" {
  description = "Optional host header matches for the ALB listener rule."
  type        = list(string)
  default     = []
}

variable "path_patterns" {
  description = "Optional path pattern matches for the ALB listener rule."
  type        = list(string)
  default     = []
}

variable "target_group_deregistration_delay" {
  description = "ALB target group deregistration delay in seconds."
  type        = number
  default     = 30
}

variable "health_check_matcher" {
  description = "ALB health check matcher."
  type        = string
  default     = "200-399"
}

variable "health_check_interval" {
  description = "ALB health check interval in seconds."
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "ALB health check timeout in seconds."
  type        = number
  default     = 5
}

variable "healthy_threshold" {
  description = "ALB healthy threshold count."
  type        = number
  default     = 2
}

variable "unhealthy_threshold" {
  description = "ALB unhealthy threshold count."
  type        = number
  default     = 3
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "platform_version" {
  description = "ECS/Fargate platform version."
  type        = string
  default     = "LATEST"
}

variable "runtime_cpu_architecture" {
  description = "CPU architecture for the task runtime platform."
  type        = string
  default     = "X86_64"
}

variable "tags" {
  description = "Common tags for resources."
  type        = map(string)
  default     = {}
}
