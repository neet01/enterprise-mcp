import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildRequestContext, withRequestContext } from './requestContext.js';
import { logError, logInfo } from './logger.js';

export function createMcpHttpServer({
  serverName,
  serverVersion,
  instructions,
  registerTools,
  port,
  host = '0.0.0.0',
  path = '/mcp',
}) {
  const sessions = new Map();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, serverName }));
      return;
    }

    if (url.pathname !== path) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const sessionIdHeader = headerValue(req.headers['mcp-session-id']);
    let transport = sessionIdHeader ? sessions.get(sessionIdHeader) : undefined;

    try {
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = new McpServer({
          name: serverName,
          version: serverVersion,
          instructions,
        });

        registerTools(server);
        await server.connect(transport);
      }

      const requestContext = buildRequestContext(req);

      await withRequestContext(requestContext, async () => {
        await transport.handleRequest(req, res);
      });

      if (transport.sessionId && !sessions.has(transport.sessionId)) {
        sessions.set(transport.sessionId, transport);
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
        };
      }
    } catch (error) {
      logError('mcp_request_failed', error, { serverName });

      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  return {
    async listen() {
      await new Promise((resolve) => httpServer.listen(port, host, resolve));
      logInfo('mcp_server_started', { serverName, host, port, path });
    },
    async close() {
      for (const transport of sessions.values()) {
        await transport.close().catch(() => undefined);
      }

      sessions.clear();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

