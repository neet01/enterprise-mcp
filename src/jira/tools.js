import { z } from 'zod';
import { BedrockAgentClient } from '../shared/bedrockAgentClient.js';
import { requireDelegatedAuthHeader, getDelegatedAuthHeader } from '../shared/delegatedAuth.js';
import { resolveUserContext, buildSessionId } from '../shared/identity.js';
import { logDebug, logError } from '../shared/logger.js';
import { toolResponse } from '../shared/toolResponse.js';
import { JiraClient } from './jiraClient.js';

export function createJiraServices(config, overrides = {}) {
  return {
    jiraClient: overrides.jiraClient ?? new JiraClient(config),
    agentClient:
      overrides.agentClient ??
      new BedrockAgentClient({
        region: config.awsRegion,
        agentId: config.bedrockAgentId,
        agentAliasId: config.bedrockAgentAliasId,
      }),
  };
}

export function registerJiraTools(server, config, services = createJiraServices(config)) {
  server.tool(
    'jira_create_issue',
    'Create a Jira issue directly through the Jira API.',
    {
      projectKey: z.string().min(1),
      issueType: z.string().min(1),
      summary: z.string().min(1).max(500),
      description: z.string().optional(),
      priority: z.string().optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
    async ({ projectKey, issueType, summary, description, priority, dueDate }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation(
        'jira_create_issue',
        { projectKey, issueType, summaryLength: summary.length, hasDescription: Boolean(description), priority, dueDate },
        null,
        authorization,
      );
      const issue = await services.jiraClient.createIssue({
        projectKey,
        issueType,
        summary,
        description,
        priority,
        dueDate,
        authorization,
      });
      logDebug('jira_tool_completed', {
        tool: 'jira_create_issue',
        projectKey,
        issueKey: issue.key,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        issue,
      });
    },
  );

  server.tool(
    'jira_list_my_tickets',
    'List Jira tickets assigned to the current user using the direct Jira API path.',
    {
      userEmail: z.string().email().optional(),
      jiraAccountId: z.string().optional(),
      entraObjectId: z.string().optional(),
      projectKey: z.string().optional(),
      openOnly: z.boolean().default(true),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async (args) => {
      const userContext = resolveUserContext(args);
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_list_my_tickets', args, userContext, authorization);
      const result = await services.jiraClient.listTicketsForUser({
        userContext,
        authorization,
        projectKey: args.projectKey,
        openOnly: args.openOnly,
        limit: args.limit,
      });
      logDebug('jira_tool_completed', {
        tool: 'jira_list_my_tickets',
        total: result.total,
        fallbackApplied: result.fallbackApplied ?? false,
        jql: result.jql ?? null,
        attemptedJql: result.attemptedJql ?? null,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        userContext,
        ...result,
      });
    },
  );

  server.tool(
    'jira_get_issue',
    'Fetch a single Jira issue directly from the Jira API.',
    {
      issueKey: z.string().min(2),
    },
    async ({ issueKey }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_get_issue', { issueKey }, null, authorization);
      const issue = await services.jiraClient.getIssue(issueKey, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_get_issue',
        issueKey,
        found: Boolean(issue?.key),
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        issue,
      });
    },
  );

  server.tool(
    'jira_search_issues',
    'Run a direct Jira JQL search for deterministic issue retrieval.',
    {
      jql: z.string().min(3).optional(),
      preset: z
        .enum([
          'my_open',
          'unassigned_open',
          'high_priority_open',
          'overdue',
          'recently_updated',
          'project_backlog',
        ])
        .optional(),
      projectKey: z.string().optional(),
      days: z.number().int().min(1).max(90).default(7),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ jql, preset, projectKey, days, limit }) => {
      const effectiveJql = jql ?? buildQueuePresetJql({ preset, projectKey, days });
      if (!effectiveJql) {
        throw new Error('Provide either jql or a supported preset');
      }

      const authorization = resolveAuthorization(config);
      logToolInvocation(
        'jira_search_issues',
        { jql: effectiveJql, preset: preset ?? null, projectKey: projectKey ?? null, days, limit },
        null,
        authorization,
      );
      const result = await services.jiraClient.searchIssues({
        jql: effectiveJql,
        authorization,
        limit,
      });
      logDebug('jira_tool_completed', {
        tool: 'jira_search_issues',
        jql: effectiveJql,
        total: result.total,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        jql: effectiveJql,
        preset: preset ?? null,
        ...result,
      });
    },
  );

  server.tool(
    'jira_add_comment',
    'Add a comment to a Jira issue.',
    {
      issueKey: z.string().min(2),
      body: z.string().min(1).max(5000),
    },
    async ({ issueKey, body }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_add_comment', { issueKey, bodyLength: body.length }, null, authorization);
      const comment = await services.jiraClient.addComment(issueKey, body, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_add_comment',
        issueKey,
        commentId: comment.id,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        issueKey,
        comment,
      });
    },
  );

  server.tool(
    'jira_assign_issue',
    'Assign a Jira issue to a user.',
    {
      issueKey: z.string().min(2),
      accountId: z.string().optional(),
      name: z.string().optional(),
      userKey: z.string().optional(),
    },
    async ({ issueKey, accountId, name, userKey }) => {
      if (!accountId && !name && !userKey) {
        throw new Error('accountId, name, or userKey is required');
      }

      const authorization = resolveAuthorization(config);
      const assignee = {
        ...(accountId ? { accountId } : {}),
        ...(name ? { name } : {}),
        ...(userKey ? { key: userKey } : {}),
      };
      logToolInvocation('jira_assign_issue', { issueKey, assignee }, null, authorization);
      const result = await services.jiraClient.assignIssue(issueKey, assignee, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_assign_issue',
        issueKey,
        assignee,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_update_priority',
    'Update the priority on a Jira issue.',
    {
      issueKey: z.string().min(2),
      priorityName: z.string().optional(),
      priorityId: z.string().optional(),
    },
    async ({ issueKey, priorityName, priorityId }) => {
      if (!priorityName && !priorityId) {
        throw new Error('priorityName or priorityId is required');
      }

      const authorization = resolveAuthorization(config);
      const priority = priorityId ? { id: priorityId } : { name: priorityName };
      logToolInvocation('jira_update_priority', { issueKey, priority }, null, authorization);
      const result = await services.jiraClient.updatePriority(issueKey, priority, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_update_priority',
        issueKey,
        priority,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_get_transitions',
    'List available Jira workflow transitions for an issue.',
    {
      issueKey: z.string().min(2),
    },
    async ({ issueKey }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_get_transitions', { issueKey }, null, authorization);
      const transitions = await services.jiraClient.getTransitions(issueKey, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_get_transitions',
        issueKey,
        transitionCount: transitions.length,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        issueKey,
        transitions,
      });
    },
  );

  server.tool(
    'jira_summarize_issue_history',
    'Return a deterministic summary and timeline of issue comments and workflow changes.',
    {
      issueKey: z.string().min(2),
      maxEvents: z.number().int().min(1).max(100).default(20),
    },
    async ({ issueKey, maxEvents }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_summarize_issue_history', { issueKey, maxEvents }, null, authorization);
      const result = await services.jiraClient.getIssueHistory(issueKey, authorization, maxEvents);
      logDebug('jira_tool_completed', {
        tool: 'jira_summarize_issue_history',
        issueKey,
        timelineCount: result.timeline.length,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_find_similar_issues',
    'Find potentially similar Jira issues based on the source issue summary.',
    {
      issueKey: z.string().min(2),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ issueKey, limit }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_find_similar_issues', { issueKey, limit }, null, authorization);
      const result = await services.jiraClient.findSimilarIssues(issueKey, authorization, limit);
      logDebug('jira_tool_completed', {
        tool: 'jira_find_similar_issues',
        issueKey,
        total: result.total,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_transition_issue',
    'Transition a Jira issue using a workflow transition ID or name.',
    {
      issueKey: z.string().min(2),
      transitionId: z.string().optional(),
      transitionName: z.string().optional(),
    },
    async ({ issueKey, transitionId, transitionName }) => {
      if (!transitionId && !transitionName) {
        throw new Error('transitionId or transitionName is required');
      }

      const authorization = resolveAuthorization(config);
      const transition = {
        ...(transitionId ? { id: transitionId } : {}),
        ...(transitionName ? { name: transitionName } : {}),
      };
      logToolInvocation('jira_transition_issue', { issueKey, transition }, null, authorization);
      const result = await services.jiraClient.transitionIssue(issueKey, transition, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_transition_issue',
        issueKey,
        transition,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_update_due_date',
    'Update the due date on a Jira issue.',
    {
      issueKey: z.string().min(2),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    },
    async ({ issueKey, dueDate }) => {
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_update_due_date', { issueKey, dueDate }, null, authorization);
      const result = await services.jiraClient.updateDueDate(issueKey, dueDate, authorization);
      logDebug('jira_tool_completed', {
        tool: 'jira_update_due_date',
        issueKey,
        dueDate,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        ...result,
      });
    },
  );

  server.tool(
    'jira_prioritize_user_tickets',
    'List the current user tickets directly from Jira, then ask a Bedrock agent to prioritize and analyze them.',
    {
      userEmail: z.string().email().optional(),
      jiraAccountId: z.string().optional(),
      entraObjectId: z.string().optional(),
      projectKey: z.string().optional(),
      openOnly: z.boolean().default(true),
      limit: z.number().int().min(1).max(50).default(10),
      analysisGoal: z
        .string()
        .default('Prioritize these tickets by urgency, risk, and recommended next action.'),
    },
    async (args) => {
      const userContext = resolveUserContext(args);
      const authorization = resolveAuthorization(config);
      logToolInvocation('jira_prioritize_user_tickets', args, userContext, authorization);
      const result = await services.jiraClient.listTicketsForUser({
        userContext,
        authorization,
        projectKey: args.projectKey,
        openOnly: args.openOnly,
        limit: args.limit,
      });

      const sessionId = buildSessionId('jira-priority', userContext);
      const inputText = buildPriorityPrompt(result.issues, args.analysisGoal, userContext);
      const analysis = await services.agentClient.invoke({
        inputText,
        sessionId,
        sessionAttributes: {
          userEmail: userContext.userEmail ?? '',
          entraObjectId: userContext.entraObjectId ?? '',
        },
      });

      return toolResponse({
        route: 'bedrock-agent',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        sessionId,
        userContext,
        tickets: result.issues,
        total: result.total,
        analysis: analysis.text,
        traceCount: analysis.traces.length,
      });
    },
  );
}

function logToolInvocation(tool, args, userContext, authorization) {
  try {
    logDebug('jira_tool_invoked', {
      tool,
      hasDelegatedAuthorization: typeof authorization === 'string',
      args,
      userContext: userContext
        ? {
            userId: userContext.userId ?? null,
            userEmail: userContext.userEmail ?? null,
            entraObjectId: userContext.entraObjectId ?? null,
            jiraAccountId: userContext.jiraAccountId ?? null,
          }
        : null,
    });
  } catch (error) {
    logError('jira_tool_invocation_logging_failed', error, { tool });
  }
}

function resolveAuthorization(config) {
  if (config.requireDelegatedAuth) {
    return requireDelegatedAuthHeader('Jira');
  }

  return getDelegatedAuthHeader();
}

function buildPriorityPrompt(issues, analysisGoal, userContext) {
  return [
    'You are analyzing Jira work items for an enterprise user.',
    `User email: ${userContext.userEmail ?? 'unknown'}`,
    `User Entra object ID: ${userContext.entraObjectId ?? 'unknown'}`,
    '',
    'Goal:',
    analysisGoal,
    '',
    'Tickets:',
    JSON.stringify(issues, null, 2),
    '',
    'Return a concise priority analysis with the following sections:',
    '1. Highest priority tickets',
    '2. Why they rank highest',
    '3. Recommended next actions',
    '4. Risks or blockers',
  ].join('\n');
}

function buildQueuePresetJql({ preset, projectKey, days }) {
  if (!preset) {
    return null;
  }

  const projectClause = projectKey ? `project = "${escapeJql(projectKey)}" AND ` : '';

  switch (preset) {
    case 'my_open':
      return `${projectClause}assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
    case 'unassigned_open':
      return `${projectClause}assignee is EMPTY AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
    case 'high_priority_open':
      return `${projectClause}priority in (Highest, High) AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
    case 'overdue':
      return `${projectClause}duedate < startOfDay() AND statusCategory != Done ORDER BY duedate ASC`;
    case 'recently_updated':
      return `${projectClause}updated >= -${days}d ORDER BY updated DESC`;
    case 'project_backlog':
      if (!projectKey) {
        throw new Error('projectKey is required for preset project_backlog');
      }
      return `${projectClause}statusCategory != Done ORDER BY priority DESC, updated DESC`;
    default:
      return null;
  }
}

function escapeJql(value) {
  return String(value).replace(/"/g, '\\"');
}
