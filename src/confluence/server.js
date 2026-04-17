import { createMcpHttpServer } from '../shared/mcpServerFactory.js';
import { getConfluenceConfig } from './config.js';
import { registerConfluenceTools } from './tools.js';

const config = getConfluenceConfig();

const app = createMcpHttpServer({
  serverName: 'enterprise-confluence-mcp',
  serverVersion: '0.1.0',
  instructions:
    'Use direct retrieval and Confluence API tools for fast access and Bedrock-backed Confluence tools for synthesized answers.',
  registerTools: (server) => registerConfluenceTools(server, config),
  host: config.host,
  port: config.port,
  path: config.path,
});

await app.listen();

