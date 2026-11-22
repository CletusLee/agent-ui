'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Boxes, Database, ExternalLink, RefreshCw, Server, Settings2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getAgentOSConfigSummaryAPI,
  getAgentOSEndpointStatusAPI,
  getAgentOSHealthAPI,
  getAgentOSInfoAPI,
  getAgentOSModelsAPI,
  getFactoryRevisionAPI
} from '@/api/os'
import {
  AgentOSConfigSummary,
  AgentOSHealth,
  AgentOSInfo,
  AgentOSModelSummary,
  FactoryRevision
} from '@/types/os'
import { useStore } from '@/store'
import RegistryPanel from '@/components/system/RegistryPanel'

type RequestState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'success'; data: T }
  | { status: 'checked'; data: T }
  | { status: 'error'; error: string; data?: T }
  | { status: 'unknown'; data?: T }

type EndpointCheck = {
  feature: string
  path: string
  state: 'loading' | 'checked' | 'error'
  httpStatus?: number
  error?: string
  checkedAt?: string
}

type ExternalCheck = {
  id: 'langfuse' | 'gateway' | 'backstage'
  httpStatus?: number
  error?: string
  checkedAt: string
}

const managementRoutes = [
  { feature: 'Approvals · F14', path: '/approvals' },
  { feature: 'Schedules · F15', path: '/schedules' },
  { feature: 'Components · F17', path: '/components' },
  { feature: 'Queue · F17', path: '/queue' },
  { feature: 'Service accounts · F17', path: '/service-accounts' },
  { feature: 'Registry · F17', path: '/registry' },
] as const

const endpointStatusMessage = (status?: number, requestError?: string) => {
  if (requestError) return 'Request failed; check AgentOS reachability and retry.'
  if (status === 200) return 'Endpoint is available; this status check did not read any records.'
  if (status === 401) return 'Authentication required; enter an AgentOS token to inspect this capability.'
  if (status === 403) return 'The current token does not have permission for this endpoint.'
  if (status === 404) return 'This route is not available in the current deployment.'
  if (status === 503) return 'AgentOS returned Service Unavailable; this capability may be disabled or require configuration. No records were read.'
  if (status !== undefined && status >= 500) return `AgentOS returned HTTP ${status}; retry after checking the service.`
  return status === undefined ? 'Waiting for the endpoint check.' : `AgentOS returned HTTP ${status}.`
}

const initialState = <T,>(): RequestState<T> => ({ status: 'loading' })

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load this AgentOS source.'

const sessionDatabaseDisplayName = (database: { db_id: string; display_name?: string }) => {
  const displayName = database.display_name?.trim()
  if (!displayName) return 'Database name not returned'
  return displayName === database.db_id ? 'Display name matches database ID' : displayName
}

const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
    <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-1 break-words text-lg font-semibold text-primary">{value}</p>
  </div>
)

const Panel = ({
  title,
  description,
  icon: Icon,
  state,
  onRetry,
  children
}: {
  title: string
  description: string
  icon: typeof Server
  state: RequestState<unknown>
  onRetry: () => void
  children: React.ReactNode
}) => (
  <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-card p-4">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-lg border border-primary/10 bg-background p-2 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-sm font-medium text-primary">{title}</h2>
          <p className="mt-1 break-words text-[11px] text-muted">{description}</p>
        </div>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase ${
        state.status === 'success'
          ? 'border-positive/30 bg-positive/10 text-positive'
          : state.status === 'error'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-primary/20 bg-primary/5 text-muted'
      }`}>
        {state.status === 'success' ? 'Loaded' : state.status === 'checked' ? 'Checked' : state.status === 'error' ? 'Error' : state.status === 'unknown' ? 'Not checked' : 'Loading'}
      </span>
    </div>
    {state.status === 'error' && (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
        <p className="break-words text-xs text-destructive">{state.error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="size-3.5" /> Retry
        </Button>
      </div>
    )}
    {state.status === 'loading' && !state.data ? (
      <div className="rounded-lg border border-primary/10 p-4 text-xs text-muted">Loading {title.toLowerCase()}…</div>
    ) : state.data !== undefined ? children : null}
  </section>
)

const ComponentList = ({
  label,
  items
}: {
  label: string
  items: AgentOSConfigSummary['agents']
}) => (
  <details className="min-w-0 rounded-lg border border-primary/10 bg-background">
    <summary className="cursor-pointer px-3 py-2 text-xs text-primary">
      {label} · {items.length}
    </summary>
    <ul className="max-h-56 space-y-2 overflow-auto border-t border-primary/10 p-3">
      {items.map((item) => (
        <li key={item.id} className="min-w-0 border-b border-primary/5 pb-2 last:border-0 last:pb-0">
          <p className="break-words text-xs text-primary">{item.name || item.id}</p>
          {item.name && <p className="mt-0.5 break-all font-mono text-[10px] text-muted">{item.id}</p>}
          {item.description && <p className="mt-1 break-words text-[10px] text-muted">{item.description}</p>}
        </li>
      ))}
      {items.length === 0 && <li className="text-xs text-muted">No components were returned.</li>}
    </ul>
  </details>
)

const SystemExplorer = () => {
  const { selectedEndpoint, authToken } = useStore()
  const [health, setHealth] = useState<RequestState<AgentOSHealth>>(initialState)
  const [info, setInfo] = useState<RequestState<AgentOSInfo>>(initialState)
  const [config, setConfig] = useState<RequestState<AgentOSConfigSummary>>(initialState)
  const [models, setModels] = useState<RequestState<AgentOSModelSummary[]>>(initialState)
  const [revision, setRevision] = useState<RequestState<FactoryRevision>>(initialState)
  const [management, setManagement] = useState<RequestState<EndpointCheck[]>>({
    status: 'loading',
    data: managementRoutes.map((route) => ({ ...route, state: 'loading' }))
  })
  const [external, setExternal] = useState<RequestState<ExternalCheck[]>>({ status: 'loading' })
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0)
  const deploymentSequence = useRef(0)
  const deploymentController = useRef<AbortController | null>(null)
  const configSequence = useRef(0)
  const configController = useRef<AbortController | null>(null)
  const revisionSequence = useRef(0)
  const revisionController = useRef<AbortController | null>(null)
  const managementSequence = useRef(0)
  const managementController = useRef<AbortController | null>(null)
  const managementRouteControllers = useRef<Record<string, AbortController>>({})
  const externalSequence = useRef(0)
  const externalController = useRef<AbortController | null>(null)

  const loadDeployment = useCallback(async () => {
    deploymentController.current?.abort()
    const controller = new AbortController()
    deploymentController.current = controller
    const currentSequence = ++deploymentSequence.current
    setHealth((current) => ({ status: 'loading', data: current.data }))
    setInfo((current) => ({ status: 'loading', data: current.data }))

    const results = await Promise.allSettled([
      getAgentOSHealthAPI(selectedEndpoint, authToken, controller.signal),
      getAgentOSInfoAPI(selectedEndpoint, authToken, controller.signal)
    ])
    if (controller.signal.aborted || currentSequence !== deploymentSequence.current) return

    const toState = <T,>(result: PromiseSettledResult<T>, data?: T): RequestState<T> =>
      result.status === 'fulfilled'
        ? { status: 'success', data: result.value }
        : { status: 'error', error: errorMessage(result.reason), data }
    setHealth((current) => toState(results[0], current.data))
    setInfo((current) => toState(results[1], current.data))
    setLastChecked(new Date().toLocaleString())
  }, [selectedEndpoint, authToken])

  const loadConfig = useCallback(async (includeModelsSource = false) => {
    configController.current?.abort()
    const controller = new AbortController()
    configController.current = controller
    const currentSequence = ++configSequence.current
    setConfig((current) => ({ status: 'loading', data: current.data }))
    setModels((current) => ({ status: 'loading', data: current.data }))
    const modelProbe = includeModelsSource
      ? getAgentOSModelsAPI(selectedEndpoint, authToken, controller.signal).then(
          (data) => ({ status: 'success' as const, data }),
          (error: unknown) => ({ status: 'error' as const, error })
        )
      : null

    try {
      const result = await getAgentOSConfigSummaryAPI(selectedEndpoint, authToken, controller.signal)
      if (controller.signal.aborted || currentSequence !== configSequence.current) return
      setConfig({ status: 'success', data: result })

      if (result.available_models !== undefined) {
        setModels({ status: 'success', data: result.available_models })
        if (modelProbe) await modelProbe
      } else if (modelProbe) {
        const probe = await modelProbe
        if (controller.signal.aborted || currentSequence !== configSequence.current) return
        setModels((current) => probe.status === 'success'
          ? { status: 'success', data: probe.data }
          : { status: 'error', error: errorMessage(probe.error), data: current.data })
      } else {
        try {
          const modelResult = await getAgentOSModelsAPI(selectedEndpoint, authToken, controller.signal)
          if (controller.signal.aborted || currentSequence !== configSequence.current) return
          setModels({ status: 'success', data: modelResult })
        } catch (error) {
          if (controller.signal.aborted || currentSequence !== configSequence.current) return
          setModels((current) => ({ status: 'error', error: errorMessage(error), data: current.data }))
        }
      }
    } catch (error) {
      if (controller.signal.aborted || currentSequence !== configSequence.current) return
      setConfig((current) => ({ status: 'error', error: errorMessage(error), data: current.data }))
      if (modelProbe) {
        const probe = await modelProbe
        if (controller.signal.aborted || currentSequence !== configSequence.current) return
        setModels((current) => probe.status === 'success'
          ? { status: 'success', data: probe.data }
          : { status: 'error', error: errorMessage(probe.error), data: current.data })
      } else {
        try {
          const modelResult = await getAgentOSModelsAPI(selectedEndpoint, authToken, controller.signal)
          if (controller.signal.aborted || currentSequence !== configSequence.current) return
          setModels({ status: 'success', data: modelResult })
        } catch (modelError) {
          if (controller.signal.aborted || currentSequence !== configSequence.current) return
          setModels((current) => ({ status: 'error', error: errorMessage(modelError), data: current.data }))
        }
      }
    }
    if (controller.signal.aborted || currentSequence !== configSequence.current) return
    setLastChecked(new Date().toLocaleString())
  }, [selectedEndpoint, authToken])

  const loadRevision = useCallback(async () => {
    revisionController.current?.abort()
    const controller = new AbortController()
    revisionController.current = controller
    const currentSequence = ++revisionSequence.current
    setRevision((current) => ({ status: 'loading', data: current.data }))

    try {
      const result = await getFactoryRevisionAPI(selectedEndpoint, authToken, controller.signal)
      if (controller.signal.aborted || currentSequence !== revisionSequence.current) return
      setRevision({ status: 'success', data: result })
    } catch (error) {
      if (controller.signal.aborted || currentSequence !== revisionSequence.current) return
      setRevision((current) => ({ status: 'error', error: errorMessage(error), data: current.data }))
    }
    setLastChecked(new Date().toLocaleString())
  }, [selectedEndpoint, authToken])

  const load = useCallback(async () => {
    await Promise.allSettled([loadDeployment(), loadConfig(true), loadRevision()])
  }, [loadDeployment, loadConfig, loadRevision])

  const checkManagement = useCallback(async () => {
    managementController.current?.abort()
    Object.values(managementRouteControllers.current).forEach((controller) => controller.abort())
    managementRouteControllers.current = {}
    const controller = new AbortController()
    managementController.current = controller
    const currentSequence = ++managementSequence.current
    setManagement({
      status: 'loading',
      data: managementRoutes.map((route) => ({ ...route, state: 'loading' }))
    })

    const results = await Promise.allSettled(
      managementRoutes.map((route) =>
        getAgentOSEndpointStatusAPI(selectedEndpoint, route.path, authToken, controller.signal)
      )
    )
    if (controller.signal.aborted || currentSequence !== managementSequence.current) return

    const checkedAt = new Date().toLocaleString()
    const data = managementRoutes.map((route, index) => {
      const result = results[index]
      return result.status === 'fulfilled'
        ? { ...route, state: 'checked' as const, httpStatus: result.value, checkedAt }
        : { ...route, state: 'error' as const, error: errorMessage(result.reason), checkedAt }
    })
    const hasRequestErrors = data.some((item) => item.state === 'error')
    setManagement(
      hasRequestErrors
        ? { status: 'error', error: 'Some capability checks could not reach AgentOS.', data }
        : { status: 'checked', data }
    )
  }, [selectedEndpoint, authToken])

  const checkManagementRoute = useCallback(async (path: string) => {
    const route = managementRoutes.find((item) => item.path === path)
    if (!route) return
    managementRouteControllers.current[path]?.abort()
    const controller = new AbortController()
    managementRouteControllers.current[path] = controller
    setManagement((current) => ({
      status: 'loading',
      data: (current.data ?? managementRoutes.map((item) => ({ ...item, state: 'loading' as const }))).map((item) =>
        item.path === path ? { ...item, state: 'loading' as const, error: undefined } : item
      )
    }))

    try {
      const httpStatus = await getAgentOSEndpointStatusAPI(selectedEndpoint, path, authToken, controller.signal)
      if (controller.signal.aborted) return
      const checkedAt = new Date().toLocaleString()
      setManagement((current) => {
        const data = (current.data ?? []).map((item) =>
          item.path === path ? { ...item, state: 'checked' as const, httpStatus, error: undefined, checkedAt } : item
        )
        return data.some((item) => item.state === 'error')
          ? { status: 'error', error: 'Some capability checks could not reach AgentOS.', data }
          : { status: 'checked', data }
      })
    } catch (error) {
      if (controller.signal.aborted) return
      const checkedAt = new Date().toLocaleString()
      setManagement((current) => {
        const data = (current.data ?? []).map((item) =>
          item.path === path ? { ...item, state: 'error' as const, error: errorMessage(error), checkedAt } : item
        )
        return { status: 'error', error: 'Some capability checks could not reach AgentOS.', data }
      })
    }
  }, [selectedEndpoint, authToken])

  const checkExternal = useCallback(async () => {
    externalController.current?.abort()
    const controller = new AbortController()
    externalController.current = controller
    const currentSequence = ++externalSequence.current
    setExternal((current) => ({ status: 'loading', data: current.data }))

    try {
      const response = await fetch('/api/integrations/status', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      })
      if (!response.ok) throw new Error(`Status probe returned HTTP ${response.status}.`)
      const checks = await response.json() as ExternalCheck[]
      if (controller.signal.aborted || currentSequence !== externalSequence.current) return
      const hasFailures = checks.some((item) => item.error || item.httpStatus === undefined || item.httpStatus < 200 || item.httpStatus >= 300)
      setExternal(hasFailures
        ? { status: 'error', error: 'One or more external service health checks did not return a successful status.', data: checks }
        : { status: 'success', data: checks })
    } catch (error) {
      if (controller.signal.aborted || currentSequence !== externalSequence.current) return
      setExternal({ status: 'error', error: errorMessage(error) })
    }
  }, [])

  useEffect(() => {
    void load()
    void checkManagement()
    void checkExternal()
    return () => {
      deploymentController.current?.abort()
      deploymentSequence.current += 1
      configController.current?.abort()
      configSequence.current += 1
      revisionController.current?.abort()
      revisionSequence.current += 1
      managementController.current?.abort()
      managementSequence.current += 1
      Object.values(managementRouteControllers.current).forEach((controller) => controller.abort())
      managementRouteControllers.current = {}
      externalController.current?.abort()
      externalSequence.current += 1
    }
  }, [load, checkManagement, checkExternal])

  const healthData = health.data
  const infoData = info.data
  const configData = config.data
  const revisionData = revision.data
  const modelData = models.data ?? []
  const componentCount = (items?: AgentOSConfigSummary['agents']) => items?.length ?? '—'
  const healthStatus = healthData?.status?.toUpperCase() || 'UNKNOWN'
  const deploymentErrors = [
    health.status === 'error' ? `/health failed: ${health.error}` : null,
    info.status === 'error' ? `/info failed: ${info.error}` : null,
  ].filter((error): error is string => error !== null)
  const hasDeploymentData = healthData !== undefined || infoData !== undefined
  const deploymentState: RequestState<unknown> = deploymentErrors.length > 0
    ? { status: 'error', error: deploymentErrors.join(' · '), ...(hasDeploymentData ? { data: true } : {}) }
    : health.status === 'loading' || info.status === 'loading'
      ? { status: 'loading', ...(hasDeploymentData ? { data: true } : {}) }
      : { status: 'success', data: true }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl border border-primary/10 bg-card p-2 text-primary">
              <Settings2 className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-lg font-semibold text-primary">System & integrations</h1>
              <p className="mt-1 max-w-3xl break-words text-xs text-muted">
                Read-only AgentOS deployment, registered components, storage, models, and integration visibility.
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted">{selectedEndpoint}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { void load(); void checkManagement(); void checkExternal(); setRegistryRefreshKey((value) => value + 1) }}>
            <RefreshCw className="size-3.5" /> Refresh all
          </Button>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="AgentOS deployment" description="GET /health · GET /info" icon={Server} state={deploymentState} onRetry={() => void loadDeployment()}>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <Metric label="Health" value={healthStatus} />
              <Metric label="Agno version" value={infoData?.agno_version || 'Not returned'} />
              <Metric label="AgentOS ID" value={infoData?.os_id || 'Not returned'} />
              <Metric label="Authentication" value={infoData?.auth_mode || 'Not returned'} />
              <Metric label="Started at" value={healthData?.instantiated_at ? new Date(healthData.instantiated_at).toLocaleString() : 'Not returned'} />
              <Metric label="MCP enabled" value={infoData?.mcp?.enabled === undefined ? 'Not returned' : infoData.mcp.enabled ? 'Yes' : 'No'} />
            </div>
          </Panel>

          <Panel title="Registered components" description="Safe component names and IDs from GET /config" icon={Boxes} state={config} onRetry={() => void loadConfig()}>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
              <Metric label="Agents" value={componentCount(configData?.agents)} />
              <Metric label="Teams" value={componentCount(configData?.teams)} />
              <Metric label="Workflows" value={componentCount(configData?.workflows)} />
            </div>
            <div className="space-y-2">
              {configData && <>
                <ComponentList label="Agents" items={configData.agents} />
                <ComponentList label="Teams" items={configData.teams} />
                <ComponentList label="Workflows" items={configData.workflows} />
              </>}
            </div>
          </Panel>

          <Panel title="Factory registry snapshot" description="GET /factory/revision" icon={Boxes} state={revision} onRetry={() => void loadRevision()}>
            {revisionData && <div className="rounded-lg border border-primary/10 bg-background p-3 text-xs">
              <p className="font-medium text-primary">Factory definitions</p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted">Revision {revisionData.revision || 'Not returned'}</p>
              <p className="mt-1 text-[10px] text-muted">{revisionData.agents ?? '—'} agents · {revisionData.teams ?? '—'} teams · {revisionData.workflows ?? '—'} workflows</p>
            </div>}
          </Panel>

          <Panel title="Session storage" description="Safe projection of GET /config.session.dbs" icon={Database} state={config} onRetry={() => void loadConfig()}>
            <p className="text-xs text-muted">{configData?.session_db_ids.length ?? '—'} session database(s) configured.</p>
            {configData?.session_databases.length ? (
              <ul className="space-y-2">
                {configData.session_databases.map((database) => <li key={database.db_id} className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
                  <p className="break-words text-xs text-primary">{sessionDatabaseDisplayName(database)}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">{database.db_id}</p>
                </li>)}
              </ul>
            ) : configData ? <p className="rounded-lg border border-primary/10 bg-background p-3 text-xs text-muted">No session database IDs were returned.</p> : null}
            <p className="text-[10px] text-muted">Connection URLs, credentials, and unapproved config fields are not displayed.</p>
          </Panel>

          <Panel title="Available models" description="GET /config.available_models · fallback: GET /models" icon={Sparkles} state={models} onRetry={() => void loadConfig()}>
            {modelData.length > 0 ? (
              <ul className="space-y-2">
                {modelData.map((model, index) => <li key={`${model.id || model.model || model.name || 'model'}-${index}`} className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
                  <p className="break-words text-sm font-medium text-primary">{model.name || model.id || model.model || 'Unnamed model'}</p>
                  <p className="mt-1 break-words text-[11px] text-muted">{model.provider || 'Provider not returned'}{model.model && model.model !== model.id ? ` · ${model.model}` : ''}</p>
                </li>)}
              </ul>
            ) : models.status === 'success' ? <p className="rounded-lg border border-primary/10 bg-background p-4 text-xs text-muted">AgentOS returned no available models.</p> : null}
          </Panel>

          <Panel title="AgentOS interfaces" description="Registered interfaces and MCP availability" icon={Activity} state={config} onRetry={() => void loadConfig()}>
            <Metric label="Interfaces" value={configData?.interfaces.length ?? '—'} />
            {configData?.interfaces.length ? configData.interfaces.map((item, index) => <div key={`${item.id || item.name || 'interface'}-${index}`} className="rounded-lg border border-primary/10 bg-background p-3 text-xs text-primary">{item.name || item.id || item.type || 'Interface'}{item.type ? ` · ${item.type}` : ''}</div>) : configData && <p className="rounded-lg border border-primary/10 bg-background p-3 text-xs text-muted">No AgentOS interfaces are registered in this configuration.</p>}
          </Panel>

          <Panel title="Management capability routes" description="Read-only HTTP status checks; response records are not loaded" icon={Settings2} state={management} onRetry={() => void checkManagement()}>
            <div className="space-y-2">
              {management.data?.map((item) => (
                <div key={item.path} className="min-w-0 rounded-lg border border-primary/10 bg-background p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="break-words font-medium text-primary">{item.feature} · GET {item.path}</p>
                    <span className="shrink-0 rounded-full border border-primary/10 px-2 py-1 text-[9px] font-semibold text-muted">
                      {item.state === 'loading' ? 'CHECKING' : item.httpStatus ? `HTTP ${item.httpStatus}` : 'REQUEST ERROR'}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[11px] text-muted">{endpointStatusMessage(item.httpStatus, item.error)}</p>
                  {item.checkedAt && <p className="mt-1 text-[10px] text-muted">Checked {item.checkedAt}</p>}
                  <Button type="button" variant="outline" size="sm" className="mt-2" disabled={item.state === 'loading'} onClick={() => void checkManagementRoute(item.path)}>
                    <RefreshCw className="size-3.5" /> Recheck
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          <RegistryPanel refreshKey={registryRefreshKey} />

          <Panel title="External integrations" description="Read-only health checks from the Agent UI container" icon={ExternalLink} state={external} onRetry={() => void checkExternal()}>
            <div className="space-y-2 text-xs">
              {[
                {
                  id: 'langfuse',
                  name: 'Langfuse',
                  probe: 'GET /api/public/health',
                  description: 'Health only; project and trace correlation are not checked.',
                  links: [
                    { label: 'Open Langfuse', href: 'http://127.0.0.1:3001' },
                    { label: 'Public health endpoint', href: 'http://127.0.0.1:3001/api/public/health' },
                  ],
                },
                {
                  id: 'gateway',
                  name: 'Gateway',
                  probe: 'GET /health',
                  description: 'Health only; the report link opens the existing report.',
                  links: [
                    { label: 'Gateway health', href: 'http://127.0.0.1:7778/health' },
                    { label: 'PAY-482 report', href: 'http://127.0.0.1:7778/report' },
                  ],
                },
                {
                  id: 'backstage',
                  name: 'Backstage',
                  probe: 'GET /healthcheck',
                  description: 'Backend health only; Catalog Graph is a separate Backstage view.',
                  links: [
                    { label: 'Open Backstage catalog', href: 'http://127.0.0.1:7007/' },
                  ],
                },
              ].map((integration) => (
                <div key={integration.name} className="rounded-lg border border-primary/10 bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-primary">{integration.name}</p>
                    {(() => {
                      const check = external.data?.find((item) => item.id === integration.id)
                      const healthy = check?.httpStatus !== undefined && check.httpStatus >= 200 && check.httpStatus < 300 && !check.error
                      return <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold tracking-wide ${healthy ? 'border-positive/30 bg-positive/10 text-positive' : 'border-primary/10 text-muted'}`}>
                        {check?.httpStatus ? `HTTP ${check.httpStatus}` : check?.error ? 'UNREACHABLE' : 'CHECKING'}
                      </span>
                    })()}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{integration.description}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">{integration.probe}</p>
                  {external.data?.find((item) => item.id === integration.id)?.checkedAt && <p className="mt-1 text-[10px] text-muted">Checked {new Date(external.data.find((item) => item.id === integration.id)!.checkedAt).toLocaleString()}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {integration.links.map((link) => (
                      <a key={link.href} className="inline-flex items-center gap-1 text-primary underline underline-offset-2" href={link.href} target="_blank" rel="noreferrer">
                        {link.label}<ExternalLink className="size-3" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              <p className="rounded-lg border border-primary/10 bg-background p-3 text-[11px] text-muted">Health probes run over the Compose network and return status codes only; response records are not loaded. Langfuse project/trace mapping and Backstage catalog contents are not verified.</p>
            </div>
          </Panel>
        </div>

        <footer className="text-[10px] text-muted">
          Sources are fetched independently. A failing source does not hide successful data from other AgentOS endpoints.
          {lastChecked ? ` Last checked ${lastChecked}.` : ''}
        </footer>
      </div>
    </main>
  )
}

export default SystemExplorer
