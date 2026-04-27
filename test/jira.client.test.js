import test from 'node:test';
import assert from 'node:assert/strict';
import { JiraClient } from '../src/jira/jiraClient.js';

class FakeJiraClient extends JiraClient {
  constructor(config, responses) {
    super(config);
    this.responses = responses;
    this.calls = [];
  }

  async searchIssues(params) {
    this.calls.push(params);
    return this.responses.shift();
  }
}

test('listTicketsForUser falls back to currentUser() for delegated auth when email query returns no issues', async () => {
  const client = new FakeJiraClient(
    {
      baseUrl: 'https://jira.example.com',
      assigneeMode: 'email',
      timeoutMs: 15000,
    },
    [
      { total: 0, issues: [] },
      { total: 1, issues: [{ key: 'ENG-42', fields: { summary: 'Fix it' } }] },
    ],
  );

  const result = await client.listTicketsForUser({
    userContext: { userEmail: 'user@example.com' },
    authorization: 'Bearer delegated-token',
    openOnly: true,
    limit: 10,
  });

  assert.equal(client.calls.length, 2);
  assert.match(client.calls[0].jql, /assignee = "user@example\.com"/);
  assert.match(client.calls[1].jql, /assignee = currentUser\(\)/);
  assert.equal(result.fallbackApplied, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.attemptedJql, [client.calls[0].jql, client.calls[1].jql]);
});

test('listTicketsForUser does not fall back to currentUser() without delegated auth', async () => {
  const client = new FakeJiraClient(
    {
      baseUrl: 'https://jira.example.com',
      assigneeMode: 'email',
      timeoutMs: 15000,
    },
    [{ total: 0, issues: [] }],
  );

  const result = await client.listTicketsForUser({
    userContext: { userEmail: 'user@example.com' },
    authorization: null,
    openOnly: true,
    limit: 10,
  });

  assert.equal(client.calls.length, 1);
  assert.equal(result.fallbackApplied, false);
});
