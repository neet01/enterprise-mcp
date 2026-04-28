import { requestJson } from '../shared/http.js';
import { logDebug, logError } from '../shared/logger.js';

export class JiraClient {
  constructor(config) {
    this.config = config;
  }

  async createIssue({ projectKey, issueType, summary, description, priority, dueDate, authorization }) {
    try {
      const response = await requestJson(`${this.apiBaseUrl()}/issue`, {
        method: 'POST',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_create_issue_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          projectKey,
          issueType,
        },
        body: {
          fields: {
            project: { key: projectKey },
            issuetype: typeof issueType === 'string' ? { name: issueType } : issueType,
            summary,
            ...(description ? { description } : {}),
            ...(priority ? { priority: typeof priority === 'string' ? { name: priority } : priority } : {}),
            ...(dueDate ? { duedate: dueDate } : {}),
          },
        },
      });

      assertJsonObject(response, 'jira_create_issue');
      return {
        key: response.key ?? null,
        id: response.id ?? null,
        url: response.self ?? null,
      };
    } catch (error) {
      logError('jira_create_issue_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        projectKey,
        issueType,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
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
    logDebug('jira_list_tickets_query_prepared', {
      assigneeMode: this.config.assigneeMode,
      hasDelegatedAuthorization: typeof authorization === 'string',
      projectKey: projectKey ?? null,
      openOnly,
      limit,
      userEmail: userContext.userEmail ?? null,
      jiraAccountId: userContext.jiraAccountId ?? null,
      jql: primaryJql,
    });
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
      logDebug('jira_list_tickets_query_completed', {
        jql: primaryJql,
        fallbackApplied: false,
        total: primaryResult.total,
      });
      return {
        ...primaryResult,
        jql: primaryJql,
        fallbackApplied: false,
      };
    }

    const fallbackJql = buildTicketJql(fallbackAssigneeClause, projectKey, openOnly);
    logDebug('jira_list_tickets_fallback_prepared', {
      primaryJql,
      fallbackJql,
      primaryTotal: primaryResult.total,
    });
    const fallbackResult = await this.searchIssues({
      jql: fallbackJql,
      authorization,
      limit,
      fields,
    });

    logDebug('jira_list_tickets_query_completed', {
      jql: fallbackJql,
      fallbackApplied: true,
      total: fallbackResult.total,
    });

    return {
      ...fallbackResult,
      jql: fallbackJql,
      fallbackApplied: true,
      attemptedJql: [primaryJql, fallbackJql],
    };
  }

  async searchIssues({ jql, authorization, limit = 20, fields }) {
    try {
      const query = new URLSearchParams({
        jql,
        maxResults: String(limit),
      });

      if (fields?.length) {
        query.set('fields', fields.join(','));
      }

      const response = await requestJson(`${this.apiBaseUrl()}/search?${query}`, {
        method: 'GET',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_search_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          jql,
          fields,
          limit,
        },
      });

      assertJsonObject(response, 'jira_search_issues');

      return {
        total: response.total ?? 0,
        issues: (response.issues ?? []).map(normalizeIssue),
      };
    } catch (error) {
      logError('jira_search_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        jql,
        limit,
        fields,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async getIssue(issueKey, authorization) {
    try {
      const response = await this.fetchIssue(issueKey, authorization);

      return normalizeIssue(response);
    } catch (error) {
      logError('jira_get_issue_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async getIssueHistory(issueKey, authorization, maxEvents = 20) {
    const response = await this.fetchIssue(issueKey, authorization, {
      fields: [
        'summary',
        'status',
        'priority',
        'assignee',
        'reporter',
        'updated',
        'created',
        'duedate',
        'comment',
      ],
      expand: ['changelog'],
      logLabel: 'jira_get_issue_history_request',
    });

    const issue = normalizeIssue(response);
    const timeline = buildIssueTimeline(response).slice(0, maxEvents);

    return {
      issue,
      summary: {
        issueKey: issue.key,
        totalComments: response.fields?.comment?.total ?? (response.fields?.comment?.comments?.length ?? 0),
        totalHistoryEvents: response.changelog?.total ?? (response.changelog?.histories?.length ?? 0),
        currentStatus: issue.status,
        currentPriority: issue.priority,
        currentAssignee: issue.assignee,
        dueDate: issue.dueDate,
        lastUpdated: issue.updated,
      },
      timeline,
    };
  }

  async findSimilarIssues(issueKey, authorization, limit = 10) {
    const response = await this.fetchIssue(issueKey, authorization, {
      fields: ['summary', 'project', 'issuetype', 'priority', 'status', 'assignee', 'reporter', 'updated', 'created'],
      logLabel: 'jira_find_similar_source_issue_request',
    });

    const sourceIssue = normalizeIssue(response);
    const projectKey = response.fields?.project?.key ?? null;
    const searchTerms = extractSearchTerms(response.fields?.summary ?? '');
    const jql = buildSimilarIssuesJql(issueKey, projectKey, searchTerms);
    const result = await this.searchIssues({
      jql,
      authorization,
      limit,
      fields: [
        'summary',
        'status',
        'priority',
        'assignee',
        'reporter',
        'issuetype',
        'updated',
        'created',
      ],
    });

    return {
      sourceIssue,
      generatedJql: jql,
      searchTerms,
      total: result.total,
      issues: result.issues,
    };
  }

  async addComment(issueKey, body, authorization) {
    try {
      const response = await requestJson(
        `${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}/comment`,
        {
          method: 'POST',
          headers: this.authHeaders(authorization),
          timeoutMs: this.config.timeoutMs,
          debug: this.config.debugLogging,
          logLabel: 'jira_add_comment_request',
          logMeta: {
            authMode: this.resolveAuthMode(authorization),
            issueKey,
          },
          body: { body },
        },
      );

      assertJsonObject(response, 'jira_add_comment');
      return normalizeComment(response);
    } catch (error) {
      logError('jira_add_comment_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async getTransitions(issueKey, authorization) {
    try {
      const response = await requestJson(
        `${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}/transitions`,
        {
          method: 'GET',
          headers: this.authHeaders(authorization),
          timeoutMs: this.config.timeoutMs,
          debug: this.config.debugLogging,
          logLabel: 'jira_get_transitions_request',
          logMeta: {
            authMode: this.resolveAuthMode(authorization),
            issueKey,
          },
        },
      );

      assertJsonObject(response, 'jira_get_transitions');
      return (response.transitions ?? []).map(normalizeTransition);
    } catch (error) {
      logError('jira_get_transitions_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async transitionIssue(issueKey, transition, authorization) {
    try {
      await requestJson(`${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}/transitions`, {
        method: 'POST',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_transition_issue_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          issueKey,
          transition,
        },
        body: {
          transition: {
            ...(transition.id ? { id: transition.id } : {}),
            ...(transition.name ? { name: transition.name } : {}),
          },
        },
      });

      return {
        issueKey,
        appliedTransition: transition,
        success: true,
      };
    } catch (error) {
      logError('jira_transition_issue_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        transition,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async updateDueDate(issueKey, dueDate, authorization) {
    try {
      await requestJson(`${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_update_due_date_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          issueKey,
          dueDate,
        },
        body: {
          fields: {
            duedate: dueDate,
          },
        },
      });

      return {
        issueKey,
        dueDate,
        success: true,
      };
    } catch (error) {
      logError('jira_update_due_date_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        dueDate,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async assignIssue(issueKey, assignee, authorization) {
    try {
      await requestJson(`${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}/assignee`, {
        method: 'PUT',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_assign_issue_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          issueKey,
          assignee,
        },
        body: assignee,
      });

      return {
        issueKey,
        assignee,
        success: true,
      };
    } catch (error) {
      logError('jira_assign_issue_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        assignee,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
  }

  async updatePriority(issueKey, priority, authorization) {
    try {
      await requestJson(`${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}`, {
        method: 'PUT',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: 'jira_update_priority_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          issueKey,
          priority,
        },
        body: {
          fields: {
            priority: typeof priority === 'string' ? { name: priority } : priority,
          },
        },
      });

      return {
        issueKey,
        priority,
        success: true,
      };
    } catch (error) {
      logError('jira_update_priority_failed', error, {
        authMode: this.resolveAuthMode(authorization),
        issueKey,
        priority,
        status: error?.status ?? null,
        response: error?.response ?? null,
      });
      throw error;
    }
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

  resolveAuthMode(delegatedAuthorization) {
    if (delegatedAuthorization) {
      return 'delegated-bearer';
    }

    if (this.config.authMode === 'bearer') {
      return 'configured-bearer';
    }

    return 'configured-basic';
  }

  apiBaseUrl() {
    return `${this.config.baseUrl}/rest/api/${this.config.apiVersion ?? '2'}`;
  }

  async fetchIssue(issueKey, authorization, options = {}) {
    const query = new URLSearchParams();
    if (options.fields?.length) {
      query.set('fields', options.fields.join(','));
    }
    if (options.expand?.length) {
      query.set('expand', options.expand.join(','));
    }
    const suffix = query.toString() ? `?${query}` : '';
    const response = await requestJson(
      `${this.apiBaseUrl()}/issue/${encodeURIComponent(issueKey)}${suffix}`,
      {
        method: 'GET',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
        debug: this.config.debugLogging,
        logLabel: options.logLabel ?? 'jira_get_issue_request',
        logMeta: {
          authMode: this.resolveAuthMode(authorization),
          issueKey,
          fields: options.fields ?? null,
          expand: options.expand ?? null,
        },
      },
    );

    assertJsonObject(response, options.logLabel ?? 'jira_get_issue');
    return response;
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
    dueDate: issue.fields?.duedate ?? null,
    url: issue.self ?? null,
  };
}

function normalizeComment(comment) {
  return {
    id: comment.id ?? null,
    body: comment.body ?? null,
    author: comment.author?.displayName ?? null,
    created: comment.created ?? null,
    updated: comment.updated ?? null,
  };
}

function normalizeTransition(transition) {
  return {
    id: transition.id ?? null,
    name: transition.name ?? null,
    toStatus: transition.to?.name ?? null,
    toStatusCategory: transition.to?.statusCategory?.name ?? null,
  };
}

function buildIssueTimeline(issue) {
  const commentEvents = (issue.fields?.comment?.comments ?? []).map((comment) => ({
    type: 'comment',
    at: comment.updated ?? comment.created ?? null,
    actor: comment.author?.displayName ?? null,
    detail: summarizeText(comment.body),
  }));

  const historyEvents = (issue.changelog?.histories ?? []).flatMap((history) =>
    (history.items ?? [])
      .filter((item) =>
        ['status', 'assignee', 'priority', 'duedate'].includes((item.field ?? '').toLowerCase()),
      )
      .map((item) => ({
        type: `${String(item.field).toLowerCase()}_change`,
        at: history.created ?? null,
        actor: history.author?.displayName ?? null,
        detail: `${item.fromString ?? 'empty'} -> ${item.toString ?? 'empty'}`,
      })),
  );

  return [...commentEvents, ...historyEvents]
    .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
}

function summarizeText(value) {
  if (value == null) {
    return null;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function extractSearchTerms(summary) {
  const stopwords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'your',
    'have',
    'into',
    'issue',
    'jira',
  ]);

  return Array.from(
    new Set(
      String(summary)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 4 && !stopwords.has(term)),
    ),
  ).slice(0, 5);
}

function buildSimilarIssuesJql(issueKey, projectKey, searchTerms) {
  const clauses = [`key != "${escapeJql(issueKey)}"`];

  if (projectKey) {
    clauses.push(`project = "${escapeJql(projectKey)}"`);
  }

  if (searchTerms.length > 0) {
    clauses.push(
      `(${searchTerms
        .map((term) => `summary ~ "\"${escapeJql(term)}\""`)
        .join(' OR ')})`,
    );
  }

  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

function assertJsonObject(response, operation) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error(`${operation} returned a non-JSON response`);
  }
}

function escapeJql(value) {
  return String(value).replace(/"/g, '\\"');
}
