import { toast } from 'sonner'

import { APIRoutes, resolveAgentOSRequestUrl } from './routes'

import {
  AgentDetails,
  AgentOSConfigSummary,
  AgentOSHealth,
  AgentOSInfo,
  AgentOSModelSummary,
  AgentOSWorkflowDetails,
  AgentRuntimeDetails,
  FactoryAgentDefinition,
  FactorySkillCatalog,
  FactoryRevision,
  FactoryTeamDefinition,
  Sessions,
  SessionComponentOption,
  SessionComponentType,
  SessionCompactionRecord,
  SessionRunRecord,
  MetricsResponse,
  EvaluationRun,
  EvaluationRunsPage,
  RegistryPage,
  OverviewSession,
  TraceDetail,
  TraceNode,
  TracePage,
  TraceSessionStatsPage,
  TeamDetails,
  TeamRuntimeDetails,
  WorkflowDefinition,
  WorkflowSummary
} from '@/types/os'

// Helper function to create headers with optional auth token
const createHeaders = (authToken?: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  return headers
}

const fetchDetails = async <T>(
  url: string,
  authToken: string | undefined,
  signal: AbortSignal | undefined,
  label: string
): Promise<T> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `${label} was not found in this AgentOS.`
        : `Failed to load ${label.toLowerCase()} (${response.status})`
    )
  }

  return response.json()
}

export const getAgentRuntimeDetailsAPI = (
  endpoint: string,
  agentId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentRuntimeDetails> =>
  fetchDetails(
    APIRoutes.GetAgentDetails(endpoint, agentId),
    authToken,
    signal,
    'Agent runtime details'
  )

export const getFactoryAgentDefinitionAPI = (
  endpoint: string,
  agentId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryAgentDefinition> =>
  fetchDetails(
    APIRoutes.GetFactoryAgentDefinition(endpoint, agentId),
    authToken,
    signal,
    'Factory Agent definition'
  )

export const getTeamRuntimeDetailsAPI = (
  endpoint: string,
  teamId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<TeamRuntimeDetails> =>
  fetchDetails(
    APIRoutes.GetTeamDetails(endpoint, teamId),
    authToken,
    signal,
    'Team runtime details'
  )

export const getFactoryTeamDefinitionAPI = (
  endpoint: string,
  teamId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryTeamDefinition> =>
  fetchDetails(
    APIRoutes.GetFactoryTeamDefinition(endpoint, teamId),
    authToken,
    signal,
    'Factory Team definition'
  )

export const getAgentsAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentDetails[]> => {
  const url = APIRoutes.GetAgents(endpoint)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(authToken),
      signal
    })
    if (!response.ok) {
      toast.error(`Failed to fetch  agents: ${response.statusText}`)
      return []
    }
    const data = await response.json()
    return data
  } catch {
    if (!signal?.aborted) toast.error('Error fetching agents')
    return []
  }
}

export const getStatusAPI = async (
  base: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<number> => {
  const response = await fetch(APIRoutes.Status(base), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  return response.status
}

export const getAgentOSHealthAPI = (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentOSHealth> =>
  fetchDetails(APIRoutes.Status(endpoint), authToken, signal, 'AgentOS health')

export const getAgentOSInfoAPI = (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentOSInfo> =>
  fetchDetails(APIRoutes.GetInfo(endpoint), authToken, signal, 'AgentOS info')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const projectModelSummaries = (value: unknown): AgentOSModelSummary[] | undefined => {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((model) => {
    if (!isRecord(model)) return []
    return [{
      id: stringValue(model.id),
      name: stringValue(model.name),
      model: stringValue(model.model),
      provider: stringValue(model.provider)
    }]
  })
}

const projectComponentSummaries = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const id =
      stringValue(entry.id) ??
      stringValue(entry.agent_id) ??
      stringValue(entry.team_id) ??
      stringValue(entry.workflow_id)
    if (!id) return []
    return [{
      id,
      name: stringValue(entry.name),
      description: stringValue(entry.description)
    }]
  })
}

/** Fetches `/config` but returns only public component labels and DB IDs. */
export const getAgentOSConfigSummaryAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentOSConfigSummary> => {
  const response = await fetch(APIRoutes.GetConfig(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  const config: unknown = await response.json()
  if (!isRecord(config)) throw new Error('AgentOS config has an unexpected format.')
  const session = isRecord(config.session) ? config.session : {}
  const sessionDatabases = Array.isArray(session.dbs) ? session.dbs : []
  const interfaces = Array.isArray(config.interfaces) ? config.interfaces : []
  const availableModels = projectModelSummaries(config.available_models)
  const sessionDatabaseSummaries = Array.from(new Map(sessionDatabases.flatMap((database) => {
    if (!isRecord(database)) return []
    const dbId = stringValue(database.db_id)
    if (!dbId) return []
    const domainConfig = isRecord(database.domain_config) ? database.domain_config : {}
    return [[dbId, {
      db_id: dbId,
      display_name: stringValue(domainConfig.display_name)
    }] as const]
  })).values())

  return {
    agents: projectComponentSummaries(config.agents),
    teams: projectComponentSummaries(config.teams),
    workflows: projectComponentSummaries(config.workflows),
    session_db_ids: Array.from(new Set(sessionDatabases.flatMap((database) =>
      isRecord(database) && stringValue(database.db_id) ? [database.db_id as string] : []
    ))).sort((left, right) => left.localeCompare(right)),
    session_databases: sessionDatabaseSummaries,
    interfaces: interfaces.flatMap((item) => {
      if (!isRecord(item)) return []
      return [{
        id: stringValue(item.id),
        name: stringValue(item.name),
        type: stringValue(item.type)
      }]
    }),
    ...(availableModels === undefined ? {} : { available_models: availableModels })
  }
}

export const getRecentSessionsAPI = async (
  endpoint: string,
  dbId: string | undefined,
  authToken?: string,
  signal?: AbortSignal
): Promise<OverviewSession[]> => {
  const url = new URL(APIRoutes.GetSessions(endpoint))
  if (dbId) url.searchParams.set('db_id', dbId)
  url.searchParams.set('page', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('sort_by', 'updated_at')
  url.searchParams.set('sort_order', 'desc')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  const payload: unknown = await response.json()
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('AgentOS returned an unexpected sessions response.')
  }
  return payload.data.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const sessionId = stringValue(entry.session_id)
    const sessionType = stringValue(entry.session_type) || stringValue(entry.type)
    if (!sessionId || !sessionType) return []
    const componentId = stringValue(entry.component_id) ||
      (sessionType === 'agent' ? stringValue(entry.agent_id) :
        sessionType === 'team' ? stringValue(entry.team_id) :
          sessionType === 'workflow' ? stringValue(entry.workflow_id) : undefined)
    return [{
      session_id: sessionId,
      session_name: stringValue(entry.session_name),
      session_type: sessionType,
      component_id: componentId,
      agent_id: stringValue(entry.agent_id),
      team_id: stringValue(entry.team_id),
      workflow_id: stringValue(entry.workflow_id),
      created_at: typeof entry.created_at === 'string' || typeof entry.created_at === 'number' ? entry.created_at : undefined,
      updated_at: typeof entry.updated_at === 'string' || typeof entry.updated_at === 'number' ? entry.updated_at : undefined
    }]
  })
}

/** Reads only whether a fixed, read-only AgentOS capability endpoint responds. */
export const getAgentOSCapabilityStatusAPI = async (
  endpoint: string,
  capability: 'approvals' | 'queue',
  authToken?: string,
  signal?: AbortSignal
): Promise<number> => {
  const route = capability === 'approvals' ? APIRoutes.GetApprovals : APIRoutes.GetQueue
  const response = await fetch(route(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }
  return response.status
}

export const getAgentOSModelsAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentOSModelSummary[]> => {
  const response = await fetch(APIRoutes.GetModels(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }
  const payload: unknown = await response.json()
  const models = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : []
  return models.flatMap((model) => {
    if (!isRecord(model)) return []
    return [{
      id: stringValue(model.id),
      name: stringValue(model.name),
      model: stringValue(model.model),
      provider: stringValue(model.provider)
    }]
  })
}

export const getSessionComponentsAPI = async (
  base: string,
  type: SessionComponentType,
  authToken?: string,
  signal?: AbortSignal
): Promise<SessionComponentOption[]> => {
  const url =
    type === 'agent'
      ? APIRoutes.GetAgents(base)
      : type === 'team'
        ? APIRoutes.GetTeams(base)
        : APIRoutes.GetWorkflows(base)
  const response = await fetch(url, {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  const components = (await response.json()) as Array<Record<string, unknown>>
  return components.flatMap((component) => {
    const id =
      typeof component.id === 'string'
        ? component.id
        : typeof component.agent_id === 'string'
          ? component.agent_id
          : typeof component.team_id === 'string'
            ? component.team_id
            : typeof component.workflow_id === 'string'
              ? component.workflow_id
              : undefined
    if (!id) return []
    return [
      {
        id,
        name: typeof component.name === 'string' ? component.name : undefined,
        db_id: typeof component.db_id === 'string' ? component.db_id : undefined
      }
    ]
  })
}

export const getSessionDatabaseOptionsAPI = async (
  base: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<string[]> => {
  const response = await fetch(APIRoutes.GetConfig(base), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  const config = (await response.json()) as {
    session?: { dbs?: Array<{ db_id?: unknown }> }
  }
  return Array.from(
    new Set(
      (Array.isArray(config.session?.dbs) ? config.session.dbs : []).flatMap(
        (database) =>
          typeof database?.db_id === 'string' && database.db_id.length > 0
            ? [database.db_id]
            : []
      )
    )
  ).sort((left, right) => left.localeCompare(right))
}

export interface ReadOnlyRecordPage {
  data: Array<Record<string, unknown>>
  meta: {
    page?: number
    limit?: number
    total_pages?: number
    total_count?: number
    search_time_ms?: number
  }
}

const fetchReadOnlyRecordPage = async (
  url: URL,
  authToken?: string,
  signal?: AbortSignal,
  notFoundMessage?: string
): Promise<ReadOnlyRecordPage> => {
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    if (response.status === 404 && notFoundMessage) throw new Error(notFoundMessage)
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getMemoriesAPI = (
  base: string,
  dbId: string | undefined,
  page: number,
  authToken?: string,
  signal?: AbortSignal
): Promise<ReadOnlyRecordPage> => {
  const url = new URL(APIRoutes.GetMemories(base))
  if (dbId) url.searchParams.set('db_id', dbId)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', '20')
  url.searchParams.set('sort_by', 'updated_at')
  url.searchParams.set('sort_order', 'desc')
  return fetchReadOnlyRecordPage(url, authToken, signal)
}

export const getLearningsAPI = (
  base: string,
  dbId: string | undefined,
  page: number,
  authToken?: string,
  signal?: AbortSignal
): Promise<ReadOnlyRecordPage> => {
  const url = new URL(APIRoutes.GetLearnings(base))
  if (dbId) url.searchParams.set('db_id', dbId)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', '20')
  url.searchParams.set('sort_by', 'updated_at')
  url.searchParams.set('sort_order', 'desc')
  return fetchReadOnlyRecordPage(url, authToken, signal)
}

export const getKnowledgeConfigAPI = async (
  base: string,
  dbId: string | undefined,
  authToken?: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> => {
  const url = new URL(APIRoutes.GetKnowledgeConfig(base))
  if (dbId) url.searchParams.set('db_id', dbId)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (response.status === 404) {
    throw new Error('No Knowledge instance is configured for this database.')
  }
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getKnowledgeContentAPI = (
  base: string,
  dbId: string | undefined,
  page: number,
  authToken?: string,
  signal?: AbortSignal
): Promise<ReadOnlyRecordPage> => {
  const url = new URL(APIRoutes.GetKnowledgeContent(base))
  if (dbId) url.searchParams.set('db_id', dbId)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', '20')
  url.searchParams.set('sort_by', 'updated_at')
  url.searchParams.set('sort_order', 'desc')
  return fetchReadOnlyRecordPage(
    url,
    authToken,
    signal,
    'No Knowledge content endpoint is available for this database.'
  )
}

export const searchKnowledgeAPI = async (
  base: string,
  input: {
    query: string
    dbId?: string
    vectorDbId?: string
    searchType: 'vector' | 'keyword' | 'hybrid'
    maxResults: number
  },
  authToken?: string,
  signal?: AbortSignal
): Promise<ReadOnlyRecordPage> => {
  const response = await fetch(APIRoutes.SearchKnowledge(base), {
    method: 'POST',
    headers: createHeaders(authToken),
    body: JSON.stringify({
      query: input.query,
      db_id: input.dbId,
      vector_db_ids: input.vectorDbId ? [input.vectorDbId] : undefined,
      search_type: input.searchType,
      max_results: input.maxResults,
      meta: { page: 1, limit: input.maxResults }
    }),
    signal
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No Knowledge instance is configured for this database.')
    }
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getTracesAPI = async (
  base: string,
  input: {
    dbId?: string
    runId?: string
    sessionId?: string
    status?: string
    page: number
    limit: number
  },
  authToken?: string,
  signal?: AbortSignal
): Promise<TracePage> => {
  const url = new URL(APIRoutes.GetTraces(base))
  if (input.dbId) url.searchParams.set('db_id', input.dbId)
  if (input.runId) url.searchParams.set('run_id', input.runId)
  if (input.sessionId) url.searchParams.set('session_id', input.sessionId)
  if (input.status) url.searchParams.set('status', input.status)
  url.searchParams.set('page', String(input.page))
  url.searchParams.set('limit', String(input.limit))

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getEvaluationRunsAPI = async (
  base: string,
  input: {
    dbId?: string
    page: number
    limit: number
    evalType?: string
    componentType?: 'agent' | 'team' | 'workflow'
    componentId?: string
    modelId?: string
  },
  authToken?: string,
  signal?: AbortSignal
): Promise<EvaluationRunsPage> => {
  const url = new URL(APIRoutes.GetEvalRuns(base))
  if (input.dbId) url.searchParams.set('db_id', input.dbId)
  if (input.componentType && input.componentId) {
    url.searchParams.set('type', input.componentType)
    url.searchParams.set(`${input.componentType}_id`, input.componentId)
  }
  if (input.modelId) url.searchParams.set('model_id', input.modelId)
  if (input.evalType) url.searchParams.set('eval_types', input.evalType)
  url.searchParams.set('sort_by', 'created_at')
  url.searchParams.set('sort_order', 'desc')
  url.searchParams.set('page', String(input.page))
  url.searchParams.set('limit', String(input.limit))

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    let detail = ''
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = `: ${body.detail}`
    } catch {
      // Keep the status message when AgentOS does not return a JSON error body.
    }
    throw new Error(`AgentOS returned ${response.status}${statusText}${detail}`)
  }
  return response.json()
}

export const getEvaluationRunAPI = (
  base: string,
  evalRunId: string,
  dbId?: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<EvaluationRun> => {
  const url = new URL(APIRoutes.GetEvalRun(base, evalRunId))
  if (dbId) url.searchParams.set('db_id', dbId)
  return fetchDetails(url.toString(), authToken, signal, 'Evaluation run')
}

export const getRegistryAPI = async (
  base: string,
  input: { page: number; limit: number; resourceType?: string; name?: string },
  authToken?: string,
  signal?: AbortSignal
): Promise<RegistryPage> => {
  const url = new URL(APIRoutes.GetRegistry(base))
  if (input.resourceType) url.searchParams.set('resource_type', input.resourceType)
  if (input.name) url.searchParams.set('name', input.name)
  url.searchParams.set('page', String(input.page))
  url.searchParams.set('limit', String(input.limit))
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    let detail = ''
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = `: ${body.detail}`
    } catch {
      // Keep the status message when AgentOS does not return a JSON error body.
    }
    throw new Error(`AgentOS returned ${response.status}${statusText}${detail}`)
  }
  return response.json()
}

export const getTraceDetailsAPI = async (
  base: string,
  traceId: string,
  dbId?: string,
  runId?: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<TraceDetail | TraceNode> => {
  const url = new URL(APIRoutes.GetTrace(base, traceId))
  if (dbId) url.searchParams.set('db_id', dbId)
  if (runId) url.searchParams.set('run_id', runId)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(
      response.status === 404
        ? 'Trace was not found in the selected database.'
        : `AgentOS returned ${response.status}${statusText}`
    )
  }

  return response.json()
}

export const getTraceSessionStatsAPI = async (
  base: string,
  dbId?: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<TraceSessionStatsPage> => {
  const url = new URL(APIRoutes.GetTraceSessionStats(base))
  if (dbId) url.searchParams.set('db_id', dbId)
  url.searchParams.set('page', '1')
  url.searchParams.set('limit', '10')
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getMetricsAPI = async (
  base: string,
  input: { dbId?: string; startingDate: string; endingDate: string; table?: string },
  authToken?: string,
  signal?: AbortSignal
): Promise<MetricsResponse> => {
  const url = new URL(APIRoutes.GetMetrics(base))
  if (input.dbId) url.searchParams.set('db_id', input.dbId)
  if (input.table) url.searchParams.set('table', input.table)
  if (input.startingDate) url.searchParams.set('starting_date', input.startingDate)
  if (input.endingDate) url.searchParams.set('ending_date', input.endingDate)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getOSMetricsAPI = async (
  base: string,
  metric: 'latency' | 'models' | 'runs' | 'sessions' | 'tokens' | 'users',
  input: { dbId?: string; startingDate: string; endingDate: string },
  authToken?: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> => {
  const url = new URL(APIRoutes.GetOSMetrics(base, metric))
  if (metric !== 'users' && input.dbId) url.searchParams.set('db_id', input.dbId)
  if (input.startingDate) url.searchParams.set('starting_date', input.startingDate)
  if (input.endingDate) url.searchParams.set('ending_date', input.endingDate)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    let detail = ''
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = `: ${body.detail}`
    } catch {
      // Keep the status message when AgentOS does not return a JSON error body.
    }
    throw new Error(`AgentOS returned ${response.status}${statusText}${detail}`)
  }

  return response.json()
}

export const getAllSessionsAPI = async (
  base: string,
  type: 'agent' | 'team' | 'workflow',
  componentId: string,
  dbId: string | undefined,
  authToken?: string,
  options: { page?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<Sessions> => {
  const url = new URL(APIRoutes.GetSessions(base))
  url.searchParams.set('type', type)
  url.searchParams.set('component_id', componentId)
  if (dbId) url.searchParams.set('db_id', dbId)
  if (options.page !== undefined) {
    url.searchParams.set('page', String(options.page))
  }
  if (options.limit !== undefined) {
    url.searchParams.set('limit', String(options.limit))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal: options.signal
  })

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getSessionRunsAPI = async (
  base: string,
  type: SessionComponentType,
  sessionId: string,
  dbId?: string,
  authToken?: string,
  signal?: AbortSignal,
  filters: { createdAfter?: string; createdBefore?: string; status?: string } = {}
): Promise<SessionRunRecord[]> => {
  const toUnixSeconds = (value: string) => {
    const trimmed = value.trim()
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed)
      const seconds = Math.abs(numeric) >= 1_000_000_000_000 ? numeric / 1000 : numeric
      return String(Math.floor(seconds))
    }

    const milliseconds = Date.parse(value)
    if (Number.isNaN(milliseconds)) {
      throw new Error('Run date filters must contain valid date and time values.')
    }
    return String(Math.floor(milliseconds / 1000))
  }
  const queryParams = new URLSearchParams({ type })
  if (dbId) queryParams.set('db_id', dbId)
  if (filters.createdAfter) queryParams.set('created_after', toUnixSeconds(filters.createdAfter))
  if (filters.createdBefore) queryParams.set('created_before', toUnixSeconds(filters.createdBefore))
  if (filters.status) queryParams.set('status', filters.status)
  const response = await fetch(
    `${APIRoutes.GetSession(base, sessionId)}?${queryParams.toString()}`,
    { method: 'GET', headers: createHeaders(authToken), signal }
  )

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getSessionCompactionsAPI = async (
  base: string,
  type: SessionComponentType,
  sessionId: string,
  dbId?: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<SessionCompactionRecord[]> => {
  const queryParams = new URLSearchParams({ type })
  if (dbId) queryParams.set('db_id', dbId)
  const response = await fetch(
    `${APIRoutes.GetSessionCompactions(base, sessionId)}?${queryParams.toString()}`,
    { method: 'GET', headers: createHeaders(authToken), signal }
  )

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('AgentOS compactions response has an unexpected format.')
  }
  return payload.flatMap((record) => {
    if (!isRecord(record)) return []
    return [{
      id: typeof record.id === 'string' ? record.id : null,
      run_id: typeof record.run_id === 'string' ? record.run_id : null,
      messages_compacted: typeof record.messages_compacted === 'number' ? record.messages_compacted : undefined,
      tokens_before: typeof record.tokens_before === 'number' ? record.tokens_before : null,
      tokens_after: typeof record.tokens_after === 'number' ? record.tokens_after : null,
      created_at: typeof record.created_at === 'string' ? record.created_at : null,
      archived: typeof record.archived === 'boolean' ? record.archived : undefined
    }]
  })
}

export const getSessionRunAPI = async (
  base: string,
  type: SessionComponentType,
  sessionId: string,
  runId: string,
  dbId?: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<SessionRunRecord> => {
  const queryParams = new URLSearchParams({ type })
  if (dbId) queryParams.set('db_id', dbId)
  const response = await fetch(
    `${APIRoutes.GetSessionRun(base, sessionId, runId)}?${queryParams.toString()}`,
    { method: 'GET', headers: createHeaders(authToken), signal }
  )

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(`AgentOS returned ${response.status}${statusText}`)
  }

  return response.json()
}

export const getSessionAPI = async (
  base: string,
  type: 'agent' | 'team',
  sessionId: string,
  dbId?: string,
  authToken?: string
) => {
  // build query string
  const queryParams = new URLSearchParams({ type })
  if (dbId) queryParams.append('db_id', dbId)

  const response = await fetch(
    `${APIRoutes.GetSession(base, sessionId)}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: createHeaders(authToken)
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`)
  }

  return response.json()
}

export const deleteSessionAPI = async (
  base: string,
  dbId: string,
  sessionId: string,
  authToken?: string
) => {
  const queryParams = new URLSearchParams()
  if (dbId) queryParams.append('db_id', dbId)
  const response = await fetch(
    `${APIRoutes.DeleteSession(base, sessionId)}?${queryParams.toString()}`,
    {
      method: 'DELETE',
      headers: createHeaders(authToken)
    }
  )
  return response
}

export const getTeamsAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<TeamDetails[]> => {
  const url = APIRoutes.GetTeams(endpoint)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(authToken),
      signal
    })
    if (!response.ok) {
      toast.error(`Failed to fetch  teams: ${response.statusText}`)
      return []
    }
    const data = await response.json()

    return data
  } catch {
    if (!signal?.aborted) toast.error('Error fetching teams')
    return []
  }
}

export const getWorkflowsAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<WorkflowSummary[]> => {
  const response = await fetch(APIRoutes.GetWorkflows(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(`Failed to load workflows (${response.status})`)
  }

  return response.json()
}

export const getWorkflowRuntimeDetailsAPI = async (
  endpoint: string,
  workflowId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<WorkflowDefinition> => {
  const response = await fetch(
    APIRoutes.GetWorkflowDetails(endpoint, workflowId),
    {
      method: 'GET',
      headers: createHeaders(authToken),
      signal
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to load AgentOS workflow details (${response.status})`
    )
  }

  const workflow = (await response.json()) as AgentOSWorkflowDetails
  const normalizeSteps = (
    steps: AgentOSWorkflowDetails['steps'] = []
  ): WorkflowDefinition['steps'] =>
    steps.map((step) => {
      const nativeType = step.type.toLowerCase()
      if (nativeType === 'condition') {
        return {
          name: step.name,
          type: 'condition',
          steps: normalizeSteps(step.steps),
          else_steps: normalizeSteps(step.else_steps)
        }
      }
      if (nativeType === 'parallel') {
        return {
          name: step.name,
          type: 'parallel',
          steps: normalizeSteps(step.steps)
        }
      }
      if (step.agent) {
        return {
          name: step.name,
          type: 'agent',
          ref: step.agent.id || step.agent.name
        }
      }
      if (step.team) {
        return {
          name: step.name,
          type: 'team',
          ref: step.team.id || step.team.name
        }
      }
      return { name: step.name, type: 'runtime_step' }
    })

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    steps: normalizeSteps(workflow.steps),
    source: 'AgentOS runtime'
  }
}

export const getFactoryWorkflowDefinitionAPI = async (
  endpoint: string,
  workflowId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<WorkflowDefinition> => {
  const response = await fetch(
    APIRoutes.GetFactoryWorkflowDefinition(endpoint, workflowId),
    {
      method: 'GET',
      headers: createHeaders(authToken),
      signal
    }
  )

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Workflow definition was not found for this AgentOS.'
        : `Failed to load workflow definition (${response.status})`
    )
  }

  const workflow = (await response.json()) as WorkflowDefinition
  return { ...workflow, source: 'Factory definition registry' }
}

export const getFactoryRevisionAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryRevision> => {
  const response = await fetch(APIRoutes.GetFactoryRevision(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(`Failed to load definition revision (${response.status})`)
  }

  return response.json()
}

export const getAgentOSEndpointStatusAPI = async (
  endpoint: string,
  path: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<number> => {
  const base = resolveAgentOSRequestUrl(endpoint).replace(/\/+$/, '')
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })
  return response.status
}

export const getFactorySkillCatalogAPI = (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactorySkillCatalog> =>
  fetchDetails(
    APIRoutes.GetFactoryCatalog(endpoint),
    authToken,
    signal,
    'Factory skill catalog'
  )

export const deleteTeamSessionAPI = async (
  base: string,
  teamId: string,
  sessionId: string,
  authToken?: string
) => {
  const response = await fetch(
    APIRoutes.DeleteTeamSession(base, teamId, sessionId),
    {
      method: 'DELETE',
      headers: createHeaders(authToken)
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to delete team session: ${response.statusText}`)
  }
  return response
}
