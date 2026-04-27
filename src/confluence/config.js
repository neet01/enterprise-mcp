export function getConfluenceConfig() {
  return {
    host: process.env.MCP_HOST ?? '0.0.0.0',
    port: Number(process.env.MCP_PORT ?? 8090),
    path: process.env.MCP_PATH ?? '/mcp',
    apiBaseUrl: requiredEnv('CONFLUENCE_API_BASE_URL'),
    retrievalBaseUrl: optionalEnv('CONFLUENCE_RETRIEVAL_BASE_URL'),
    knowledgeBaseId: optionalEnv('CONFLUENCE_KNOWLEDGE_BASE_ID'),
    knowledgeBaseSearchType: parseSearchType(
      optionalEnv('CONFLUENCE_KNOWLEDGE_BASE_SEARCH_TYPE'),
    ),
    authMode: process.env.CONFLUENCE_AUTH_MODE ?? 'basic',
    basicEmail: process.env.CONFLUENCE_BASIC_EMAIL ?? '',
    basicToken: process.env.CONFLUENCE_BASIC_TOKEN ?? '',
    bearerToken: process.env.CONFLUENCE_BEARER_TOKEN ?? '',
    requireDelegatedAuth: parseBoolean(process.env.CONFLUENCE_REQUIRE_DELEGATED_AUTH, true),
    timeoutMs: Number(process.env.CONFLUENCE_TIMEOUT_MS ?? 15000),
    awsRegion: process.env.AWS_REGION ?? '',
    bedrockAgentId: process.env.CONFLUENCE_BEDROCK_AGENT_ID ?? '',
    bedrockAgentAliasId: process.env.CONFLUENCE_BEDROCK_AGENT_ALIAS_ID ?? '',
  };
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? value : '';
}

function parseBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function parseSearchType(value) {
  if (!value) {
    return '';
  }

  const normalized = value.toUpperCase();

  if (normalized !== 'HYBRID' && normalized !== 'SEMANTIC') {
    throw new Error(
      'CONFLUENCE_KNOWLEDGE_BASE_SEARCH_TYPE must be HYBRID or SEMANTIC when set',
    );
  }

  return normalized;
}
