resource "aws_security_group" "mcp_alb" {
  name        = "${local.alb_name}-sg"
  description = "Security group for the MCP ALB"
  vpc_id      = var.vpc_id
  tags        = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "mcp_alb_https" {
  for_each          = toset(var.alb_ingress_cidr_blocks)
  security_group_id = aws_security_group.mcp_alb.id
  description       = "Allow HTTPS to MCP ALB"
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "mcp_alb_all" {
  security_group_id = aws_security_group.mcp_alb.id
  description       = "Allow all outbound from MCP ALB"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_lb" "mcp" {
  name               = local.alb_name
  internal           = var.alb_internal
  load_balancer_type = "application"
  security_groups    = [aws_security_group.mcp_alb.id]
  subnets            = var.alb_subnet_ids

  enable_deletion_protection = false
  idle_timeout               = 60

  tags = local.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.mcp.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }

  tags = local.tags
}
