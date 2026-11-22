'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, AlertCircle, ChevronLeft, ChevronRight, Clock3, History, RefreshCw } from 'lucide-react'
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs'

import {
  getAllSessionsAPI,
  getSessionComponentsAPI,
  getSessionDatabaseOptionsAPI,
  getSessionRunAPI,
  getSessionCompactionsAPI,
  getSessionRunsAPI
} from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  Pagination,
  SessionComponentOption,
  SessionComponentType,
  SessionEntry,
  SessionCompactionRecord,
  SessionRunRecord,
  WorkflowStepResult
} from '@/types/os'

const PAGE_SIZE = 5
const RUN_STATUS_VALUES = [
  'CANCELLED',
  'COMPLETED',
  'ERROR',
  'PAUSED',
  'PENDING',
  'REGENERATED',
  'RUNNING'
]

const normalizeRunStatus = (value: string) => {
  const normalized = value.trim().toUpperCase()
  return RUN_STATUS_VALUES.includes(normalized) ? normalized : null
}

const formatPayload = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'Not returned'

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return 'Time not recorded'
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

const toDateTimeInputValue = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

const toUtcIsoString = (value: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const componentTypeLabel: Record<SessionComponentType, string> = {
  agent: 'Agent',
  team: 'Team',
  workflow: 'Workflow'
}

const countValue = (value: unknown) => {
  if (Array.isArray(value)) return String(value.length)
  return value === undefined || value === null ? 'Not returned' : 'Returned'
}

const disclosureLabel = (label: string, value: unknown) =>
  Array.isArray(value) ? `${label} · ${value.length}` : label

const statusTone = (status?: string) => {
  const normalized = status?.toUpperCase() || ''
  if (normalized === 'COMPLETED' || normalized === 'SUCCESS') {
    return 'border-positive/30 bg-positive/10 text-positive'
  }
  if (normalized === 'FAILED' || normalized === 'ERROR') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') {
    return 'border-primary/20 bg-primary/5 text-muted'
  }
  return 'border-primary/20 bg-primary/5 text-primary'
}

const StatusBadge = ({ status }: { status?: string }) => (
  <span
    className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone(status)}`}
  >
    {status || 'UNKNOWN'}
  </span>
)

const ErrorState = ({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) => (
  <div className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
    <div className="flex min-w-0 items-start gap-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="break-words">{message}</span>
    </div>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="size-3.5" />
      Retry
    </Button>
  </div>
)

const JsonDisclosure = ({
  label,
  value
}: {
  label: string
  value: unknown
}) => (
  <details className="min-w-0 rounded-xl border border-primary/10 bg-background">
    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-primary">
      {label}
    </summary>
    <pre className="max-h-[28rem] min-w-0 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 p-3 font-mono text-[10px] leading-5 text-muted">
      {formatPayload(value)}
    </pre>
  </details>
)

const stepStatus = (step: WorkflowStepResult) => {
  if (step.error) return 'FAILED'
  if (step.is_paused) return 'PAUSED'
  if (step.stop) return 'STOPPED'
  if (step.success === true) return 'COMPLETED'
  if (step.success === false) return 'FAILED'
  return 'RECORDED'
}

const RunExplorer = () => {
  const { selectedEndpoint, authToken, isEndpointActive, setActiveView } = useStore()
  const [, setViewQuery] = useQueryState('view')
  const [dbId, setDbId] = useQueryState('db_id')
  const [sessionTypeQuery, setSessionTypeQuery] = useQueryState('session_type')
  const componentType: SessionComponentType =
    sessionTypeQuery === 'agent' ||
    sessionTypeQuery === 'team' ||
    sessionTypeQuery === 'workflow'
      ? sessionTypeQuery
      : 'workflow'
  const [componentIdQuery, setComponentIdQuery] = useQueryState('component_id')
  const selectedComponentId = componentIdQuery || ''
  const [page, setPage] = useQueryState(
    'runs_page',
    parseAsInteger.withDefault(1)
  )
  const [selectedSessionId, setSelectedSessionId] = useQueryState('session_id')
  const [selectedRunId, setSelectedRunId] = useQueryState('run_id')
  const [createdAfterQuery, setCreatedAfterQuery] = useQueryState('runs_created_after', parseAsString)
  const [createdBeforeQuery, setCreatedBeforeQuery] = useQueryState('runs_created_before', parseAsString)
  const [runStatusQuery, setRunStatusQuery] = useQueryState('runs_status', parseAsString)
  const [, setObservabilityViewQuery] = useQueryState('observability_view')
  const [, setTracePageQuery] = useQueryState('trace_page', parseAsInteger.withDefault(1))
  const [, setTraceRunQuery] = useQueryState('trace_run_id')
  const [, setTraceSessionQuery] = useQueryState('trace_session_id')
  const [, setTraceStatusQuery] = useQueryState('trace_status')
  const [, setTraceIdQuery] = useQueryState('trace_id')
  const [components, setComponents] = useState<SessionComponentOption[]>([])
  const [sessionDatabaseIds, setSessionDatabaseIds] = useState<string[]>([])
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [runs, setRuns] = useState<SessionRunRecord[]>([])
  const [compactions, setCompactions] = useState<SessionCompactionRecord[]>([])
  const [runDetails, setRunDetails] = useState<SessionRunRecord | null>(null)
  const [componentsLoading, setComponentsLoading] = useState(true)
  const [databasesLoading, setDatabasesLoading] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [runsLoading, setRunsLoading] = useState(false)
  const [compactionsLoading, setCompactionsLoading] = useState(false)
  const [runDetailsLoading, setRunDetailsLoading] = useState(false)
  const [componentsError, setComponentsError] = useState('')
  const [databasesError, setDatabasesError] = useState('')
  const [sessionsError, setSessionsError] = useState('')
  const [runsError, setRunsError] = useState('')
  const [compactionsError, setCompactionsError] = useState('')
  const [runDetailsError, setRunDetailsError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [createdAfterInput, setCreatedAfterInput] = useState('')
  const [createdBeforeInput, setCreatedBeforeInput] = useState('')
  const [runStatusInput, setRunStatusInput] = useState('')
  const [runFilterError, setRunFilterError] = useState('')
  const [componentsLoadedKey, setComponentsLoadedKey] = useState('')
  const [sessionsLoadedKey, setSessionsLoadedKey] = useState('')
  const [runsLoadedKey, setRunsLoadedKey] = useState('')
  const componentsRequestKey = `${selectedEndpoint}|${componentType}`
  const sessionsQueryKey = `${componentsRequestKey}|${selectedComponentId}|${dbId || ''}|${page}`
  const runsQueryKey = `${componentsRequestKey}|${selectedSessionId || ''}|${dbId || ''}|${createdAfterQuery || ''}|${createdBeforeQuery || ''}|${runStatusQuery || ''}`
  const hasActiveRunFilters = Boolean(createdAfterQuery || createdBeforeQuery || runStatusQuery)
  const invalidCreatedAfterQuery = Boolean(
    createdAfterQuery && !toDateTimeInputValue(createdAfterQuery)
  )
  const invalidCreatedBeforeQuery = Boolean(
    createdBeforeQuery && !toDateTimeInputValue(createdBeforeQuery)
  )
  const unsupportedRunStatusQuery = Boolean(runStatusQuery && !normalizeRunStatus(runStatusQuery))
  const selectedComponent = components.find(
    (component) => component.id === selectedComponentId
  )
  const selectedSession = sessions.find(
    (session) => session.session_id === selectedSessionId
  )
  const selectedRun = runs.find((run) => run.run_id === selectedRunId)
  const componentNotFound =
    Boolean(selectedComponentId) &&
    componentsLoadedKey === componentsRequestKey &&
    !componentsError &&
    !selectedComponent
  const sessionNotFound =
    Boolean(selectedSessionId) &&
    sessionsLoadedKey === sessionsQueryKey &&
    !sessionsError &&
    !selectedSession

  useEffect(() => {
    if (!sessionTypeQuery) void setSessionTypeQuery('workflow')
    else if (!['agent', 'team', 'workflow'].includes(sessionTypeQuery)) {
      void setSessionTypeQuery('workflow')
    }
  }, [sessionTypeQuery, setSessionTypeQuery])

  useEffect(() => {
    setCreatedAfterInput(toDateTimeInputValue(createdAfterQuery))
    setCreatedBeforeInput(toDateTimeInputValue(createdBeforeQuery))
    setRunStatusInput(runStatusQuery || '')

    if (invalidCreatedAfterQuery || invalidCreatedBeforeQuery) {
      setRunFilterError('An invalid run date filter was removed from the URL.')
      if (invalidCreatedAfterQuery) void setCreatedAfterQuery(null)
      if (invalidCreatedBeforeQuery) void setCreatedBeforeQuery(null)
      void setSelectedRunId(null)
    }
  }, [createdAfterQuery, createdBeforeQuery, runStatusQuery, invalidCreatedAfterQuery, invalidCreatedBeforeQuery, setCreatedAfterQuery, setCreatedBeforeQuery, setRunStatusQuery, setSelectedRunId])

  useEffect(() => {
    if (!runStatusQuery) return
    const normalizedStatus = normalizeRunStatus(runStatusQuery)
    if (normalizedStatus && normalizedStatus !== runStatusQuery) {
      void setRunStatusQuery(normalizedStatus)
    }
  }, [runStatusQuery, setRunStatusQuery])

  useEffect(() => {
    const controller = new AbortController()
    setComponents([])
    setComponentsLoadedKey('')
    setComponentsError('')
    setComponentsLoading(true)

    if (!isEndpointActive) {
      setComponentsLoading(false)
      return () => controller.abort()
    }

    getSessionComponentsAPI(
      selectedEndpoint,
      componentType,
      authToken,
      controller.signal
    )
      .then((items) => {
        if (controller.signal.aborted) return
        setComponents(items)
        setComponentsLoadedKey(componentsRequestKey)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setComponentsError(
            error instanceof Error
              ? error.message
              : `Unable to load ${componentTypeLabel[componentType].toLowerCase()}s.`
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setComponentsLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, componentType, componentsRequestKey, refreshKey])

  useEffect(() => {
    if (
      !isEndpointActive ||
      componentsLoading ||
      componentsLoadedKey !== componentsRequestKey ||
      componentsError ||
      selectedComponentId ||
      components.length === 0
    ) {
      return
    }
    void setComponentIdQuery(components[0].id)
  }, [components, componentsError, componentsLoadedKey, componentsLoading, componentsRequestKey, isEndpointActive, selectedComponentId, setComponentIdQuery])

  useEffect(() => {
    const controller = new AbortController()
    setSessionDatabaseIds([])
    setDatabasesError('')

    if (!isEndpointActive) {
      setDatabasesLoading(false)
      return () => controller.abort()
    }

    setDatabasesLoading(true)
    getSessionDatabaseOptionsAPI(selectedEndpoint, authToken, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setSessionDatabaseIds(items)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDatabasesError(
            error instanceof Error ? error.message : 'Unable to load AgentOS databases.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDatabasesLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    setSessions([])
    setSessionsLoadedKey('')
    setPagination(null)
    setSessionsError('')
    setSessionsLoading(true)

    if (!isEndpointActive || !selectedComponentId || !selectedComponent) {
      setSessionsLoading(false)
      return () => controller.abort()
    }

    getAllSessionsAPI(
      selectedEndpoint,
      componentType,
      selectedComponentId,
      dbId || undefined,
      authToken,
      { page, limit: PAGE_SIZE, signal: controller.signal }
    )
      .then((response) => {
        if (controller.signal.aborted) return
        setSessions(response.data ?? [])
        setPagination(response.meta)
        setSessionsLoadedKey(sessionsQueryKey)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSessionsError(
            error instanceof Error
              ? error.message
              : `Unable to load ${componentTypeLabel[componentType].toLowerCase()} sessions.`
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionsLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, dbId, isEndpointActive, componentType, selectedComponentId, selectedComponent, components, page, refreshKey, sessionsQueryKey])

  useEffect(() => {
    if (
      !isEndpointActive ||
      sessionsLoading ||
      sessionsLoadedKey !== sessionsQueryKey ||
      sessionsError ||
      selectedSessionId ||
      sessions.length === 0
    ) {
      return
    }
    void setSelectedSessionId(sessions[0].session_id)
  }, [isEndpointActive, sessions, sessionsError, sessionsLoadedKey, sessionsLoading, sessionsQueryKey, selectedSessionId, setSelectedSessionId])

  useEffect(() => {
    const controller = new AbortController()
    setRuns([])
    setRunsLoadedKey('')
    setRunDetails(null)
    setRunsError('')
    setRunsLoading(true)

    if (
      !isEndpointActive ||
      !selectedSessionId ||
      sessionsLoading ||
      !selectedSession ||
      invalidCreatedAfterQuery ||
      invalidCreatedBeforeQuery ||
      unsupportedRunStatusQuery
    ) {
      setRunsLoading(false)
      return () => controller.abort()
    }

    getSessionRunsAPI(
      selectedEndpoint,
      componentType,
      selectedSessionId,
      dbId || undefined,
      authToken,
      controller.signal,
      {
        createdAfter: createdAfterQuery || undefined,
        createdBefore: createdBeforeQuery || undefined,
        status: runStatusQuery || undefined
      }
    )
      .then((items) => {
        if (controller.signal.aborted) return
        setRuns(items)
        setRunsLoadedKey(runsQueryKey)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRunsError(
            error instanceof Error
              ? error.message
              : `Unable to load ${componentTypeLabel[componentType].toLowerCase()} runs.`
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunsLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, dbId, isEndpointActive, componentType, selectedSessionId, selectedSession, sessionsLoading, createdAfterQuery, createdBeforeQuery, invalidCreatedAfterQuery, invalidCreatedBeforeQuery, runStatusQuery, unsupportedRunStatusQuery, refreshKey, runsQueryKey])

  const applyRunFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const createdAfter = toUtcIsoString(createdAfterInput)
    const createdBefore = toUtcIsoString(createdBeforeInput)
    if (createdAfterInput && !createdAfter) {
      setRunFilterError('Enter a valid start date and time.')
      return
    }
    if (createdBeforeInput && !createdBefore) {
      setRunFilterError('Enter a valid end date and time.')
      return
    }
    if (createdAfter && createdBefore && new Date(createdAfter) > new Date(createdBefore)) {
      setRunFilterError('The start date must be earlier than the end date.')
      return
    }

    const runStatus = normalizeRunStatus(runStatusInput)
    if (runStatusInput.trim() && !runStatus) {
      setRunFilterError(`Unsupported status. Use: ${RUN_STATUS_VALUES.join(', ')}.`)
      return
    }

    setRunFilterError('')
    void setCreatedAfterQuery(createdAfter)
    void setCreatedBeforeQuery(createdBefore)
    void setRunStatusQuery(runStatus)
    void setSelectedRunId(null)
  }

  const clearRunFilters = () => {
    setCreatedAfterInput('')
    setCreatedBeforeInput('')
    setRunStatusInput('')
    setRunFilterError('')
    void setCreatedAfterQuery(null)
    void setCreatedBeforeQuery(null)
    void setRunStatusQuery(null)
    void setSelectedRunId(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    setCompactions([])
    setCompactionsError('')
    setCompactionsLoading(true)

    if (!isEndpointActive || !selectedSessionId || sessionsLoading || !selectedSession) {
      setCompactionsLoading(false)
      return () => controller.abort()
    }

    getSessionCompactionsAPI(
      selectedEndpoint,
      componentType,
      selectedSessionId,
      dbId || undefined,
      authToken,
      controller.signal
    )
      .then((items) => {
        if (!controller.signal.aborted) setCompactions(items)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCompactionsError(
            error instanceof Error ? error.message : 'Unable to load session compactions.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCompactionsLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, dbId, isEndpointActive, componentType, selectedSessionId, selectedSession, sessionsLoading, refreshKey])

  useEffect(() => {
    if (
      !isEndpointActive ||
      runsLoading ||
      runsLoadedKey !== runsQueryKey ||
      runsError ||
      selectedRunId ||
      runs.length === 0
    ) {
      return
    }
    void setSelectedRunId(runs[0].run_id)
  }, [isEndpointActive, runs, runsError, runsLoadedKey, runsLoading, runsQueryKey, selectedRunId, setSelectedRunId])

  useEffect(() => {
    const controller = new AbortController()
    setRunDetails(null)
    setRunDetailsError('')
    setRunDetailsLoading(true)

    if (!isEndpointActive || !selectedSessionId || !selectedSession || !selectedRunId) {
      setRunDetailsLoading(false)
      return () => controller.abort()
    }

    getSessionRunAPI(
      selectedEndpoint,
      componentType,
      selectedSessionId,
      selectedRunId,
      dbId || undefined,
      authToken,
      controller.signal
    )
      .then((run) => {
        if (!controller.signal.aborted) setRunDetails(run)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRunDetailsError(
            error instanceof Error ? error.message : 'Unable to load run details.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunDetailsLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, dbId, isEndpointActive, componentType, selectedSessionId, selectedSession, selectedRunId, refreshKey])

  const databaseIds = Array.from(
    new Set([
      ...sessionDatabaseIds,
      ...components.flatMap((component) => (component.db_id ? [component.db_id] : [])),
      ...(dbId ? [dbId] : [])
    ])
  ).sort((left, right) => left.localeCompare(right))
  const pageCount = Math.max(1, pagination?.total_pages || 1)
  const openRunTraces = (runId: string) => {
    setActiveView('observability')
    void setViewQuery('observability')
    void setObservabilityViewQuery('traces')
    void setTracePageQuery(1)
    void setTraceRunQuery(runId)
    void setTraceSessionQuery(null)
    void setTraceStatusQuery(null)
    void setTraceIdQuery(null)
  }
  const runSummary = runDetails
    ? componentType === 'workflow'
      ? [
          ['Step results', countValue(runDetails.step_results)],
          ['Executor runs', countValue(runDetails.step_executor_runs)],
          ['Events', countValue(runDetails.events)],
          [
            'Pause state',
            runDetails.paused_step_name || runDetails.pause_kind || 'Not paused'
          ]
        ]
      : [
          ['Messages', countValue(runDetails.messages)],
          ['Tool calls', countValue(runDetails.tools)],
          ['Events', countValue(runDetails.events)],
          [
            'Metrics',
            runDetails.metrics === undefined || runDetails.metrics === null
              ? 'Not returned'
              : 'Returned'
          ]
        ]
    : []

  return (
    <main className="m-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <History className="size-5 shrink-0 text-primary" />
            <h1 className="text-lg font-medium text-primary">Sessions &amp; Runs</h1>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            Browse Agent, Team and Workflow sessions with their recorded runs.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      {!isEndpointActive && !componentsLoading ? (
        <div className="flex min-h-48 flex-1 items-center justify-center px-5 text-center text-sm text-muted">
          Connect to AgentOS to browse sessions and runs.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-w-0 grid-cols-1 gap-4 p-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="min-w-0 rounded-xl border border-primary/10 bg-primaryAccent/30 p-4">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                Session type
                <select
                  value={componentType}
                  onChange={(event) => {
                    const nextType = event.target.value as SessionComponentType
                    void setSessionTypeQuery(nextType)
                    void setComponentIdQuery(null)
                    void setSelectedSessionId(null)
                    void setSelectedRunId(null)
                    void setPage(1)
                    setComponents([])
                    setComponentsLoading(true)
                  }}
                  disabled={componentsLoading}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="agent">Agent</option>
                  <option value="team">Team</option>
                  <option value="workflow">Workflow</option>
                </select>
              </label>

              <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted">
                {componentTypeLabel[componentType]}
                <select
                  value={selectedComponent ? selectedComponentId : ''}
                  onChange={(event) => {
                    void setComponentIdQuery(event.target.value || null)
                    void setSelectedSessionId(null)
                    void setSelectedRunId(null)
                    void setPage(1)
                  }}
                  disabled={componentsLoading || components.length === 0}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {componentsLoading && (
                    <option value="">Loading {componentTypeLabel[componentType].toLowerCase()}s…</option>
                  )}
                  {!componentsLoading && components.length > 0 && !selectedComponent && (
                    <option value="">
                      {selectedComponentId
                        ? `${componentTypeLabel[componentType]} not found`
                        : `Select a ${componentTypeLabel[componentType].toLowerCase()}`}
                    </option>
                  )}
                  {!componentsLoading && components.length === 0 && (
                    <option value="">No {componentTypeLabel[componentType].toLowerCase()}s available</option>
                  )}
                  {components.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name || component.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted">
                Database
                <select
                  value={dbId || ''}
                  onChange={(event) => {
                    void setDbId(event.target.value || null)
                    void setPage(1)
                    void setSelectedSessionId(null)
                    void setSelectedRunId(null)
                  }}
                  disabled={databasesLoading}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">AgentOS default</option>
                  {databaseIds.map((databaseId) => (
                    <option key={databaseId} value={databaseId}>
                      {databaseId}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] normal-case leading-4 text-muted">
                  Filters sessions and run details by the selected DB.
                </span>
              </label>

              {databasesError && (
                <p role="status" className="mt-2 break-words text-[10px] text-destructive">
                  Database list unavailable; AgentOS default remains usable. {databasesError}
                </p>
              )}

              {componentsError && (
                <div className="mt-3">
                  <ErrorState
                    message={componentsError}
                    onRetry={() => setRefreshKey((current) => current + 1)}
                  />
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-primary">
                  Sessions
                </h2>
                <span className="text-[10px] text-muted">
                  {pagination?.total_count ?? (sessionsLoading ? '…' : 0)} total
                </span>
              </div>

              {sessionsLoading ? (
                <p className="py-5 text-xs text-muted">
                  Loading {componentTypeLabel[componentType].toLowerCase()} sessions…
                </p>
              ) : sessionsError ? (
                <div className="mt-3">
                  <ErrorState
                    message={sessionsError}
                    onRetry={() => setRefreshKey((current) => current + 1)}
                  />
                </div>
              ) : componentNotFound ? (
                <p role="status" className="py-5 text-xs leading-5 text-muted">
                  The requested {componentTypeLabel[componentType].toLowerCase()} was not found in this AgentOS. Choose another component to continue.
                </p>
              ) : sessions.length === 0 ? (
                <p className="py-5 text-xs leading-5 text-muted">
                  {sessionNotFound
                    ? 'The requested session was not found in this database or page. Choose another session to continue.'
                    : selectedComponentId
                      ? `No ${componentTypeLabel[componentType].toLowerCase()} sessions found for this component.`
                      : `Select a ${componentTypeLabel[componentType].toLowerCase()} to view its recorded sessions.`}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {sessionNotFound && (
                    <p role="status" className="rounded-lg border border-primary/10 p-2 text-[10px] leading-4 text-muted">
                      The requested session is not on this page or is not available in the selected database. Choose a session below.
                    </p>
                  )}
                  {sessions.map((session) => (
                    <button
                      key={session.session_id}
                      type="button"
                      onClick={() => {
                        void setSelectedSessionId(session.session_id)
                        void setSelectedRunId(null)
                      }}
                      aria-pressed={selectedSessionId === session.session_id}
                      className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selectedSessionId === session.session_id ? 'border-primary/40 bg-accent' : 'border-primary/10 bg-background hover:bg-accent/60'}`}
                    >
                      <span className="block break-words text-sm font-medium text-primary">
                        {session.session_name || 'Unnamed session'}
                      </span>
                      <span className="mt-1 block break-all font-mono text-[10px] text-muted">
                        {session.session_id}
                      </span>
                      <span className="mt-2 flex items-center gap-1 text-[10px] text-muted">
                        <Clock3 className="size-3 shrink-0" />
                        {formatTimestamp(session.created_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-primary/10 pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1 || sessionsLoading}
                  onClick={() => {
                    void setPage(Math.max(1, page - 1))
                    void setSelectedSessionId(null)
                    void setSelectedRunId(null)
                  }}
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <span className="text-[10px] text-muted">
                  Page {pagination?.page ?? page} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page >= pageCount || sessionsLoading}
                  onClick={() => {
                    void setPage(Math.min(pageCount, page + 1))
                    void setSelectedSessionId(null)
                    void setSelectedRunId(null)
                  }}
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              {selectedSession ? (
                <div className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                        {componentTypeLabel[componentType]} session
                      </div>
                      <h2 className="mt-1 break-words text-base font-medium text-primary">
                        {selectedSession.session_name || 'Unnamed session'}
                      </h2>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted">
                        {selectedSession.session_id}
                      </p>
                    </div>
                    <div className="text-right text-[10px] text-muted">
                      <div>{selectedComponent?.name || selectedComponentId}</div>
                      <div className="mt-1 break-all font-mono">{selectedComponentId}</div>
                      <div className="mt-1 break-all">DB {dbId || 'AgentOS default'}</div>
                      <div className="mt-1">
                        {formatTimestamp(selectedSession.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <JsonDisclosure label="Full session record" value={selectedSession} />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
                  {sessionNotFound
                    ? 'The selected session was not found for the current database and page. Select another session from the list.'
                    : sessionsLoading
                      ? 'Loading sessions…'
                      : `Select a session to inspect its ${componentTypeLabel[componentType].toLowerCase()} runs.`}
                </div>
              )}

              {selectedSessionId && selectedSession && (
                <section className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5" aria-labelledby="session-compactions-heading">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id="session-compactions-heading" className="text-sm font-medium text-primary">
                        Session compactions
                      </h2>
                      <p className="mt-1 text-[11px] text-muted">
                        Context history compaction metadata returned by AgentOS 3.2.1.
                      </p>
                    </div>
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-muted">
                      {compactionsLoading ? 'Loading' : compactionsError ? 'Error' : `${compactions.length} recorded`}
                    </span>
                  </div>
                  {compactionsLoading ? (
                    <p className="mt-3 rounded-lg border border-primary/10 bg-background p-3 text-xs text-muted">
                      Loading session compactions…
                    </p>
                  ) : compactionsError ? (
                    <div className="mt-3">
                      <ErrorState
                        message={compactionsError}
                        onRetry={() => setRefreshKey((current) => current + 1)}
                      />
                    </div>
                  ) : compactions.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-primary/10 bg-background p-3 text-xs text-muted">
                      No compactions are recorded for this session.
                    </p>
                  ) : (
                    <ul className="mt-3 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
                      {compactions.map((compaction, index) => (
                        <li key={compaction.id || `${compaction.run_id || 'compaction'}-${index}`} className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-primary">Compaction {index + 1}</span>
                            <span className="text-[10px] text-muted">{compaction.archived ? 'Archived history available' : 'Archived history unavailable'}</span>
                          </div>
                          <dl className="mt-2 grid min-w-0 grid-cols-2 gap-2 text-[10px]">
                            <div className="min-w-0"><dt className="text-muted">Messages compacted</dt><dd className="mt-0.5 break-words text-primary">{compaction.messages_compacted ?? 'Not returned'}</dd></div>
                            <div className="min-w-0"><dt className="text-muted">Tokens before → after</dt><dd className="mt-0.5 break-words text-primary">{compaction.tokens_before ?? '—'} → {compaction.tokens_after ?? '—'}</dd></div>
                            <div className="col-span-2 min-w-0"><dt className="text-muted">Created</dt><dd className="mt-0.5 break-words text-primary">{compaction.created_at ? new Date(compaction.created_at).toLocaleString() : 'Time not recorded'}</dd></div>
                            {compaction.run_id && <div className="col-span-2 min-w-0"><dt className="text-muted">Run ID</dt><dd className="mt-0.5 break-all font-mono text-primary">{compaction.run_id}</dd></div>}
                          </dl>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[10px] text-muted">
                    This API returns compaction metadata only; it does not expose summary text or archived messages.
                  </p>
                </section>
              )}

              {selectedSessionId && selectedSession && (
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
                  <aside className="min-w-0 rounded-xl border border-primary/10 bg-primaryAccent/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-primary">
                        Runs
                      </h2>
                      <span className="text-[10px] text-muted">{runs.length}</span>
                    </div>
                    <form className="mt-3 space-y-2 border-b border-primary/10 pb-3" onSubmit={applyRunFilters}>
                      <label className="block text-[10px] font-medium text-muted">
                        Status
                        <input
                          type="text"
                          value={runStatusInput}
                          onChange={(event) => setRunStatusInput(event.target.value)}
                          placeholder="Exact AgentOS status"
                          aria-label="Filter runs by exact status"
                          className="mt-1 h-9 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-2 text-xs normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </label>
                      <label className="block text-[10px] font-medium text-muted">
                        Created after
                        <input
                          type="datetime-local"
                          value={createdAfterInput}
                          onChange={(event) => setCreatedAfterInput(event.target.value)}
                          aria-label="Filter runs created after this local date and time"
                          className="mt-1 h-9 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-2 text-xs normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </label>
                      <label className="block text-[10px] font-medium text-muted">
                        Created before
                        <input
                          type="datetime-local"
                          value={createdBeforeInput}
                          onChange={(event) => setCreatedBeforeInput(event.target.value)}
                          aria-label="Filter runs created before this local date and time"
                          className="mt-1 h-9 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-2 text-xs normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </label>
                      <p className="text-[9px] leading-4 text-muted">
                        AgentOS statuses: {RUN_STATUS_VALUES.join(', ')}.
                      </p>
                      <p className="text-[9px] leading-4 text-muted">
                        Local times are sent to AgentOS as UTC. Filters apply to this session’s runs.
                      </p>
                      {runFilterError && (
                        <p role="alert" className="text-[10px] leading-4 text-destructive">
                          {runFilterError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" variant="outline" size="sm" disabled={runsLoading}>
                          Apply filters
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!hasActiveRunFilters && !createdAfterInput && !createdBeforeInput && !runStatusInput}
                          onClick={clearRunFilters}
                        >
                          Clear
                        </Button>
                      </div>
                    </form>
                    {runsLoading ? (
                      <p className="py-5 text-xs text-muted">Loading runs…</p>
                    ) : unsupportedRunStatusQuery ? (
                      <p role="alert" className="py-5 text-xs text-destructive">
                        Unsupported AgentOS status. Use: {RUN_STATUS_VALUES.join(', ')}.
                      </p>
                    ) : runsError ? (
                      <div className="mt-3">
                        <ErrorState
                          message={runsError}
                          onRetry={() => setRefreshKey((current) => current + 1)}
                        />
                      </div>
                    ) : runs.length === 0 ? (
                      <p className="py-5 text-xs text-muted">
                        {hasActiveRunFilters
                          ? 'No runs match the selected status and date filters.'
                          : 'No runs are recorded for this session.'}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {runs.map((run) => (
                          <button
                            key={run.run_id}
                            type="button"
                            onClick={() => void setSelectedRunId(run.run_id)}
                            aria-pressed={selectedRunId === run.run_id}
                            className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selectedRunId === run.run_id ? 'border-primary/40 bg-accent' : 'border-primary/10 bg-background hover:bg-accent/60'}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-medium text-primary">
                                {componentTypeLabel[componentType]} run
                              </span>
                              <StatusBadge status={run.status} />
                            </div>
                            <span className="mt-2 block break-all font-mono text-[10px] text-muted">
                              {run.run_id}
                            </span>
                            <span className="mt-2 block text-[10px] text-muted">
                              {formatTimestamp(run.created_at)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </aside>

                  <div className="min-w-0 space-y-4">
                    {runDetailsError && (
                      <ErrorState
                        message={runDetailsError}
                        onRetry={() => setRefreshKey((current) => current + 1)}
                      />
                    )}
                    {runDetailsLoading ? (
                      <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
                        Loading run details…
                      </div>
                    ) : runDetails ? (
                      <>
                        <div className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                                Run details
                              </div>
                              <h2 className="mt-1 break-all font-mono text-sm text-primary">
                                {runDetails.run_id}
                              </h2>
                              <p className="mt-1 break-words text-xs text-muted">
                                {selectedComponent?.name || runDetails.workflow_id || runDetails.agent_id || runDetails.team_id || selectedComponentId}
                                {' · '}
                                {formatTimestamp(runDetails.created_at)}
                              </p>
                            </div>
                            <StatusBadge status={runDetails.status} />
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => openRunTraces(runDetails.run_id)}
                          >
                            <Activity className="size-3.5" /> View traces for this run
                          </Button>

                          <div className="mt-4 grid grid-cols-2 gap-2 2xl:grid-cols-4">
                            {runSummary.map(([label, value]) => (
                              <div
                                key={label}
                                className="min-w-0 rounded-lg border border-primary/10 bg-primaryAccent/30 p-3"
                              >
                                <div className="text-[10px] uppercase text-muted">
                                  {label}
                                </div>
                                <div className="mt-1 break-words text-base font-medium text-primary">
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {componentType === 'workflow' ? (
                          <div className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-medium uppercase tracking-wide text-primary">
                              Workflow step results
                            </h3>
                            <span className="text-[10px] text-muted">
                              {selectedRun?.status || runDetails.status || 'Status unavailable'}
                            </span>
                          </div>
                          {runDetails.step_results?.length ? (
                            <div className="mt-3 space-y-2">
                              {runDetails.step_results.map((step, index) => (
                                <details
                                  key={`${step.step_id || step.step_name || 'step'}-${index}`}
                                  className="min-w-0 rounded-xl border border-primary/10 bg-primaryAccent/20"
                                >
                                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3">
                                    <span className="min-w-0 break-words text-sm font-medium text-primary">
                                      {step.step_name || step.executor_name || `Step ${index + 1}`}
                                    </span>
                                    <StatusBadge status={stepStatus(step)} />
                                  </summary>
                                  <div className="space-y-3 border-t border-primary/10 p-3">
                                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                      <div>
                                        <span className="text-muted">Type: </span>
                                        <span className="break-words text-primary">
                                          {step.step_type || step.executor_type || 'Not returned'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-muted">Executor: </span>
                                        <span className="break-words text-primary">
                                          {step.executor_name || 'Not returned'}
                                        </span>
                                      </div>
                                    </div>
                                    {step.error && (
                                      <p className="break-words rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                                        {step.error}
                                      </p>
                                    )}
                                    {step.content !== undefined && (
                                      <JsonDisclosure label="Step output" value={step.content} />
                                    )}
                                    <JsonDisclosure label="Full step result" value={step} />
                                  </div>
                                </details>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-muted">
                              AgentOS did not return step results for this run.
                            </p>
                          )}
                          </div>
                        ) : (
                          <div className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5">
                            <h3 className="text-xs font-medium uppercase tracking-wide text-primary">
                              {componentTypeLabel[componentType]} run data
                            </h3>
                            <p className="mt-2 text-xs leading-5 text-muted">
                              AgentOS returns message, tool and runtime data for this run. Fields not present in the response remain marked as unavailable.
                            </p>
                            <div className="mt-3 space-y-2">
                              {runDetails.messages !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('Messages', runDetails.messages)}
                                  value={runDetails.messages}
                                />
                              )}
                              {runDetails.tools !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('Tool calls', runDetails.tools)}
                                  value={runDetails.tools}
                                />
                              )}
                              {runDetails.events !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('Events', runDetails.events)}
                                  value={runDetails.events}
                                />
                              )}
                              {runDetails.reasoning_steps !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('Reasoning steps', runDetails.reasoning_steps)}
                                  value={runDetails.reasoning_steps}
                                />
                              )}
                              {runDetails.references !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('References', runDetails.references)}
                                  value={runDetails.references}
                                />
                              )}
                              {runDetails.citations !== undefined && (
                                <JsonDisclosure
                                  label={disclosureLabel('Citations', runDetails.citations)}
                                  value={runDetails.citations}
                                />
                              )}
                              {runDetails.session_state !== undefined && (
                                <JsonDisclosure label="Session state" value={runDetails.session_state} />
                              )}
                            </div>
                          </div>
                        )}

                        {runDetails.content !== undefined && (
                          <JsonDisclosure label="Run output" value={runDetails.content} />
                        )}
                        {runDetails.run_input !== undefined && (
                          <JsonDisclosure label="Run input" value={runDetails.run_input} />
                        )}
                        <JsonDisclosure
                          label={`Full ${componentTypeLabel[componentType]} run response`}
                          value={runDetails}
                        />
                      </>
                    ) : !runsLoading && !runsError ? (
                      <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
                        {runs.length === 0
                          ? 'Select another session to inspect its runs.'
                          : 'Select a run to inspect its details.'}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  )
}

export default RunExplorer
