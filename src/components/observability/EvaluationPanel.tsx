'use client'

import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search
} from 'lucide-react'
import {
  parseAsString,
  parseAsStringEnum,
  useQueryState
} from 'nuqs'

import { getEvaluationRunAPI, getEvaluationRunsAPI } from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import { EvaluationRun, EvaluationRunsPage } from '@/types/os'

const EVALUATION_TYPES = ['accuracy', 'agent_as_judge', 'performance', 'reliability'] as const
const COMPONENT_TYPES = ['agent', 'team', 'workflow'] as const
const PAGE_SIZE = 10

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'Not returned'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Not returned'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? 'Not returned'
}

const ErrorPanel = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
    <p className="break-words text-sm text-destructive">{message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3">
      <RefreshCw className="size-3.5" /> Retry
    </Button>
  </div>
)

const JsonDetails = ({ label, value }: { label: string; value: unknown }) => (
  <details className="min-w-0 rounded-lg border border-primary/10 bg-background">
    <summary className="cursor-pointer break-words px-3 py-2 text-xs font-medium text-primary">
      {label}
    </summary>
    <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 p-3 font-mono text-[10px] leading-5 text-muted">
      {formatValue(value)}
    </pre>
  </details>
)

const getComponentId = (run: EvaluationRun) =>
  run.agent_id || run.team_id || run.workflow_id || 'Not returned'

const getResultLabel = (run: EvaluationRun) => {
  const values = run.eval_data
  const status = values.eval_status ?? values.status
  const score = values.score ?? values.accuracy ?? values.performance
  const parts = [
    typeof status === 'string' ? status : undefined,
    typeof score === 'number' || typeof score === 'string' ? `Score ${score}` : undefined
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Outcome fields not returned'
}

const EvaluationDetails = ({
  run,
  loading,
  error,
  onRetry
}: {
  run: EvaluationRun | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) => (
  <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/10 p-4">
    <div className="min-w-0">
      <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Evaluation detail</h2>
      <p className="mt-1 break-all font-mono text-[10px] text-muted">{run?.id || 'Select an evaluation run'}</p>
    </div>
    {loading ? (
      <div className="py-8 text-center text-sm text-muted">Loading evaluation detail…</div>
    ) : error ? (
      <ErrorPanel message={error} onRetry={onRetry} />
    ) : run ? (
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {([
            ['Name', run.name || run.evaluated_component_name || 'Not returned'],
            ['Evaluation type', run.eval_type],
            ['Component ID', getComponentId(run)],
            ['Model', [run.model_provider, run.model_id].filter(Boolean).join(' · ') || 'Not returned'],
            ['Created', formatTimestamp(run.created_at)],
            ['Updated', formatTimestamp(run.updated_at)]
          ] as const).map(([label, value]) => (
            <div key={label} className="min-w-0 break-words rounded-lg border border-primary/10 bg-background p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 break-all text-primary">{value}</p>
            </div>
          ))}
        </div>
        <p className="break-words text-xs text-muted">Result: {getResultLabel(run)}</p>
        <JsonDetails label="Evaluation result data" value={run.eval_data} />
        {run.eval_input !== undefined && <JsonDetails label="Evaluation input" value={run.eval_input} />}
      </div>
    ) : (
      <div className="rounded-lg border border-primary/10 p-4 text-sm text-muted">
        Select a run to inspect the API fields and result data.
      </div>
    )}
  </section>
)

const EvaluationPanel = ({
  dbId,
  refreshKey,
  isEndpointActive,
  pageQuery,
  setPageQuery,
  runIdQuery,
  setRunIdQuery,
  onRetry
}: {
  dbId: string | null
  refreshKey: number
  isEndpointActive: boolean
  pageQuery: number
  setPageQuery: (page: number | null) => Promise<unknown>
  runIdQuery: string | null
  setRunIdQuery: (id: string | null) => Promise<unknown>
  onRetry: () => void
}) => {
  const { selectedEndpoint, authToken } = useStore()
  const [typeQuery, setTypeQuery] = useQueryState(
    'eval_type',
    parseAsStringEnum([...EVALUATION_TYPES])
  )
  const [componentTypeQuery, setComponentTypeQuery] = useQueryState(
    'eval_component_type',
    parseAsStringEnum([...COMPONENT_TYPES])
  )
  const [componentIdQuery, setComponentIdQuery] = useQueryState('eval_component_id', parseAsString)
  const [modelIdQuery, setModelIdQuery] = useQueryState('eval_model_id', parseAsString)
  const [componentIdInput, setComponentIdInput] = useState(componentIdQuery || '')
  const [modelIdInput, setModelIdInput] = useState(modelIdQuery || '')
  const [pageData, setPageData] = useState<EvaluationRunsPage | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [detail, setDetail] = useState<EvaluationRun | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const page = Math.max(1, pageQuery || 1)

  useEffect(() => {
    setComponentIdInput(componentIdQuery || '')
    setModelIdInput(modelIdQuery || '')
  }, [componentIdQuery, modelIdQuery])

  useEffect(() => {
    if (!isEndpointActive) {
      setPageData(null)
      setListError(null)
      setListLoading(false)
      return
    }
    const controller = new AbortController()
    setListLoading(true)
    setListError(null)
    setPageData(null)
    getEvaluationRunsAPI(
      selectedEndpoint,
      {
        dbId: dbId || undefined,
        page,
        limit: PAGE_SIZE,
        evalType: typeQuery || undefined,
        componentType: componentTypeQuery || undefined,
        componentId: componentIdQuery || undefined,
        modelId: modelIdQuery || undefined
      },
      authToken,
      controller.signal
    )
      .then((response) => {
        if (!controller.signal.aborted) setPageData(response)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setListError(reason instanceof Error ? reason.message : 'Unable to load AgentOS evaluation runs.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, dbId, page, typeQuery, componentTypeQuery, componentIdQuery, modelIdQuery, refreshKey])

  useEffect(() => {
    if (!isEndpointActive || !runIdQuery) {
      setDetail(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    getEvaluationRunAPI(selectedEndpoint, runIdQuery, dbId || undefined, authToken, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setDetail(response)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDetailError(reason instanceof Error ? reason.message : 'Unable to load evaluation detail.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, dbId, runIdQuery, refreshKey])

  const runs = pageData?.data || []
  const totalPages = Math.max(1, pageData?.meta.total_pages || 1)
  const totalCount = pageData?.meta.total_count ?? runs.length
  const applyFilters = () => {
    void setComponentIdQuery(componentIdInput.trim() || null)
    void setModelIdQuery(modelIdInput.trim() || null)
    void setPageQuery(1)
    void setRunIdQuery(null)
  }

  const clearFilters = () => {
    setComponentIdInput('')
    setModelIdInput('')
    void setTypeQuery(null)
    void setComponentTypeQuery(null)
    void setComponentIdQuery(null)
    void setModelIdQuery(null)
    void setPageQuery(1)
    void setRunIdQuery(null)
  }

  return (
    <div className="min-w-0 space-y-4">
      <form
        className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/20 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters()
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(8rem,0.6fr)_minmax(8rem,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] xl:items-end">
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Evaluation type
            <select
              value={typeQuery || ''}
              onChange={(event) => {
                void setTypeQuery(event.target.value ? event.target.value as (typeof EVALUATION_TYPES)[number] : null)
                void setPageQuery(1)
                void setRunIdQuery(null)
              }}
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-xs text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Any type</option>
              {EVALUATION_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Component type
            <select
              value={componentTypeQuery || ''}
              onChange={(event) => {
                const nextType = event.target.value ? event.target.value as (typeof COMPONENT_TYPES)[number] : null
                void setComponentTypeQuery(nextType)
                if (!nextType) {
                  setComponentIdInput('')
                  void setComponentIdQuery(null)
                }
                void setPageQuery(1)
                void setRunIdQuery(null)
              }}
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-xs text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Any component</option>
              {COMPONENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Component ID
            <input
              value={componentIdInput}
              onChange={(event) => setComponentIdInput(event.target.value)}
              placeholder="Choose a component type"
              disabled={!componentTypeQuery}
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-xs font-normal text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
          </label>
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Model ID
            <input
              value={modelIdInput}
              onChange={(event) => setModelIdInput(event.target.value)}
              placeholder="Filter by model"
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-xs font-normal text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <div className="flex min-w-0 gap-2">
            <Button type="submit" variant="outline" className="h-10 min-w-0 flex-1 xl:flex-none">
              <Search className="size-3.5" /> Filter
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={clearFilters}>Clear</Button>
          </div>
        </div>
        <p className="break-words text-[10px] leading-4 text-muted">
          Read-only GET /eval-runs. Filters use the selected database, eval type, component type and ID, and model ID. Evaluation input and result details remain collapsed until opened.
        </p>
      </form>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Native AgentOS evaluation runs</h2>
              <p className="mt-1 break-words text-[10px] text-muted">{totalCount} runs · Page {pageData?.meta.page ?? page} · {pageData?.meta.limit ?? PAGE_SIZE} per page</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Refresh evaluation runs" onClick={onRetry}>
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {listLoading ? (
            <div className="py-10 text-center text-sm text-muted">Loading evaluation runs…</div>
          ) : listError ? (
            <ErrorPanel message={listError} onRetry={onRetry} />
          ) : runs.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-primary/10 p-5 text-sm text-muted">
              <p>{totalCount === 0 && !typeQuery && !componentTypeQuery && !componentIdQuery && !modelIdQuery ? 'No native evaluation runs were recorded for this database.' : 'No evaluation runs match these filters.'}</p>
              <p className="text-[11px]">AgentOS returned a successful empty result. This view does not start evaluations or invent scores.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  aria-pressed={runIdQuery === run.id}
                  onClick={() => void setRunIdQuery(run.id)}
                  className={`block w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${runIdQuery === run.id ? 'border-primary/40 bg-accent/70' : 'border-primary/10 bg-background hover:bg-accent/30'}`}
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-primary">{run.name || run.evaluated_component_name || run.eval_type}</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted">{run.id}</p>
                    </div>
                    <span className="inline-flex max-w-full shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] uppercase text-muted">{run.eval_type}</span>
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-[10px] sm:grid-cols-2">
                    <span className="break-all text-muted">Component: {run.evaluated_component_name || getComponentId(run)}</span>
                    <span className="break-all text-muted">Model: {[run.model_provider, run.model_id].filter(Boolean).join(' · ') || 'Not returned'}</span>
                    <span className="break-words text-muted">{getResultLabel(run)}</span>
                    <span className="break-words text-muted">Created {formatTimestamp(run.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {pageData && !listError && (
            <div className="flex min-w-0 items-center justify-between gap-2 border-t border-primary/10 pt-3">
              <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => void setPageQuery(Math.max(1, page - 1))}>
                <ChevronLeft className="size-3.5" /> Previous
              </Button>
              <span className="text-[10px] text-muted">Page {pageData.meta.page || page} of {totalPages}</span>
              <Button type="button" variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => void setPageQuery(page + 1)}>
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </section>

        <EvaluationDetails run={detail} loading={detailLoading} error={detailError} onRetry={onRetry} />
      </div>

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Langfuse datasets and A/B experiments</h2>
          <p className="mt-1 break-words text-[11px] text-muted">No verified dataset run is available in this deployment. No evaluation or model run was started from this page.</p>
        </div>
        <a
          href="http://127.0.0.1:3001"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-primary/15 px-3 text-xs text-primary hover:bg-accent"
        >
          Open Langfuse <ExternalLink className="size-3.5" />
        </a>
      </section>
    </div>
  )
}

export default EvaluationPanel
