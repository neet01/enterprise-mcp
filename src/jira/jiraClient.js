import { requestJson } from '../shared/http.js';

export class JiraClient {
  constructor(config) {
    this.config = config;
  }

  async listTicketsForUser({
    userContext,
    authorization,
    limit = 20,
    projectKey,
    openOnly = true,
  }) {
    const fields = [
      'summary',
      'status',
      'priority',
      'assignee',
      'reporter',
      'issuetype',
      'updated',
      'created',
    ];
    const primaryAssigneeClause = resolveAssigneeClause(this.config.assigneeMode, userContext);
    const primaryJql = buildTicketJql(primaryAssigneeClause, projectKey, openOnly);
    const primaryResult = await this.searchIssues({
      jql: primaryJql,
      authorization,
      limit,
      fields,
    });

    const fallbackAssigneeClause = resolveFallbackAssigneeClause(
      this.config.assigneeMode,
      authorization,
      primaryAssigneeClause,
    );

    if (!fallbackAssigneeClause || primaryResult.total > 0) {
      return {
        ...primaryResult,
        jql: primaryJql,
        fallbackApplied: false,
      };
    }

    const fallbackJql = buildTicketJql(fallbackAssigneeClause, projectKey, openOnly);
    const fallbackResult = await this.searchIssues({
      jql: fallbackJql,
      authorization,
      limit,
      fields,
    });

    return {
      ...fallbackResult,
      jql: fallbackJql,
      fallbackApplied: true,
      attemptedJql: [primaryJql, fallbackJql],
    };
  }

  async searchIssues({ jql, authorization, limit = 20, fields }) {
    const response = await requestJson(`${this.config.baseUrl}/rest/api/3/search`, {
      method: 'POST',
      headers: this.authHeaders(authorization),
      timeoutMs: this.config.timeoutMs,
      body: {
        jql,
        maxResults: limit,
        fields,
      },
    });

    return {
      total: response.total ?? 0,
      issues: (response.issues ?? []).map(normalizeIssue),
    };
  }

  async getIssue(issueKey, authorization) {
    const response = await requestJson(
      `${this.config.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      {
        method: 'GET',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
      },
    );

    return normalizeIssue(response);
  }

  authHeaders(delegatedAuthorization) {
    if (delegatedAuthorization) {
      return {
        authorization: delegatedAuthorization,
        accept: 'application/json',
      };
    }

    if (this.config.authMode === 'bearer') {
      return {
        authorization: `Bearer ${this.config.bearerToken}`,
        accept: 'application/json',
      };
    }

    const basicValue = Buffer.from(
      `${this.config.basicEmail}:${this.config.basicToken}`,
      'utf8',
    ).toString('base64');

    return {
      authorization: `Basic ${basicValue}`,
      accept: 'application/json',
    };
  }
}

function buildTicketJql(assigneeClause, projectKey, openOnly) {
  const clauses = [assigneeClause];

  if (projectKey) {
    clauses.push(`project = "${escapeJql(projectKey)}"`);
  }

  if (openOnly) {
    clauses.push('statusCategory != Done');
  }

  return clauses.join(' AND ');
}

function resolveAssigneeClause(mode, userContext) {
  if (mode === 'currentUser') {
    return 'assignee = currentUser()';
  }

  if (mode === 'accountId') {
    if (!userContext.jiraAccountId) {
      throw new Error('jiraAccountId is required when JIRA_ASSIGNEE_MODE=accountId');
    }

    return `assignee = "${escapeJql(userContext.jiraAccountId)}"`;
  }

  if (mode === 'email') {
    if (!userContext.userEmail) {
      throw new Error('userEmail is required when JIRA_ASSIGNEE_MODE=email');
    }

    return `assignee = "${escapeJql(userContext.userEmail)}"`;
  }

  throw new Error(`Unsupported JIRA_ASSIGNEE_MODE: ${mode}`);
}

function resolveFallbackAssigneeClause(mode, authorization, primaryAssigneeClause) {
  if (!authorization || mode === 'currentUser') {
    return null;
  }

  const fallbackClause = 'assignee = currentUser()';
  return primaryAssigneeClause === fallbackClause ? null : fallbackClause;
}

function normalizeIssue(issue) {
  return {
    key: issue.key,
    id: issue.id,
    summary: issue.fields?.summary ?? null,
    status: issue.fields?.status?.name ?? null,
    priority: issue.fields?.priority?.name ?? null,
    issueType: issue.fields?.issuetype?.name ?? null,
    assignee: issue.fields?.assignee?.displayName ?? null,
    reporter: issue.fields?.reporter?.displayName ?? null,
    created: issue.fields?.created ?? null,
    updated: issue.fields?.updated ?? null,
    url: issue.self ?? null,
  };
}

function escapeJql(value) {
  return String(value).replace(/"/g, '\\"');
}
