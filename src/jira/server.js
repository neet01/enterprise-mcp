import { createMcpHttpServer } from '../shared/mcpServerFactory.js';
import { getJiraConfig } from './config.js';
import { registerJiraTools } from './tools.js';

const config = getJiraConfig();

const app = createMcpHttpServer({
  serverName: 'enterprise-jira-mcp',
  serverVersion: '0.1.0',
  instructions:
    'Use direct Jira tools for deterministic retrieval and use Bedrock-backed Jira tools for prioritization and analysis.',
  registerTools: (server) => registerJiraTools(server, config),
  host: config.host,
  port: config.port,
  path: config.path,
});

await app.listen();

