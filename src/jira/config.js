export function getJiraConfig() {
  return {
    host: process.env.MCP_HOST ?? '0.0.0.0',
    port: Number(process.env.MCP_PORT ?? 8090),
    path: process.env.MCP_PATH ?? '/mcp',
    baseUrl: requiredEnv('JIRA_BASE_URL'),
    authMode: process.env.JIRA_AUTH_MODE ?? 'basic',
    basicEmail: process.env.JIRA_BASIC_EMAIL ?? '',
    basicToken: process.env.JIRA_BASIC_TOKEN ?? '',
    bearerToken: process.env.JIRA_BEARER_TOKEN ?? '',
    requireDelegatedAuth: parseBoolean(process.env.JIRA_REQUIRE_DELEGATED_AUTH, true),
    timeoutMs: Number(process.env.JIRA_TIMEOUT_MS ?? 15000),
    assigneeMode: process.env.JIRA_ASSIGNEE_MODE ?? 'email',
    awsRegion: process.env.AWS_REGION ?? '',
    bedrockAgentId: process.env.JIRA_BEDROCK_AGENT_ID ?? '',
    bedrockAgentAliasId: process.env.JIRA_BEDROCK_AGENT_ALIAS_ID ?? '',
  };
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}
