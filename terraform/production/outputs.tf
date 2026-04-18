output "mcp_alb_arn" {
  value       = aws_lb.mcp.arn
  description = "ARN of the shared MCP ALB."
}

output "mcp_alb_dns_name" {
  value       = aws_lb.mcp.dns_name
  description = "DNS name of the shared MCP ALB."
}

output "mcp_https_listener_arn" {
  value       = aws_lb_listener.https.arn
  description = "HTTPS listener ARN for the shared MCP ALB."
}

output "jira_mcp_service_name" {
  value       = module.jira_mcp.service_name
  description = "ECS service name for jira-mcp."
}

output "jira_mcp_target_group_arn" {
  value       = module.jira_mcp.target_group_arn
  description = "ALB target group ARN for jira-mcp."
}

output "confluence_mcp_service_name" {
  value       = module.confluence_mcp.service_name
  description = "ECS service name for confluence-mcp."
}

output "confluence_mcp_target_group_arn" {
  value       = module.confluence_mcp.target_group_arn
  description = "ALB target group ARN for confluence-mcp."
}
