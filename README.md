# Enterprise MCP Services

Standalone Model Context Protocol services for enterprise LibreChat integrations.

Current servers:

- `jira-mcp`: direct Jira REST tools plus Bedrock-agent-backed analysis tools
- `confluence-mcp`: direct retrieval/page tools plus optional Bedrock-agent-backed answer tools

## Design

The servers are intentionally separate from LibreChat so they can be deployed and scaled independently.

- Simple deterministic operations go straight to system APIs or retrieval backends.
- Multi-step or analytical operations go to Amazon Bedrock agents.
- Both servers expose a `streamable-http` MCP endpoint for LibreChat.
- For delegated Jira/Confluence access, LibreChat's MCP OAuth flow owns the user OAuth dance and forwards the resulting bearer token to these services on each MCP request.

## Local Run

1. Copy `.env.example` to `.env` and fill in the relevant settings.
2. Install dependencies with `npm install`.
3. Start a server:

```bash
npm run dev:jira
```

or

```bash
npm run dev:confluence
```

Health checks are exposed at `GET /health`.

## Docker

Build the Jira server:

```bash
npm run docker:build:jira
```

Build the Confluence server:

```bash
npm run docker:build:confluence
```

Or start both with:

```bash
docker compose up --build
```

## LibreChat Configuration

Example `librechat.yaml` snippet:

```yaml
mcpSettings:
  allowedDomains:
    - 'http://host.docker.internal:8091'
    - 'http://host.docker.internal:8092'

mcpServers:
  enterprise_jira:
    type: streamable-http
    url: http://host.docker.internal:8091/mcp

  enterprise_confluence:
    type: streamable-http
    url: http://host.docker.internal:8092/mcp
```

For delegated access, configure the server in LibreChat with `oauth` settings that point to your Jira or Confluence incoming-link OAuth provider. LibreChat will complete the OAuth flow, store the user token, and attach `Authorization: Bearer <token>` when connecting to the MCP server. The server then forwards that same bearer token to Jira or Confluence and does not store it locally.

## First Tool Set

`jira-mcp`
- `jira_list_my_tickets`
- `jira_get_issue`
- `jira_search_issues`
- `jira_prioritize_user_tickets`

`confluence-mcp`
- `confluence_search_pages`
- `confluence_get_page`
- `confluence_answer_question`
