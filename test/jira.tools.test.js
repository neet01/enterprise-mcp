import test from 'node:test';
import assert from 'node:assert/strict';
import { registerJiraTools } from '../src/jira/tools.js';
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
  assigneeMode: 'email',
  awsRegion: 'us-gov-west-1',
  bedrockAgentId: 'agent-id',
  bedrockAgentAliasId: 'alias-id',
  requireDelegatedAuth: true,
};

test('jira_list_my_tickets uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async listTicketsForUser({ userContext, limit, authorization }) {
      return {
        total: 1,
        issues: [{ key: 'ENG-1', owner: userContext.userEmail, limit, authorization }],
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_list_my_tickets');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ userEmail: 'user@example.com', limit: 5, openOnly: true }),
  );

  assert.equal(result.structuredContent.route, 'direct-api');
  assert.equal(result.structuredContent.authMode, 'delegated-bearer');
  assert.equal(result.structuredContent.total, 1);
  assert.equal(result.structuredContent.issues[0].key, 'ENG-1');
  assert.equal(result.structuredContent.issues[0].authorization, 'Bearer delegated-token');
});

test('jira_prioritize_user_tickets uses Jira plus the Bedrock agent client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async listTicketsForUser() {
      return {
        total: 2,
        issues: [{ key: 'ENG-1' }, { key: 'ENG-2' }],
      };
    },
  };

  const agentClient = {
    async invoke({ sessionId }) {
      return {
        text: `priority analysis for ${sessionId}`,
        traces: [{ id: 1 }],
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient,
  });

  const handler = fakeServer.tools.get('jira_prioritize_user_tickets');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ userEmail: 'user@example.com', limit: 2 }),
  );

  assert.equal(result.structuredContent.route, 'bedrock-agent');
  assert.equal(result.structuredContent.authMode, 'delegated-bearer');
  assert.equal(result.structuredContent.total, 2);
  assert.match(result.structuredContent.analysis, /priority analysis/);
});

test('jira tools fail when delegated auth is required but missing', async () => {
  const fakeServer = new FakeServer();

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient: {
      async listTicketsForUser() {
        throw new Error('should not be called');
      },
    },
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_list_my_tickets');

  await assert.rejects(
    () => handler({ userEmail: 'user@example.com', limit: 5, openOnly: true }),
    /delegated bearer token/i,
  );
});
