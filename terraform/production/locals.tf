locals {
  tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = "enterprise-mcp-services"
    },
    var.common_tags,
  )

  jira_name       = "${var.name_prefix}-jira-mcp-${var.environment}"
  confluence_name = "${var.name_prefix}-confluence-mcp-${var.environment}"
  alb_name        = var.alb_name != "" ? var.alb_name : substr("${var.name_prefix}-mcp-${var.environment}", 0, 32)
  bedrock_policies = [
    {
      sid       = "InvokeBedrockAgents"
      actions   = ["bedrock:InvokeAgent"]
      resources = ["*"]
    }
  ]
}
