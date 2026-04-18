variable "aws_region" {
  description = "AWS region, for example us-gov-west-1."
  type        = string
  default     = "us-gov-west-1"
}

variable "environment" {
  description = "Environment name, for example production."
  type        = string
  default     = "production"
}

variable "name_prefix" {
  description = "Name prefix applied to ECS resources."
  type        = string
  default     = "enterprise"
}

variable "cluster_arn" {
  description = "ECS cluster ARN where the MCP services should run."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for the ECS services."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ECS services."
  type        = list(string)
}

variable "alb_subnet_ids" {
  description = "Subnets where the MCP ALB should be created."
  type        = list(string)
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the MCP ALB HTTPS listener."
  type        = string
}

variable "alb_internal" {
  description = "Whether the MCP ALB should be internal."
  type        = bool
  default     = false
}

variable "alb_ingress_cidr_blocks" {
  description = "CIDR blocks allowed to reach the MCP ALB over HTTPS."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alb_name" {
  description = "Optional explicit ALB name. If empty, one is derived."
  type        = string
  default     = ""
}

variable "jira_listener_rule_priority" {
  description = "ALB listener rule priority for jira-mcp."
  type        = number
  default     = 100
}

variable "confluence_listener_rule_priority" {
  description = "ALB listener rule priority for confluence-mcp."
  type        = number
  default     = 110
}

variable "common_tags" {
  description = "Common tags applied to all resources."
  type        = map(string)
  default     = {}
}

variable "jira_image" {
  description = "ECR image URI for jira-mcp."
  type        = string
}

variable "confluence_image" {
  description = "ECR image URI for confluence-mcp."
  type        = string
}

variable "jira_base_url" {
  description = "Base URL for self-hosted Jira."
  type        = string
}

variable "jira_host_headers" {
  description = "Host headers that should route to jira-mcp."
  type        = list(string)
  default     = ["jira-mcp.hermeus.com"]
}

variable "jira_bedrock_agent_id" {
  description = "Optional Bedrock agent ID for Jira prioritization workflows."
  type        = string
  default     = ""
}

variable "jira_bedrock_agent_alias_id" {
  description = "Optional Bedrock agent alias ID for Jira prioritization workflows."
  type        = string
  default     = ""
}

variable "jira_secret_environment" {
  description = "Optional secret env vars for jira-mcp, such as fallback auth values."
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}

variable "confluence_api_base_url" {
  description = "Base URL for self-hosted Confluence API."
  type        = string
}

variable "confluence_host_headers" {
  description = "Host headers that should route to confluence-mcp."
  type        = list(string)
  default     = ["confluence-mcp.hermeus.com"]
}

variable "confluence_retrieval_base_url" {
  description = "Base URL for the Confluence retrieval service or RAG sidecar."
  type        = string
}

variable "confluence_bedrock_agent_id" {
  description = "Optional Bedrock agent ID for Confluence answer synthesis workflows."
  type        = string
  default     = ""
}

variable "confluence_bedrock_agent_alias_id" {
  description = "Optional Bedrock agent alias ID for Confluence answer synthesis workflows."
  type        = string
  default     = ""
}

variable "confluence_secret_environment" {
  description = "Optional secret env vars for confluence-mcp, such as fallback auth values."
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}
