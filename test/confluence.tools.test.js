import test from 'node:test';
import assert from 'node:assert/strict';
import { registerConfluenceTools } from '../src/confluence/tools.js';
import { withRequestContext } from '../src/shared/requestContext.js';

class FakeServer {
  constructor() {
    this.tools = new Map();
  }

  tool(name, _description, _schema, handler) {
    this.tools.set(name, handler);
  }
}

const baseConfig = {
  awsRegion: 'us-gov-west-1',
  bedrockAgentId: 'agent-id',
  bedrockAgentAliasId: 'alias-id',
  requireDelegatedAuth: true,
};

test('confluence_search_pages uses the direct retrieval client', async () => {
  const fakeServer = new FakeServer();

  registerConfluenceTools(fakeServer, baseConfig, {
    retrievalClient: {
      async search({ query }) {
        return {
          hits: [{ pageId: '123', title: `match for ${query}` }],
        };
      },
    },
    confluenceClient: {},
    agentClient: {},
  });

  const handler = fakeServer.tools.get('confluence_search_pages');
  const result = await handler({ query: 'launch checklist', limit: 4 });

  assert.equal(result.structuredContent.route, 'direct-retrieval');
  assert.equal(result.structuredContent.results.hits[0].pageId, '123');
});

test('confluence_answer_question uses retrieval plus the Bedrock agent client', async () => {
  const fakeServer = new FakeServer();

  registerConfluenceTools(fakeServer, baseConfig, {
    retrievalClient: {
      async search() {
        return {
          hits: [{ pageId: '123', title: 'Runbook' }],
        };
      },
    },
    confluenceClient: {},
    agentClient: {
      async invoke() {
        return {
          text: 'Use the runbook on page 123.',
          traces: [{ id: 1 }],
        };
      },
    },
  });

  const handler = fakeServer.tools.get('confluence_answer_question');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ question: 'Where is the runbook?' }),
  );

  assert.equal(result.structuredContent.route, 'bedrock-agent');
  assert.equal(result.structuredContent.authMode, 'delegated-bearer');
  assert.match(result.structuredContent.answer, /runbook/);
});

test('confluence_get_page forwards delegated bearer auth to the direct API client', async () => {
  const fakeServer = new FakeServer();

  registerConfluenceTools(fakeServer, baseConfig, {
    confluenceClient: {
      async getPage(pageId, authorization) {
        return { id: pageId, authorization };
      },
    },
    retrievalClient: {},
    agentClient: {},
  });

  const handler = fakeServer.tools.get('confluence_get_page');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ pageId: '12345' }),
  );

  assert.equal(result.structuredContent.route, 'direct-api');
  assert.equal(result.structuredContent.authMode, 'delegated-bearer');
  assert.equal(result.structuredContent.page.authorization, 'Bearer delegated-token');
});
