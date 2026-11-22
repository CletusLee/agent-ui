'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowUpRight, Boxes, Database, History, LayoutDashboard, RefreshCw, Users, Workflow } from 'lucide-react'
import { useQueryState } from 'nuqs'

import {
  getAgentOSConfigSummaryAPI,
  getAgentOSCapabilityStatusAPI,
  getAgentOSHealthAPI,
  getAgentOSInfoAPI,
  getFactoryRevisionAPI,
  getRecentSessionsAPI
} from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  AgentOSConfigSummary,
  AgentOSHealth,
  AgentOSInfo,
  FactoryRevision,
  OverviewSession
} from '@/types/os'

type SourceState<T> = {
  status: 'loading' | 'success' | 'error'
  data?: T
  error?: string
  checkedAt?: string
}

const initialState = <T,>(): SourceState<T> => ({ status: 'loading' })

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'AgentOS request failed.'

const sourceErrorMessage = (error?: string) => {
  const status = error?.match(/\b(401|403|404|5\d\d)\b/)?.[1]
  if (status === '401') return 'Authentication is required to read this source (HTTP 401).'
  if (status === '403') return 'The current Token cannot read this source (HTTP 403).'
  if (status === '404') return 'This source was not found in the current AgentOS (HTTP 404).'
  if (status?.startsWith('5')) return `AgentOS returned HTTP ${status}. Retry this source.`
  return error || 'AgentOS request failed.'
}

const SourcePanel = ({
  title,
  description,
  state,
  onRetry,
  alwaysRenderChildren = false,
  children
}: {
  title: string
  description: string
  state: SourceState<unknown>
  onRetry: () => void
  alwaysRenderChildren?: boolean
  children: ReactNode
}) => (
  <section className='min-w-0 space-y-4 rounded-xl border border-primary/10 bg-card p-4 sm:p-5'>
    <div className='flex min-w-0 items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='text-sm font-semibold text-primary'>{title}</h2>
        <p className='mt-1 break-words text-xs text-muted'>{description}</p>
      </div>
      <span className='shrink-0 rounded-full border border-primary/15 px-2 py-1 text-[10px] uppercase text-muted'>
        {state.status === 'success' ? 'Loaded' : state.status === 'error' ? 'Error' : 'Loading'}
      </span>
    </div>
    {state.status === 'error' && (
      <div role='status' className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3'>
        <p className='min-w-0 break-words text-xs text-destructive'>{sourceErrorMessage(state.error)}</p>
        <Button type='button' variant='outline' size='sm' onClick={onRetry}>
          <RefreshCw className='size-3.5' /> Retry
        </Button>
      </div>
    )}
    {state.status === 'loading' && !state.data && (
      <div className='rounded-lg border border-primary/10 p-4 text-xs text-muted'>Loading {title.toLowerCase()}…</div>
    )}
    {(state.data !== undefined || alwaysRenderChildren) && children}
    {state.checkedAt && (
      <p className='text-[10px] text-muted'>Checked {new Date(state.checkedAt).toLocaleTimeString()}</p>
    )}
  </section>
)

const MetricCard = ({
  label,
  value,
  icon: Icon,
  onClick
}: {
  label: string
  value: string | number
  icon: typeof Boxes
  onClick: () => void
}) => (
  <button
    type='button'
    onClick={onClick}
    className='group min-w-0 rounded-xl border border-primary/10 bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  >
    <span className='flex items-center justify-between gap-2 text-muted'>
      <span className='text-[10px] font-medium uppercase tracking-wide'>{label}</span>
      <Icon className='size-4 shrink-0' />
    </span>
    <span className='mt-2 block break-words text-2xl font-semibold text-primary'>{value}</span>
    <span className='mt-2 inline-flex items-center gap-1 text-[10px] text-muted group-hover:text-primary'>
      Open {label.toLowerCase()} <ArrowUpRight className='size-3' />
    </span>
  </button>
)

const formatTime = (value?: string | number) => {
  if (!value) return 'Time not returned'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

const Overview = () => {
  const { selectedEndpoint, authToken, setActiveView } = useStore()
  const [, setViewQuery] = useQueryState('view')
  const [, setSessionType] = useQueryState('session_type')
  const [, setComponentId] = useQueryState('component_id')
  const [, setSessionId] = useQueryState('session_id')
  const [, setRunId] = useQueryState('run_id')
  const [runDbId, setRunDbId] = useQueryState('db_id')
  const [dbId, setDbId] = useQueryState('overview_db')
  const [health, setHealth] = useState<SourceState<AgentOSHealth>>(initialState)
  const [info, setInfo] = useState<SourceState<AgentOSInfo>>(initialState)
  const [config, setConfig] = useState<SourceState<AgentOSConfigSummary>>(initialState)
  const [revision, setRevision] = useState<SourceState<FactoryRevision>>(initialState)
  const [sessions, setSessions] = useState<SourceState<OverviewSession[]>>(initialState)
  const [approvals, setApprovals] = useState<SourceState<number>>(initialState)
  const [queue, setQueue] = useState<SourceState<number>>(initialState)
  const controllers = useRef(new Map<string, AbortController>())
  const sequences = useRef(new Map<string, number>())

  const loadSource = useCallback(async <T,>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    setState: Dispatch<SetStateAction<SourceState<T>>>,
    options: { clearData?: boolean } = {}
  ) => {
    controllers.current.get(key)?.abort()
    const controller = new AbortController()
    controllers.current.set(key, controller)
    const sequence = (sequences.current.get(key) ?? 0) + 1
    sequences.current.set(key, sequence)
    setState((current) => ({
      status: 'loading',
      ...(!options.clearData && current.data !== undefined ? { data: current.data } : {})
    }))

    try {
      const data = await fetcher(controller.signal)
      if (controller.signal.aborted || sequences.current.get(key) !== sequence) return
      setState({ status: 'success', data, checkedAt: new Date().toISOString() })
    } catch (error) {
      if (controller.signal.aborted || sequences.current.get(key) !== sequence) return
      setState((current) => ({
        status: 'error',
        data: current.data,
        error: getErrorMessage(error),
        checkedAt: new Date().toISOString()
      }))
    }
  }, [])

  const loadHealth = useCallback(
    () => loadSource('health', (signal) => getAgentOSHealthAPI(selectedEndpoint, authToken, signal), setHealth),
    [authToken, loadSource, selectedEndpoint]
  )
  const loadInfo = useCallback(
    () => loadSource('info', (signal) => getAgentOSInfoAPI(selectedEndpoint, authToken, signal), setInfo),
    [authToken, loadSource, selectedEndpoint]
  )
  const loadConfig = useCallback(
    () => loadSource('config', (signal) => getAgentOSConfigSummaryAPI(selectedEndpoint, authToken, signal), setConfig),
    [authToken, loadSource, selectedEndpoint]
  )
  const loadRevision = useCallback(
    () => loadSource('revision', (signal) => getFactoryRevisionAPI(selectedEndpoint, authToken, signal), setRevision),
    [authToken, loadSource, selectedEndpoint]
  )
  const effectiveDbId =
    dbId === 'default'
      ? undefined
      : dbId || runDbId || config.data?.session_db_ids[0]
  const selectedDbId =
    dbId || runDbId || config.data?.session_db_ids[0] || 'default'
  const loadSessions = useCallback(
    (clearData = false) => loadSource(
      'sessions',
      (signal) => getRecentSessionsAPI(selectedEndpoint, effectiveDbId, authToken, signal),
      setSessions,
      { clearData }
    ),
    [authToken, effectiveDbId, loadSource, selectedEndpoint]
  )
  const loadApprovals = useCallback(
    () => loadSource(
      'approvals',
      (signal) => getAgentOSCapabilityStatusAPI(selectedEndpoint, 'approvals', authToken, signal),
      setApprovals
    ),
    [authToken, loadSource, selectedEndpoint]
  )
  const loadQueue = useCallback(
    () => loadSource(
      'queue',
      (signal) => getAgentOSCapabilityStatusAPI(selectedEndpoint, 'queue', authToken, signal),
      setQueue
    ),
    [authToken, loadSource, selectedEndpoint]
  )

  useEffect(() => {
    const activeControllers = controllers.current
    void loadHealth()
    void loadInfo()
    void loadConfig()
    void loadRevision()
    void loadApprovals()
    void loadQueue()
    return () => {
      activeControllers.forEach((controller) => controller.abort())
      activeControllers.clear()
    }
  }, [loadApprovals, loadConfig, loadHealth, loadInfo, loadQueue, loadRevision])

  useEffect(() => {
    const activeControllers = controllers.current
    void loadSessions(true)
    return () => {
      activeControllers.get('sessions')?.abort()
    }
  }, [loadSessions])

  const openView = (view: 'agents' | 'workflows' | 'runs' | 'observability') => {
    setActiveView(view)
    void setViewQuery(view, { history: 'push' })
  }

  const openRuns = async (sessionType: string) => {
    setActiveView('runs')
    await setViewQuery('runs', { history: 'push' })
    await setSessionType(sessionType)
    await setComponentId(null)
    await setSessionId(null)
    await setRunId(null)
    await setRunDbId(effectiveDbId ?? null)
  }

  const openSession = async (session: OverviewSession) => {
    if (!session.component_id || !['agent', 'team', 'workflow'].includes(session.session_type)) {
      await openRuns(session.session_type)
      return
    }
    setActiveView('runs')
    await setViewQuery('runs', { history: 'push' })
    await setSessionType(session.session_type)
    await setComponentId(session.component_id)
    await setSessionId(session.session_id)
    await setRunId(null)
    await setRunDbId(effectiveDbId ?? null)
  }

  const agentCount = config.data?.agents.length
  const teamCount = config.data?.teams.length
  const workflowCount = config.data?.workflows.length
  const lastCheckedValues = [health.checkedAt, info.checkedAt, config.checkedAt, revision.checkedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
  const lastChecked = lastCheckedValues[lastCheckedValues.length - 1]

  return (
    <main className='min-w-0 flex-1 overflow-y-auto bg-background p-4 text-foreground sm:p-6 lg:p-8'>
      <div className='mx-auto w-full max-w-7xl space-y-5'>
        <header className='flex min-w-0 flex-wrap items-start justify-between gap-4'>
          <div className='flex min-w-0 items-start gap-3'>
            <span className='rounded-xl border border-primary/10 bg-card p-2 text-primary'>
              <LayoutDashboard className='size-5' />
            </span>
            <div className='min-w-0'>
              <h1 className='break-words text-lg font-semibold text-primary'>
                {info.data?.name || 'AgentOS Overview'}
              </h1>
              <p className='mt-1 break-words text-xs text-muted'>
                AgentOS deployment status, registered components, and recent sessions.
              </p>
              <p className='mt-1 break-all font-mono text-[10px] text-muted'>{selectedEndpoint}</p>
            </div>
          </div>
          <Button type='button' variant='outline' size='sm' onClick={() => {
            void loadHealth()
            void loadInfo()
            void loadConfig()
            void loadRevision()
            void loadSessions()
            void loadApprovals()
            void loadQueue()
          }}>
            <RefreshCw className='size-3.5' /> Refresh all
          </Button>
        </header>

        <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricCard label='Agents' value={agentCount ?? '—'} icon={Users} onClick={() => openView('agents')} />
          <MetricCard label='Teams' value={teamCount ?? '—'} icon={Users} onClick={() => openView('agents')} />
          <MetricCard label='Workflows' value={workflowCount ?? '—'} icon={Workflow} onClick={() => openView('workflows')} />
          <MetricCard label='Recent sessions' value={sessions.data?.length ?? '—'} icon={History} onClick={() => void openRuns(sessions.data?.[0]?.session_type || 'workflow')} />
        </div>

        <div className='grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2'>
          <SourcePanel
            title='AgentOS health'
            description='GET /health'
            state={health}
            onRetry={() => void loadHealth()}
          >
            <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <p className='text-[10px] uppercase tracking-wide text-muted'>Health</p>
                <p className='mt-1 break-words text-lg font-semibold text-primary'>{health.data?.status?.toUpperCase() || 'Unknown'}</p>
              </div>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <p className='text-[10px] uppercase tracking-wide text-muted'>Agno version</p>
                <p className='mt-1 break-words text-lg font-semibold text-primary'>{info.data?.agno_version || 'Not returned'}</p>
              </div>
            </div>
          </SourcePanel>

          <SourcePanel
            title='AgentOS runtime'
            description='GET /info'
            state={info}
            onRetry={() => void loadInfo()}
          >
            <dl className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <dt className='text-[10px] uppercase tracking-wide text-muted'>Agno version</dt>
                <dd className='mt-1 break-words text-lg font-semibold text-primary'>{info.data?.agno_version || 'Not returned'}</dd>
              </div>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <dt className='text-[10px] uppercase tracking-wide text-muted'>AgentOS ID</dt>
                <dd className='mt-1 break-all font-mono text-xs text-primary'>{info.data?.os_id || 'Not returned'}</dd>
              </div>
            </dl>
          </SourcePanel>

          <SourcePanel
            title='Factory deployment'
            description='GET /factory/revision'
            state={revision}
            onRetry={() => void loadRevision()}
          >
            <dl className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='min-w-0 rounded-lg border border-primary/10 bg-background p-3 sm:col-span-2'>
                <dt className='text-[10px] uppercase tracking-wide text-muted'>Definition revision</dt>
                <dd className='mt-1 break-all font-mono text-sm text-primary'>{revision.data?.revision || 'Not returned'}</dd>
              </div>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <dt className='text-[10px] uppercase tracking-wide text-muted'>Updated</dt>
                <dd className='mt-1 break-words text-sm text-primary'>{lastChecked ? new Date(lastChecked).toLocaleString() : 'Not checked'}</dd>
              </div>
              <div className='rounded-lg border border-primary/10 bg-background p-3'>
                <dt className='text-[10px] uppercase tracking-wide text-muted'>Session databases</dt>
                <dd className='mt-1 break-words text-sm text-primary'>{config.data?.session_db_ids.length ?? 'Unavailable'}</dd>
              </div>
            </dl>
          </SourcePanel>

          <SourcePanel
            title='Recent sessions'
            description='GET /sessions · newest updated sessions from the selected database'
            state={sessions}
            onRetry={() => void loadSessions()}
            alwaysRenderChildren
          >
            <label className='flex min-w-0 flex-col gap-1 text-xs text-muted'>
              Session database
              <select
                value={selectedDbId}
                onChange={(event) => void setDbId(event.target.value || 'default')}
                className='w-full rounded-md border border-primary/15 bg-background px-3 py-2 text-sm text-primary'
              >
                <option value='default'>AgentOS default</option>
                {config.data?.session_db_ids.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {selectedDbId !== 'default' && !config.data?.session_db_ids.includes(selectedDbId) && (
                  <option value={selectedDbId}>
                    {selectedDbId}{config.data ? ' (not listed in config)' : ' (from URL)'}
                  </option>
                )}
              </select>
              {!config.data && (
                <span role='status'>
                  {config.status === 'error'
                    ? 'Database options are unavailable; the current URL selection is kept.'
                    : 'Loading database options; the current URL selection is kept.'}
                </span>
              )}
            </label>
            {sessions.data?.length ? (
              <ul className='divide-y divide-primary/10 rounded-lg border border-primary/10'>
                {sessions.data.map((session) => (
                  <li key={session.session_id} className='flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <p className='line-clamp-2 break-words text-sm font-medium text-primary'>
                        {session.session_name?.trim() || 'Untitled session'}
                      </p>
                      <p className='mt-1 break-words text-xs text-muted'>
                        {session.session_type} · {session.component_id || 'component not returned'} · {formatTime(session.updated_at || session.created_at)}
                      </p>
                      <p className='mt-1 break-all font-mono text-[10px] text-muted'>{session.session_id}</p>
                    </div>
                    <Button type='button' variant='outline' size='sm' className='shrink-0' onClick={() => void openSession(session)}>
                      <History className='size-3.5' /> Open session
                    </Button>
                  </li>
                ))}
              </ul>
            ) : sessions.status === 'success' ? (
              <p className='rounded-lg border border-primary/10 p-4 text-sm text-muted'>No sessions were returned for this database.</p>
            ) : null}
          </SourcePanel>

          <SourcePanel
            title='Pending work sources'
            description='Read-only status checks for GET /approvals and GET /queue; unavailable sources are not treated as empty.'
            state={{
              status: approvals.status === 'error' || queue.status === 'error'
                ? 'error'
                : approvals.status === 'loading' || queue.status === 'loading'
                  ? 'loading'
                  : 'success',
              data: true,
              checkedAt: [approvals.checkedAt, queue.checkedAt].filter(Boolean).sort().slice(-1)[0]
            }}
            onRetry={() => {
              void loadApprovals()
              void loadQueue()
            }}
          >
            <div className='space-y-3'>
              {([
                ['Approvals', approvals, loadApprovals],
                ['Queue', queue, loadQueue]
              ] as const).map(([label, source, retry]) => {
                const statusCode = source.error?.match(/returned (\d{3})/)?.[1]
                const message = source.status === 'loading'
                  ? 'Checking source…'
                  : source.status === 'success'
                    ? `HTTP ${source.data}: endpoint responded, but this OpenAPI operation has no list schema. No pending count is claimed.`
                    : statusCode === '503'
                      ? 'Unavailable in the current AgentOS configuration (HTTP 503). This is not an empty result.'
                      : statusCode === '401'
                        ? 'Authentication is required to check this source (HTTP 401).'
                        : statusCode === '403'
                          ? 'This Token cannot read this source (HTTP 403).'
                          : source.error || 'Source status is unavailable.'
                return (
                  <div key={label} className='flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/10 bg-background p-3'>
                    <div className='min-w-0'>
                      <p className='text-xs font-semibold text-primary'>{label}</p>
                      <p role='status' className={`mt-1 break-words text-xs ${source.status === 'error' ? 'text-destructive' : 'text-muted'}`}>
                        {message}
                      </p>
                    </div>
                    <Button type='button' variant='outline' size='sm' className='shrink-0' onClick={() => void retry()}>
                      <RefreshCw className='size-3.5' /> Retry {label}
                    </Button>
                  </div>
                )
              })}
            </div>
          </SourcePanel>

          <SourcePanel
            title='Registered components'
            description='Safe component names and IDs from GET /config'
            state={config}
            onRetry={() => void loadConfig()}
          >
            {config.data && (
              <div className='space-y-3'>
                <p className='text-xs text-muted'>
                  {config.data.agents.length} agents · {config.data.teams.length} teams · {config.data.workflows.length} workflows
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Button type='button' variant='outline' size='sm' onClick={() => openView('agents')}>
                    <Users className='size-3.5' /> Browse Agents and Teams
                  </Button>
                  <Button type='button' variant='outline' size='sm' onClick={() => openView('workflows')}>
                    <Workflow className='size-3.5' /> Browse Workflows
                  </Button>
                  <Button type='button' variant='outline' size='sm' onClick={() => openView('observability')}>
                    <Database className='size-3.5' /> View observability
                  </Button>
                </div>
              </div>
            )}
          </SourcePanel>
        </div>

        <p className='text-right text-[10px] text-muted'>
          Last source update {lastChecked ? new Date(lastChecked).toLocaleString() : 'not checked'} · recent sessions are limited to 5
        </p>
      </div>
    </main>
  )
}

export default Overview
