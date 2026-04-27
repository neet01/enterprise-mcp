module "jira_mcp" {
  source = "../modules/mcp_ecs_service"

  name         = local.jira_name
  service_kind = "jira"
  cluster_arn  = var.cluster_arn
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids
  image        = var.jira_image

  alb_security_group_id = aws_security_group.mcp_alb.id
  listener_arn          = aws_lb_listener.https.arn
  listener_rule_priority = var.jira_listener_rule_priority
  host_headers          = var.jira_host_headers

  environment = {
    AWS_REGION                  = var.aws_region
    JIRA_BASE_URL               = var.jira_base_url
    JIRA_AUTH_MODE              = "basic"
    JIRA_REQUIRE_DELEGATED_AUTH = "true"
    JIRA_TIMEOUT_MS             = "15000"
    JIRA_ASSIGNEE_MODE          = "email"
    JIRA_BEDROCK_AGENT_ID       = var.jira_bedrock_agent_id
    JIRA_BEDROCK_AGENT_ALIAS_ID = var.jira_bedrock_agent_alias_id
  }

  secret_environment    = var.jira_secret_environment
  task_policy_statements = local.bedrock_policies
  tags                  = local.tags
}

module "confluence_mcp" {
  source = "../modules/mcp_ecs_service"

  name         = local.confluence_name
  service_kind = "confluence"
  cluster_arn  = var.cluster_arn
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids
  image        = var.confluence_image

  alb_security_group_id = aws_security_group.mcp_alb.id
  listener_arn          = aws_lb_listener.https.arn
  listener_rule_priority = var.confluence_listener_rule_priority
  host_headers          = var.confluence_host_headers

  environment = {
    AWS_REGION                       = var.aws_region
    CONFLUENCE_API_BASE_URL          = var.confluence_api_base_url
    CONFLUENCE_RETRIEVAL_BASE_URL    = var.confluence_retrieval_base_url
    CONFLUENCE_KNOWLEDGE_BASE_ID     = var.confluence_knowledge_base_id
    CONFLUENCE_KNOWLEDGE_BASE_SEARCH_TYPE = var.confluence_knowledge_base_search_type
    CONFLUENCE_AUTH_MODE             = "basic"
    CONFLUENCE_REQUIRE_DELEGATED_AUTH = "true"
    CONFLUENCE_TIMEOUT_MS            = "15000"
    CONFLUENCE_BEDROCK_AGENT_ID      = var.confluence_bedrock_agent_id
    CONFLUENCE_BEDROCK_AGENT_ALIAS_ID = var.confluence_bedrock_agent_alias_id
  }

  secret_environment    = var.confluence_secret_environment
  task_policy_statements = local.bedrock_policies
  tags                  = local.tags
}
