'use client'
import { Button } from '@/components/ui/button'
import { ModeSelector } from '@/components/chat/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/chat/Sidebar/EntitySelector'
import useChatActions from '@/hooks/useChatActions'
import { useStore } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '@/components/ui/icon'
import { getProviderIcon } from '@/lib/modelProvider'
import Sessions from './Sessions'
import AuthToken from './AuthToken'
import { isValidUrl } from '@/lib/utils'
import { toast } from 'sonner'
import { parseAsString, useQueryStates } from 'nuqs'
import { truncateText } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Bot, Database, History, LayoutDashboard, Settings2, Users, Workflow, Wrench } from 'lucide-react'

const ENDPOINT_PLACEHOLDER = 'NO ENDPOINT ADDED'
const SidebarHeader = () => (
  <div className="flex items-center gap-2">
    <Icon type="agno" size="xs" />
    <span className="text-xs font-medium uppercase text-white">Agent UI</span>
  </div>
)

const NewChatButton = ({
  disabled,
  onClick
}: {
  disabled: boolean
  onClick: () => void
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    size="lg"
    className="h-9 w-full rounded-xl bg-primary text-xs font-medium text-background hover:bg-primary/80"
  >
    <Icon type="plus-icon" size="xs" className="text-background" />
    <span className="uppercase">New Chat</span>
  </Button>
)

type WorkspaceView =
  | 'overview'
  | 'chat'
  | 'workflows'
  | 'agents'
  | 'tools'
  | 'runs'
  | 'data'
  | 'observability'
  | 'system'

const ROUTE_QUERY_KEYS = [
  'view', 'overview_db', 'db_id', 'agent', 'team', 'session', 'session_type',
  'component_id', 'session_id', 'run_id', 'runs_page', 'runs_created_after', 'runs_created_before', 'runs_status', 'catalog', 'factory_kind',
  'factory_id', 'factory_return_team', 'trace_page', 'trace_run_id', 'trace_session_id', 'trace_status',
  'trace_id', 'metrics_start', 'metrics_end', 'metrics_table', 'data_type',
  'data_page', 'knowledge_view', 'observability_view', 'eval_page', 'eval_type',
  'eval_component_type', 'eval_component_id', 'eval_model_id', 'eval_run_id',
  'registry_page', 'registry_type', 'registry_name'
] as const
type RouteQueryKey = (typeof ROUTE_QUERY_KEYS)[number]
type RouteQueryValues = Record<RouteQueryKey, string | null>

const ROUTE_QUERY_RESET = Object.fromEntries(
  ROUTE_QUERY_KEYS.map((key) => [key, null])
) as RouteQueryValues
const ROUTE_QUERY_PARSERS = Object.fromEntries(
  ROUTE_QUERY_KEYS.map((key) => [key, parseAsString])
) as Record<RouteQueryKey, typeof parseAsString>

const VIEW_QUERY_ALLOWLIST: Record<WorkspaceView, readonly RouteQueryKey[]> = {
  overview: ['overview_db'],
  chat: ['agent', 'team', 'session'],
  workflows: ['factory_kind', 'factory_id'],
  agents: ['factory_kind', 'factory_id', 'factory_return_team'],
  tools: ['catalog', 'factory_kind', 'factory_id'],
  runs: ['db_id', 'session_type', 'component_id', 'runs_page', 'runs_created_after', 'runs_created_before', 'runs_status', 'session_id', 'run_id'],
  data: ['db_id', 'data_type', 'data_page', 'knowledge_view'],
  observability: [
    'db_id', 'trace_page', 'trace_run_id', 'trace_session_id', 'trace_status',
    'trace_id', 'metrics_start', 'metrics_end', 'metrics_table', 'observability_view',
    'eval_page', 'eval_type', 'eval_component_type', 'eval_component_id', 'eval_model_id', 'eval_run_id'
  ],
  system: ['registry_page', 'registry_type', 'registry_name']
}

const getCanonicalViewQuery = (
  view: WorkspaceView,
  current: RouteQueryValues,
  overviewDb?: string | null
): RouteQueryValues => {
  const next: RouteQueryValues = { ...ROUTE_QUERY_RESET, view }
  VIEW_QUERY_ALLOWLIST[view].forEach((key) => {
    next[key] = current[key] ?? null
  })
  if (view === 'overview') {
    next.overview_db = overviewDb ?? current.overview_db ?? current.db_id ?? null
  }
  return next
}

const ModelDisplay = ({ model }: { model: string }) => (
  <div className="flex h-9 w-full items-center gap-3 rounded-xl border border-primary/15 bg-accent p-3 text-xs font-medium uppercase text-muted">
    {(() => {
      const icon = getProviderIcon(model)
      return icon ? <Icon type={icon} className="shrink-0" size="xs" /> : null
    })()}
    {model}
  </div>
)

const Endpoint = () => {
  const {
    selectedEndpoint,
    isEndpointActive,
    setSelectedEndpoint,
    setIsEndpointActive,
    setAuthToken,
    setAgents,
    setTeams,
    setSessionsData,
    setSessionsError,
    setIsSessionsLoading,
    setMessages,
    setSelectedModel,
    setMode,
    setIsStreaming,
    streamController,
    setStreamController,
    setStreamingErrorMessage,
    activeView
  } = useStore()
  const { initialize } = useChatActions()
  const [isEditing, setIsEditing] = useState(false)
  const [endpointValue, setEndpointValue] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [routeQuery, setRouteQuery] = useQueryStates(ROUTE_QUERY_PARSERS, { history: 'replace' })

  useEffect(() => {
    setEndpointValue(selectedEndpoint)
    setIsMounted(true)
  }, [selectedEndpoint])

  const getStatusColor = (isActive: boolean) =>
    isActive ? 'bg-positive' : 'bg-destructive'

  const handleSave = async () => {
    if (!isValidUrl(endpointValue)) {
      toast.error('Please enter a valid URL')
      return
    }
    const cleanEndpoint = endpointValue.replace(/\/$/, '').trim()
    if (cleanEndpoint !== selectedEndpoint) {
      streamController?.abort()
      setStreamController(null)
      setIsStreaming(false)
      setIsEndpointActive(false)
      setAuthToken('')
      setStreamingErrorMessage('')
      setAgents([])
      setTeams([])
      setSessionsData([])
      setSessionsError(null)
      setIsSessionsLoading(false)
      setMessages([])
      setSelectedModel('')
      setMode('agent')
      void setRouteQuery({ ...ROUTE_QUERY_RESET, view: routeQuery.view ?? activeView }, { history: 'replace' })
    }
    setSelectedEndpoint(cleanEndpoint)
    setIsEditing(false)
    setIsHovering(false)
  }

  const handleCancel = () => {
    setEndpointValue(selectedEndpoint)
    setIsEditing(false)
    setIsHovering(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleRefresh = async () => {
    setIsRotating(true)
    await initialize()
    setTimeout(() => setIsRotating(false), 500)
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="text-xs font-medium uppercase text-primary">AgentOS</div>
      {isEditing ? (
        <div className="flex w-full items-center gap-1">
          <input
            type="text"
            value={endpointValue}
            onChange={(e) => setEndpointValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex h-9 w-full items-center text-ellipsis rounded-xl border border-primary/15 bg-accent p-3 text-xs font-medium text-muted"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            className="hover:cursor-pointer hover:bg-transparent"
          >
            <Icon type="save" size="xs" />
          </Button>
        </div>
      ) : (
        <div className="flex w-full items-center gap-1">
          <motion.div
            className="relative flex h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-primary/15 bg-accent p-3 uppercase"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => setIsEditing(true)}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <AnimatePresence mode="wait">
              {isHovering ? (
                <motion.div
                  key="endpoint-display-hover"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-primary">
                    <Icon type="edit" size="xxs" /> EDIT AGENTOS
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="endpoint-display"
                  className="absolute inset-0 flex items-center justify-between px-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-xs font-medium text-muted">
                    {isMounted
                      ? truncateText(selectedEndpoint, 21) ||
                        ENDPOINT_PLACEHOLDER
                      : 'http://localhost:7777'}
                  </p>
                  <div
                    className={`size-2 shrink-0 rounded-full ${getStatusColor(isEndpointActive)}`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="hover:cursor-pointer hover:bg-transparent"
          >
            <motion.div
              key={isRotating ? 'rotating' : 'idle'}
              animate={{ rotate: isRotating ? 360 : 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <Icon type="refresh" size="xs" />
            </motion.div>
          </Button>
        </div>
      )}
    </div>
  )
}

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const { clearChat, focusChatInput, initialize } = useChatActions()
  const initializeRef = useRef(initialize)
  initializeRef.current = initialize
  const {
    messages,
    selectedEndpoint,
    authToken,
    isEndpointActive,
    selectedModel,
    hydrated,
    isEndpointLoading,
    activeView,
    setActiveView
  } = useStore()
  const [isMounted, setIsMounted] = useState(false)
  const [routeQuery, setRouteQuery] = useQueryStates(ROUTE_QUERY_PARSERS, { history: 'replace' })
  const routeQueryState = JSON.stringify(routeQuery)

  useEffect(() => {
    const views = [
      'overview',
      'chat',
      'workflows',
      'agents',
      'tools',
      'runs',
      'data',
      'observability',
      'system'
    ] as const
    if (!routeQuery.view) {
      setActiveView(routeQuery.agent || routeQuery.team || routeQuery.session ? 'chat' : 'overview')
    } else if (views.includes(routeQuery.view as (typeof views)[number])) {
      setActiveView(routeQuery.view as (typeof views)[number])
    }
  }, [routeQuery.view, routeQuery.agent, routeQuery.team, routeQuery.session, setActiveView])

  useEffect(() => {
    if (!routeQuery.view) return
    const views: WorkspaceView[] = [
      'overview', 'chat', 'workflows', 'agents', 'tools', 'runs', 'data', 'observability', 'system'
    ]
    if (!views.includes(routeQuery.view as WorkspaceView)) return
    const currentQuery = JSON.parse(routeQueryState) as RouteQueryValues
    const overviewDb = routeQuery.view === 'overview'
      ? currentQuery.overview_db ?? currentQuery.db_id ?? null
      : undefined
    const canonical = getCanonicalViewQuery(routeQuery.view as WorkspaceView, currentQuery, overviewDb)
    if (ROUTE_QUERY_KEYS.some((key) => currentQuery[key] !== canonical[key])) {
      void setRouteQuery(canonical, { history: 'replace' })
    }
  }, [routeQuery.view, routeQueryState, setRouteQuery])

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 639px)')
    const syncSidebar = () => {
      setIsCompact(compactLayout.matches)
      setIsCollapsed(compactLayout.matches)
    }
    syncSidebar()
    compactLayout.addEventListener('change', syncSidebar)
    return () => compactLayout.removeEventListener('change', syncSidebar)
  }, [])

  const selectView = (view: typeof activeView) => {
    setActiveView(view)
    const overviewDb = view === 'overview'
      ? routeQuery.view === 'runs'
        ? routeQuery.db_id ?? 'default'
        : routeQuery.overview_db ?? routeQuery.db_id ?? null
      : undefined
    void setRouteQuery(
      getCanonicalViewQuery(view, routeQuery as RouteQueryValues, overviewDb),
      { history: 'push' }
    )
    if (isCompact) closeCompactSidebar()
  }

  const closeCompactSidebar = useCallback(() => {
    setIsCollapsed(true)
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!isCompact || isCollapsed) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeCompactSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCompact, isCollapsed, closeCompactSidebar])

  useEffect(() => {
    setIsMounted(true)

    if (hydrated) void initializeRef.current()
  }, [selectedEndpoint, authToken, hydrated])

  const handleNewChat = () => {
    clearChat()
    focusChatInput()
  }

  return (
    <>
      {isCompact && !isCollapsed && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={closeCompactSidebar}
          className="fixed inset-0 z-30 cursor-default bg-black/50"
        />
      )}
      <motion.aside
        className={`${isCompact && !isCollapsed ? 'absolute left-0 top-0 z-40 border-r border-border bg-background shadow-xl' : 'relative'} flex h-screen shrink-0 grow-0 flex-col overflow-hidden px-2 py-3 font-dmmono`}
        initial={{ width: '16rem' }}
        animate={{ width: isCollapsed ? '2.5rem' : '16rem' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
      <motion.button
        ref={sidebarToggleRef}
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 z-10 p-1"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
        whileTap={{ scale: 0.95 }}
      >
        <Icon
          type="sheet"
          size="xs"
          className={`transform ${isCollapsed ? 'rotate-180' : 'rotate-0'}`}
        />
      </motion.button>
      {isCollapsed && (
        <nav
          aria-label="Workspace"
          className="mt-10 flex flex-col items-center gap-2"
        >
          {[
            { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
            { id: 'chat', label: 'Chat', Icon: Bot },
            { id: 'workflows', label: 'Workflows', Icon: Workflow },
            { id: 'agents', label: 'Agents', Icon: Users },
            { id: 'tools', label: 'Tools, Skills and Models', Icon: Wrench },
            { id: 'runs', label: 'Sessions and runs', Icon: History },
            { id: 'data', label: 'Knowledge, Memory and Learnings', Icon: Database },
            { id: 'observability', label: 'Traces and metrics', Icon: Activity },
            { id: 'system', label: 'System and integrations', Icon: Settings2 }
          ].map(({ id, label, Icon: ItemIcon }) => (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="icon"
              title={label}
              aria-label={label}
              aria-pressed={activeView === id}
              onClick={() => selectView(id as typeof activeView)}
              className={`size-9 rounded-xl ${activeView === id ? 'bg-accent text-primary' : 'text-muted'}`}
            >
              <ItemIcon className="size-4" />
            </Button>
          ))}
        </nav>
      )}
      <motion.div
        className="w-60 space-y-5"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: isCollapsed ? 0 : 1, x: isCollapsed ? -20 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          pointerEvents: isCollapsed ? 'none' : 'auto'
        }}
      >
        <SidebarHeader />
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Workspace"
        >
          <Button
            variant="ghost"
            onClick={() => selectView('overview')}
            aria-pressed={activeView === 'overview'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'overview' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <LayoutDashboard className="size-4" />
            Overview
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('chat')}
            aria-pressed={activeView === 'chat'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'chat' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Bot className="size-4" />
            Chat
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('workflows')}
            aria-pressed={activeView === 'workflows'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'workflows' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Workflow className="size-4" />
            Workflows
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('agents')}
            aria-pressed={activeView === 'agents'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'agents' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Users className="size-4" />
            Agents
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('runs')}
            aria-pressed={activeView === 'runs'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'runs' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <History className="size-4" />
            Runs
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('tools')}
            aria-pressed={activeView === 'tools'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'tools' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Wrench className="size-4" />
            Tools
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('data')}
            aria-pressed={activeView === 'data'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'data' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Database className="size-4" />
            Data
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('observability')}
            aria-pressed={activeView === 'observability'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'observability' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Activity className="size-4" />
            Observe
          </Button>
          <Button
            variant="ghost"
            onClick={() => selectView('system')}
            aria-pressed={activeView === 'system'}
            className={`h-9 rounded-xl text-xs uppercase ${activeView === 'system' ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            <Settings2 className="size-4" />
            System
          </Button>
        </div>
        <NewChatButton
          disabled={messages.length === 0}
          onClick={() => {
            selectView('chat')
            handleNewChat()
          }}
        />
        {isMounted && (
          <>
            <Endpoint />
            <AuthToken />
            {isEndpointActive && activeView === 'chat' && (
              <>
                <motion.div
                  className="flex w-full flex-col items-start gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                >
                  <div className="text-xs font-medium uppercase text-primary">
                    Mode
                  </div>
                  {isEndpointLoading ? (
                    <div className="flex w-full flex-col gap-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-9 w-full rounded-xl"
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <ModeSelector />
                      <EntitySelector />
                      {selectedModel && (routeQuery.agent || routeQuery.team) && (
                        <ModelDisplay model={selectedModel} />
                      )}
                    </>
                  )}
                </motion.div>
                <Sessions />
              </>
            )}
          </>
        )}
      </motion.div>
      </motion.aside>
    </>
  )
}

export default Sidebar
