# `mcp_ecs_service` Terraform Module

Reusable ECS/Fargate deployment module for an MCP service such as `jira-mcp` or `confluence-mcp`.

It creates:

- ECS task definition
- ECS service
- task and execution IAM roles
- CloudWatch log group
- service security group
- optional ALB target group
- optional ALB listener rule
- optional ECS autoscaling policies

## Important Runtime Note

The current container `Dockerfile` in this repo starts the service with:

```sh
node --env-file=.env src/${MCP_SERVICE}/server.js
```

That works locally because a `.env` file exists. In ECS, the service should rely on task-definition environment variables and secrets instead of a local `.env` file.

This module handles that by defaulting the container command to:

```sh
node src/<service_kind>/server.js
```

So the ECS deployment does not depend on a mounted `.env` file.

## ACM And HTTPS

This module does not create ACM certificates or ALB HTTPS listeners.

Pass ACM certs into whatever ALB or listener Terraform you already manage. The only values this module needs from that layer are:

- `alb_listener_arn`
- `alb_security_group_id`

If your HTTPS listener is already created, this module can just attach host-header listener rules and target groups to it.

Do not point the MCP host headers at the actual Atlassian applications. Keep them separate. For example:

- real Jira app: `jira.hermeus.com`
- real Confluence app: `confluence.hermeus.com`
- MCP front doors: `jira-mcp.hermeus.com` and `confluence-mcp.hermeus.com`

## Example

```hcl
module "jira_mcp" {
  source = "../../modules/mcp_ecs_service"

  name         = "jira-mcp-prod"
  service_kind = "jira"
  cluster_arn  = var.cluster_arn
  vpc_id       = var.vpc_id
  subnet_ids   = var.private_subnet_ids
  image        = var.jira_image

  alb_security_group_id = var.alb_security_group_id
  listener_arn          = var.alb_listener_arn
  listener_rule_priority = 100
  host_headers          = ["jira-mcp.example.internal"]

  environment = {
    AWS_REGION                  = var.aws_region
    JIRA_BASE_URL               = var.jira_base_url
    JIRA_REQUIRE_DELEGATED_AUTH = "true"
    JIRA_ASSIGNEE_MODE          = "email"
  }

  task_policy_statements = [
    {
      actions   = ["bedrock:InvokeAgent"]
      resources = ["*"]
    }
  ]
}
```
