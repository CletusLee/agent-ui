export const resolveAgentOSRequestUrl = (url: string): string => {
  const normalized = url.replace(/\/+$/, '')

  if (typeof window !== 'undefined') {
    try {
      const target = new URL(normalized)
      const isLocalAgentOS =
        (target.hostname === 'localhost' || target.hostname === '127.0.0.1') &&
        target.port === '7777'

      if (isLocalAgentOS && target.origin !== window.location.origin) {
        return `${window.location.origin}/api/agentos`
      }
    } catch {
      // Preserve malformed endpoints so the caller can report the request error.
    }
  }

  return normalized
}

const api = (agentOSUrl: string, path: string) =>
  `${resolveAgentOSRequestUrl(agentOSUrl)}${path}`

export const APIRoutes = {
  GetAgents: (agentOSUrl: string) => api(agentOSUrl, '/agents'),
  GetConfig: (agentOSUrl: string) => api(agentOSUrl, '/config'),
  GetApprovals: (agentOSUrl: string) => api(agentOSUrl, '/approvals'),
  GetQueue: (agentOSUrl: string) => api(agentOSUrl, '/queue'),
  GetInfo: (agentOSUrl: string) => api(agentOSUrl, '/info'),
  GetModels: (agentOSUrl: string) => api(agentOSUrl, '/models'),
  GetAgentDetails: (agentOSUrl: string, agentId: string) =>
    api(agentOSUrl, `/agents/${encodeURIComponent(agentId)}`),
  GetFactoryAgentDefinition: (agentOSUrl: string, agentId: string) =>
    api(agentOSUrl, `/factory/agents/${encodeURIComponent(agentId)}`),
  AgentRun: (agentOSUrl: string) => api(agentOSUrl, '/agents/{agent_id}/runs'),
  Status: (agentOSUrl: string) => api(agentOSUrl, '/health'),
  GetSessions: (agentOSUrl: string) => api(agentOSUrl, '/sessions'),
  GetMemories: (agentOSUrl: string) => api(agentOSUrl, '/memories'),
  GetLearnings: (agentOSUrl: string) => api(agentOSUrl, '/learnings'),
  GetKnowledgeConfig: (agentOSUrl: string) => api(agentOSUrl, '/knowledge/config'),
  GetKnowledgeContent: (agentOSUrl: string) => api(agentOSUrl, '/knowledge/content'),
  SearchKnowledge: (agentOSUrl: string) => api(agentOSUrl, '/knowledge/search'),
  GetTraces: (agentOSUrl: string) => api(agentOSUrl, '/traces'),
  GetEvalRuns: (agentOSUrl: string) => api(agentOSUrl, '/eval-runs'),
  GetEvalRun: (agentOSUrl: string, evalRunId: string) =>
    api(agentOSUrl, `/eval-runs/${encodeURIComponent(evalRunId)}`),
  GetTrace: (agentOSUrl: string, traceId: string) =>
    api(agentOSUrl, `/traces/${encodeURIComponent(traceId)}`),
  GetTraceSessionStats: (agentOSUrl: string) => api(agentOSUrl, '/trace_session_stats'),
  GetMetrics: (agentOSUrl: string) => api(agentOSUrl, '/metrics'),
  GetOSMetrics: (agentOSUrl: string, metric: string) =>
    api(agentOSUrl, `/os/metrics/${metric}`),
  GetSession: (agentOSUrl: string, sessionId: string) =>
    api(agentOSUrl, `/sessions/${encodeURIComponent(sessionId)}/runs`),
  GetSessionRun: (agentOSUrl: string, sessionId: string, runId: string) =>
    api(agentOSUrl, `/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}`),
  GetSessionCompactions: (agentOSUrl: string, sessionId: string) =>
    api(agentOSUrl, `/sessions/${encodeURIComponent(sessionId)}/compactions`),
  DeleteSession: (agentOSUrl: string, sessionId: string) =>
    api(agentOSUrl, `/sessions/${sessionId}`),
  GetTeams: (agentOSUrl: string) => api(agentOSUrl, '/teams'),
  GetTeamDetails: (agentOSUrl: string, teamId: string) =>
    api(agentOSUrl, `/teams/${encodeURIComponent(teamId)}`),
  GetFactoryTeamDefinition: (agentOSUrl: string, teamId: string) =>
    api(agentOSUrl, `/factory/teams/${encodeURIComponent(teamId)}`),
  GetWorkflows: (agentOSUrl: string) => api(agentOSUrl, '/workflows'),
  GetWorkflowDetails: (agentOSUrl: string, workflowId: string) =>
    api(agentOSUrl, `/workflows/${encodeURIComponent(workflowId)}`),
  GetFactoryWorkflowDefinition: (agentOSUrl: string, workflowId: string) =>
    api(agentOSUrl, `/factory/workflows/${encodeURIComponent(workflowId)}`),
  GetFactoryRevision: (agentOSUrl: string) => api(agentOSUrl, '/factory/revision'),
  GetFactoryCatalog: (agentOSUrl: string) => api(agentOSUrl, '/factory/catalog'),
  GetRegistry: (agentOSUrl: string) => api(agentOSUrl, '/registry'),
  TeamRun: (agentOSUrl: string, teamId: string) =>
    api(agentOSUrl, `/teams/${teamId}/runs`),
  DeleteTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    api(agentOSUrl, `/v1//teams/${teamId}/sessions/${sessionId}`)
}
