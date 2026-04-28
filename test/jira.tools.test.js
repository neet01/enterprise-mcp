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

test('jira_create_issue uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async createIssue({ projectKey, issueType, summary, authorization }) {
      return { key: 'ENG-99', projectKey, issueType, summary, authorization };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_create_issue');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ projectKey: 'ENG', issueType: 'Task', summary: 'Create test issue' }),
  );

  assert.equal(result.structuredContent.issue.key, 'ENG-99');
  assert.equal(result.structuredContent.issue.authorization, 'Bearer delegated-token');
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

test('jira_add_comment uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async addComment(issueKey, body, authorization) {
      return {
        id: '10001',
        body,
        issueKey,
        authorization,
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_add_comment');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', body: 'Please investigate.' }),
  );

  assert.equal(result.structuredContent.route, 'direct-api');
  assert.equal(result.structuredContent.comment.id, '10001');
  assert.equal(result.structuredContent.comment.authorization, 'Bearer delegated-token');
});

test('jira_update_comment uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async updateComment(issueKey, commentId, body, authorization) {
      return {
        id: commentId,
        body,
        issueKey,
        authorization,
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_update_comment');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', commentId: '10001', body: 'Updated comment.' }),
  );

  assert.equal(result.structuredContent.route, 'direct-api');
  assert.equal(result.structuredContent.comment.id, '10001');
  assert.equal(result.structuredContent.comment.authorization, 'Bearer delegated-token');
});

test('jira_delete_comment uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async deleteComment(issueKey, commentId) {
      return {
        issueKey,
        commentId,
        success: true,
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_delete_comment');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', commentId: '10001' }),
  );

  assert.equal(result.structuredContent.success, true);
  assert.equal(result.structuredContent.commentId, '10001');
});

test('jira_get_transitions uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async getTransitions() {
      return [{ id: '31', name: 'Done' }];
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_get_transitions');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1' }),
  );

  assert.equal(result.structuredContent.transitions.length, 1);
  assert.equal(result.structuredContent.transitions[0].name, 'Done');
});

test('jira_assign_issue uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async assignIssue(issueKey, assignee) {
      return { issueKey, assignee, success: true };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_assign_issue');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', name: 'helpdesk.user' }),
  );

  assert.equal(result.structuredContent.success, true);
  assert.equal(result.structuredContent.assignee.name, 'helpdesk.user');
});

test('jira_update_priority uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async updatePriority(issueKey, priority) {
      return { issueKey, priority, success: true };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_update_priority');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', priorityName: 'High' }),
  );

  assert.equal(result.structuredContent.success, true);
  assert.equal(result.structuredContent.priority.name, 'High');
});

test('jira_transition_issue uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async transitionIssue(issueKey, transition) {
      return { issueKey, appliedTransition: transition, success: true };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_transition_issue');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', transitionName: 'Done' }),
  );

  assert.equal(result.structuredContent.success, true);
  assert.equal(result.structuredContent.appliedTransition.name, 'Done');
});

test('jira_update_due_date uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async updateDueDate(issueKey, dueDate) {
      return { issueKey, dueDate, success: true };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_update_due_date');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', dueDate: '2026-05-01' }),
  );

  assert.equal(result.structuredContent.success, true);
  assert.equal(result.structuredContent.dueDate, '2026-05-01');
});

test('jira_summarize_issue_history uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async getIssueHistory() {
      return {
        issue: { key: 'ENG-1' },
        summary: { totalComments: 3 },
        timeline: [{ type: 'comment' }],
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_summarize_issue_history');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', maxEvents: 10 }),
  );

  assert.equal(result.structuredContent.summary.totalComments, 3);
  assert.equal(result.structuredContent.timeline.length, 1);
});

test('jira_find_similar_issues uses the direct Jira client', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async findSimilarIssues() {
      return {
        sourceIssue: { key: 'ENG-1' },
        generatedJql: 'project = "ENG"',
        searchTerms: ['network'],
        total: 1,
        issues: [{ key: 'ENG-2' }],
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_find_similar_issues');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ issueKey: 'ENG-1', limit: 5 }),
  );

  assert.equal(result.structuredContent.total, 1);
  assert.equal(result.structuredContent.issues[0].key, 'ENG-2');
});

test('jira_search_issues supports queue presets', async () => {
  const fakeServer = new FakeServer();
  const jiraClient = {
    async searchIssues({ jql }) {
      return {
        total: 1,
        issues: [{ key: 'ENG-10', jql }],
      };
    },
  };

  registerJiraTools(fakeServer, baseConfig, {
    jiraClient,
    agentClient: {},
  });

  const handler = fakeServer.tools.get('jira_search_issues');
  const result = await withRequestContext(
    { authorization: 'Bearer delegated-token' },
    () => handler({ preset: 'unassigned_open', projectKey: 'ENG', limit: 10 }),
  );

  assert.equal(result.structuredContent.preset, 'unassigned_open');
  assert.match(result.structuredContent.jql, /assignee is EMPTY/i);
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
