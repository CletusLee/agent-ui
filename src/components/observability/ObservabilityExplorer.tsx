'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState
} from 'nuqs'
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search
} from 'lucide-react'

import {
  getMetricsAPI,
  getOSMetricsAPI,
  getSessionDatabaseOptionsAPI,
  getTraceDetailsAPI,
  getTracesAPI,
  getTraceSessionStatsAPI
} from '@/api/os'
import EvaluationPanel from '@/components/observability/EvaluationPanel'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  DayAggregatedMetrics,
  MetricsResponse,
  TraceDetail,
  TraceNode,
  TracePage,
  TraceSessionStatsPage,
  TraceSummary
} from '@/types/os'

const OBSERVABILITY_VIEWS = ['traces', 'metrics', 'evals'] as const
type ObservabilityView = (typeof OBSERVABILITY_VIEWS)[number]
const PAGE_SIZE = 10
const OS_METRIC_NAMES = ['latency', 'models', 'runs', 'sessions', 'tokens', 'users'] as const
type OSMetricName = (typeof OS_METRIC_NAMES)[number]
type OSMetricResult = {
  loading: boolean
  error: string | null
  result: Record<string, unknown> | null
}
type OSMetricResults = Record<OSMetricName, OSMetricResult>

const createEmptyOSMetricResults = (): OSMetricResults => ({
  latency: { loading: false, error: null, result: null },
  models: { loading: false, error: null, result: null },
  runs: { loading: false, error: null, result: null },
  sessions: { loading: false, error: null, result: null },
  tokens: { loading: false, error: null, result: null },
  users: { loading: false, error: null, result: null }
})

const OS_METRIC_LABELS: Record<OSMetricName, string> = {
  latency: 'Latency',
  models: 'Models',
  runs: 'Runs',
  sessions: 'Sessions',
  tokens: 'Tokens',
  users: 'Users'
}

const getDefaultRange = () => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  const toDateInputValue = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end)
  }
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Not returned'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? 'Not returned'
}

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'Not returned'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value)
const formatReportedMetric = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? formatNumber(value) : 'Not returned'

const getFailureRateMetric = (result: Record<string, unknown>) => {
  const totalRuns = result.total_runs
  const successRate = result.success_rate

  if (totalRuns === 0) {
    return { value: 'N/A', detail: 'No runs were reported for this range.' }
  }
  if (typeof totalRuns !== 'number' || !Number.isFinite(totalRuns) || totalRuns < 0) {
    return { value: 'Not available', detail: 'A valid API-reported total_runs value is required.' }
  }
  if (typeof successRate !== 'number' || !Number.isFinite(successRate)) {
    return { value: 'Not available', detail: 'AgentOS did not return a numeric success_rate.' }
  }
  if (successRate < 0 || successRate > 100) {
    return { value: 'Not available', detail: 'The returned success_rate is outside the 0–100% range.' }
  }

  return {
    value: 100 - successRate,
    detail: '100% minus the API-reported success_rate; total_runs is greater than zero.'
  }
}

const JsonDetails = ({
  label,
  value
}: {
  label: string
  value: unknown
}) => (
  <details className="min-w-0 rounded-lg border border-primary/10 bg-background">
    <summary className="cursor-pointer break-words px-3 py-2 text-xs font-medium text-primary">
      {label}
    </summary>
    <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 p-3 font-mono text-[10px] leading-5 text-muted">
      {formatValue(value)}
    </pre>
  </details>
)

const ErrorPanel = ({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) => (
  <div className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
    <p className="break-words text-sm text-destructive">{message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3">
      <RefreshCw className="size-3.5" />
      Retry
    </Button>
  </div>
)

const statusTone = (status?: string) => {
  const normalized = status?.toUpperCase() || ''
  if (normalized === 'OK' || normalized === 'SUCCESS') {
    return 'border-positive/30 bg-positive/10 text-positive'
  }
  if (normalized === 'ERROR' || normalized === 'FAILED') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
  return 'border-primary/20 bg-primary/5 text-muted'
}

const StatusBadge = ({ status }: { status?: string }) => (
  <span
    className={`inline-flex max-w-full shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone(status)}`}
  >
    {status || 'UNKNOWN'}
  </span>
)

const TraceSpan = ({ span, depth = 0 }: { span: TraceNode; depth?: number }) => (
  <article
    className={`min-w-0 space-y-3 rounded-lg border border-primary/10 bg-background p-3 ${depth > 0 ? 'ml-3 sm:ml-5' : ''}`}
  >
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h4 className="break-words text-sm font-medium text-primary">{span.name}</h4>
        <p className="mt-1 break-all font-mono text-[10px] text-muted">
          {span.type}{span.step_type ? ` · ${span.step_type}` : ''} · {span.id}
        </p>
      </div>
      <StatusBadge status={span.status} />
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
      <div className="min-w-0 break-words"><span className="text-muted">Duration: </span>{span.duration || 'Not returned'}</div>
      <div className="min-w-0 break-words"><span className="text-muted">Started: </span>{formatTimestamp(span.start_time)}</div>
    </div>
    {span.error && <p className="whitespace-pre-wrap break-words text-xs text-destructive">{span.error}</p>}
    {span.input !== undefined && <JsonDetails label="Span input" value={span.input} />}
    {span.output !== undefined && <JsonDetails label="Span output" value={span.output} />}
    {span.metadata !== undefined && <JsonDetails label="Span metadata" value={span.metadata} />}
    {span.extra_data !== undefined && <JsonDetails label="Span extra data" value={span.extra_data} />}
    {Array.isArray(span.spans) && span.spans.length > 0 && (
      <div className="space-y-2 border-l border-primary/15 pl-2">
        {span.spans.map((child) => <TraceSpan key={child.id} span={child} depth={depth + 1} />)}
      </div>
    )}
  </article>
)

const isTraceDetail = (value: TraceDetail | TraceNode): value is TraceDetail =>
  'trace_id' in value && 'tree' in value

const MetricCard = ({ label, value, detail }: { label: string; value: number | string; detail?: string }) => (
  <article className="min-w-0 rounded-xl border border-primary/10 bg-background p-4">
    <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-2 break-words text-xl font-semibold text-primary">{typeof value === 'number' ? formatNumber(value) : value}</p>
    {detail && <p className="mt-1 break-words text-[10px] text-muted">{detail}</p>}
  </article>
)

const TraceDetails = ({
  trace,
  detail,
  loading,
  error,
  onRetry
}: {
  trace?: TraceSummary
  detail: TraceDetail | TraceNode | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) => (
  <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/10 p-4">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Trace detail</h2>
        <p className="mt-1 break-all font-mono text-[10px] text-muted">
          {trace?.trace_id || ('id' in (detail || {}) ? (detail as TraceNode).id : 'Select a trace')}
        </p>
      </div>
      {trace && <StatusBadge status={trace.status} />}
    </div>
    {loading ? (
      <div className="py-8 text-center text-sm text-muted">Loading trace detail…</div>
    ) : error ? (
      <ErrorPanel message={error} onRetry={onRetry} />
    ) : detail && isTraceDetail(detail) ? (
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {([
            ['Name', detail.name],
            ['Status', detail.status],
            ['Duration', detail.duration],
            ['Total spans', detail.total_spans],
            ['Errors', detail.error_count],
            ['Started', formatTimestamp(detail.start_time)],
            ['Ended', formatTimestamp(detail.end_time)],
            ['Run ID', detail.run_id],
            ['Session ID', detail.session_id],
            ['Agent ID', detail.agent_id],
            ['Team ID', detail.team_id],
            ['Workflow ID', detail.workflow_id]
          ] as const).map(([label, value]) => (
            <div key={label} className="min-w-0 break-words rounded-lg border border-primary/10 p-2">
              <span className="text-muted">{label}: </span>
              <span className="text-primary">{formatValue(value)}</span>
            </div>
          ))}
        </div>
        {detail.error && <p className="whitespace-pre-wrap break-words text-sm text-destructive">{detail.error}</p>}
        {detail.input !== undefined && <JsonDetails label="Trace input" value={detail.input} />}
        {detail.output !== undefined && <JsonDetails label="Trace output" value={detail.output} />}
        {detail.tree.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-primary">Span tree · {detail.tree.length} root spans</h3>
            {detail.tree.map((span) => <TraceSpan key={span.id} span={span} />)}
          </div>
        ) : (
          <p className="rounded-lg border border-primary/10 p-3 text-xs text-muted">AgentOS returned no spans for this trace.</p>
        )}
        <JsonDetails label="Full AgentOS trace response" value={detail} />
      </div>
    ) : detail ? (
      <div className="space-y-3">
        <p className="text-xs text-muted">AgentOS returned a span node without the trace detail schema.</p>
        <TraceSpan span={detail} />
        <JsonDetails label="Full AgentOS span response" value={detail} />
      </div>
    ) : trace ? (
      <div className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Select a trace to inspect its span tree and associated run.</div>
    ) : (
      <div className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Trace details will appear here when a trace is selected.</div>
    )}
  </section>
)

const TracePanel = ({
  page,
  loading,
  error,
  selectedTraceId,
  onSelectTrace,
  runFilter,
  onRunFilterChange,
  sessionFilter,
  onSessionFilterChange,
  statusFilter,
  onStatusFilterChange,
  onApplyFilters,
  onClearFilters,
  onPageChange,
  onRetry,
  sessionStats,
  statsError,
  onRetryStats,
  detail,
  detailLoading,
  detailError,
  onRetryDetail
}: {
  page: TracePage | null
  loading: boolean
  error: string | null
  selectedTraceId: string
  onSelectTrace: (traceId: string) => void
  runFilter: string
  onRunFilterChange: (value: string) => void
  sessionFilter: string
  onSessionFilterChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  onApplyFilters: () => void
  onClearFilters: () => void
  onPageChange: (page: number) => void
  onRetry: () => void
  sessionStats: TraceSessionStatsPage | null
  statsError: string | null
  onRetryStats: () => void
  detail: TraceDetail | TraceNode | null
  detailLoading: boolean
  detailError: string | null
  onRetryDetail: () => void
}) => {
  const traces = page?.data || []
  const totalPages = Math.max(1, page?.meta.total_pages || 1)
  const selectedTrace = traces.find((trace) => trace.trace_id === selectedTraceId)
  const totalTraceCount = page?.meta.total_count ?? traces.length
  const sessionCount = sessionStats?.meta.total_count ?? sessionStats?.data.length ?? 0
  const sampleTraceCount = (sessionStats?.data || []).reduce((sum, row) => sum + row.total_traces, 0)

  return (
    <div className="min-w-0 space-y-4">
      <form
        className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/20 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          onApplyFilters()
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(9rem,0.5fr)_auto] md:items-end">
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Run ID
            <input
              value={runFilter}
              onChange={(event) => onRunFilterChange(event.target.value)}
              placeholder="Filter by exact run ID"
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm font-normal text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Session ID
            <input
              value={sessionFilter}
              onChange={(event) => onSessionFilterChange(event.target.value)}
              placeholder="Filter by exact session ID"
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm font-normal text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="block min-w-0 text-[11px] font-medium text-muted">
            Status
            <select
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value)}
              className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Any status</option>
              <option value="OK">OK</option>
              <option value="ERROR">ERROR</option>
              <option value="UNSET">UNSET</option>
            </select>
          </label>
          <div className="flex min-w-0 gap-2">
            <Button type="submit" variant="outline" className="h-10 min-w-0 flex-1 md:flex-none">
              <Search className="size-3.5" />
              Filter
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={onClearFilters}>
              Clear
            </Button>
          </div>
        </div>
        <p className="break-words text-[10px] leading-4 text-muted">
          Read-only GET /traces. Filters use AgentOS run_id, session_id and status. The selected DB is applied to every request.
        </p>
      </form>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard label="Traces in current result set" value={totalTraceCount} detail="GET /traces · selected database" />
        <MetricCard label="Sessions with traces" value={sessionCount} detail={`${sampleTraceCount} traces across the first ${sessionStats?.data.length || 0} session rows`} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Native AgentOS traces</h2>
              <p className="mt-1 break-words text-[10px] text-muted">Page {page?.meta.page ?? 1} · {page?.meta.limit ?? PAGE_SIZE} per page</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Refresh traces" onClick={onRetry}>
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-muted">Loading traces…</div>
          ) : error ? (
            <ErrorPanel message={error} onRetry={onRetry} />
          ) : traces.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-primary/10 p-5 text-sm text-muted">
              <p>{runFilter.trim() || sessionFilter.trim() || statusFilter ? 'No traces match these filters.' : 'No traces were recorded for this database.'}</p>
              <p className="text-[11px]">AgentOS returned a successful empty result. Trace data is not inferred from other sessions or external HTTP spans.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {traces.map((trace) => (
                <button
                  key={trace.trace_id}
                  type="button"
                  aria-pressed={selectedTraceId === trace.trace_id}
                  onClick={() => onSelectTrace(trace.trace_id)}
                  className={`block w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selectedTraceId === trace.trace_id ? 'border-primary/40 bg-accent/70' : 'border-primary/10 bg-background hover:bg-accent/30'}`}
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-primary">{trace.name}</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted">{trace.trace_id}</p>
                    </div>
                    <StatusBadge status={trace.status} />
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-[10px] sm:grid-cols-2">
                    <span className="break-words text-muted">Duration: {trace.duration}</span>
                    <span className="break-words text-muted">Spans: {trace.total_spans} · Errors: {trace.error_count}</span>
                    <span className="break-all text-muted">Run: {trace.run_id || 'Not associated'}</span>
                    <span className="break-all text-muted">Session: {trace.session_id || 'Not associated'}</span>
                  </div>
                  <p className="mt-2 break-words text-[10px] text-muted">Started {formatTimestamp(trace.start_time)}</p>
                </button>
              ))}
            </div>
          )}

          {page && !error && (
            <div className="flex min-w-0 items-center justify-between gap-2 border-t border-primary/10 pt-3">
              <Button type="button" variant="ghost" size="sm" disabled={(page.meta.page || 1) <= 1} onClick={() => onPageChange(Math.max(1, (page.meta.page || 1) - 1))}>
                <ChevronLeft className="size-3.5" /> Previous
              </Button>
              <span className="text-[10px] text-muted">Page {page.meta.page || 1} of {totalPages}</span>
              <Button type="button" variant="ghost" size="sm" disabled={(page.meta.page || 1) >= totalPages} onClick={() => onPageChange((page.meta.page || 1) + 1)}>
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
          {statsError && <p className="break-words text-[10px] text-destructive">Session trace summary unavailable: {statsError}</p>}
          {!statsError && sessionStats && sessionStats.meta.total_count === 0 && (
            <p className="text-[10px] text-muted">GET /trace_session_stats returned 0 sessions with traces.</p>
          )}
          {statsError && <Button type="button" variant="ghost" size="sm" onClick={onRetryStats}>Retry session summary</Button>}
        </section>

        <TraceDetails
          trace={selectedTrace}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onRetry={onRetryDetail}
        />
      </div>
    </div>
  )
}

const OS_METRIC_SUMMARY_FIELDS: Record<OSMetricName, Array<[string, string]>> = {
  latency: [
    ['runs_count', 'Runs measured'],
    ['avg_duration_ms', 'Average duration · ms'],
    ['median_duration_ms', 'Median duration · ms'],
    ['p95_duration_ms', 'P95 duration · ms'],
    ['max_duration_ms', 'Maximum duration · ms'],
    ['avg_time_to_first_token_ms', 'Average time to first token · ms'],
    ['p95_time_to_first_token_ms', 'P95 time to first token · ms'],
    ['avg_model_call_ms', 'Average model call · ms']
  ],
  models: [['total_model_runs', 'Model runs'], ['window_days', 'Window · days']],
  runs: [
    ['total_runs', 'Runs'],
    ['success_rate', 'Success rate · %'],
    ['previous_total_runs', 'Previous period runs'],
    ['change_percent', 'Change · %']
  ],
  sessions: [
    ['total_sessions', 'Sessions'],
    ['previous_total_sessions', 'Previous period sessions'],
    ['change_percent', 'Change · %']
  ],
  tokens: [
    ['total_tokens', 'Tokens'],
    ['previous_total_tokens', 'Previous period tokens'],
    ['change_percent', 'Change · %']
  ],
  users: []
}

const OS_METRIC_ROW_FIELDS: Partial<Record<OSMetricName, string[]>> = {
  latency: [
    'date', 'runs_count', 'avg_duration_ms', 'median_duration_ms',
    'p95_duration_ms', 'max_duration_ms', 'avg_time_to_first_token_ms',
    'p95_time_to_first_token_ms', 'avg_model_call_ms', 'p95_model_call_ms'
  ],
  models: ['model_id', 'model_provider', 'runs_count', 'runs_share'],
  runs: ['date', 'runs_count', 'status_metrics'],
  sessions: ['date', 'sessions_count'],
  tokens: ['date', 'tokens_count']
}

const projectMetricRows = (name: OSMetricName, result: Record<string, unknown>) => {
  const field = name === 'models' ? 'models' : 'metrics'
  const rows = result[field]
  const allowed = OS_METRIC_ROW_FIELDS[name]
  if (!Array.isArray(rows) || !allowed) return []
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => Object.fromEntries(allowed
      .filter((key) => key in row)
      .map((key) => [key, row[key]])))
}

const OperationalMetricCard = ({
  name,
  state,
  onRetry
}: {
  name: OSMetricName
  state: OSMetricResult
  onRetry: () => void
}) => {
  const result = state.result
  const rows = result ? projectMetricRows(name, result) : []
  const failureRate = name === 'runs' && result ? getFailureRateMetric(result) : null
  const summaryValues = result
    ? OS_METRIC_SUMMARY_FIELDS[name].flatMap(([key, label]) => {
        const value = result[key]
        return typeof value === 'number' && Number.isFinite(value) ? [[label, value] as const] : []
      })
    : []
  const userRowCount = result
    ? ['users', 'data', 'metrics', 'entries'].reduce((count, key) => {
        const value = result[key]
        return count || (Array.isArray(value) ? value.length : 0)
      }, 0)
    : 0

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-background p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-primary">{OS_METRIC_LABELS[name]}</h3>
          <p className="mt-1 break-all font-mono text-[10px] text-muted">GET /os/metrics/{name}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Retry ${name} metrics`} onClick={onRetry}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {state.loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : state.error ? (
        <ErrorPanel message={state.error} onRetry={onRetry} />
      ) : result ? (
        <div className="min-w-0 space-y-3">
          {summaryValues.length > 0 || failureRate ? (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {summaryValues.map(([label, value]) => (
                <MetricCard key={label} label={label} value={value} />
              ))}
              {failureRate && (
                <MetricCard label="Failure rate · %" value={failureRate.value} detail={failureRate.detail} />
              )}
            </div>
          ) : name === 'users' ? (
            <p className="text-xs text-muted">
              {userRowCount > 0
                ? `${formatNumber(userRowCount)} user entries returned; individual records are hidden.`
                : 'No user metrics were returned.'}
            </p>
          ) : (
            <p className="text-xs text-muted">The endpoint returned no aggregate values.</p>
          )}
          {rows.length > 0 && (
            <JsonDetails
              label={`${name === 'models' ? 'Model breakdown' : 'Daily breakdown'} · ${rows.length}`}
              value={rows}
            />
          )}
          <p className="break-words text-[10px] text-muted">
            Window: {formatValue(result.window_days)} days · Updated: {formatTimestamp(typeof result.updated_at === 'string' ? result.updated_at : null)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">No response recorded.</p>
      )}
    </article>
  )
}

const OperationalMetricsPanel = ({
  results,
  onRetry
}: {
  results: OSMetricResults
  onRetry: () => void
}) => (
  <section className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/10 p-4">
    <div className="min-w-0">
      <h2 className="text-xs font-medium uppercase tracking-wide text-primary">AgentOS operational metrics</h2>
      <p className="mt-1 break-words text-[10px] text-muted">
        Read-only GET endpoints · selected database where supported · Users metrics may require an AgentOS user directory.
      </p>
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
      {OS_METRIC_NAMES.map((name) => (
        <OperationalMetricCard key={name} name={name} state={results[name]} onRetry={onRetry} />
      ))}
    </div>
  </section>
)

const MetricsPanel = ({
  result,
  operationalResults,
  loading,
  error,
  startDate,
  endDate,
  tableInput,
  tableName,
  onStartDateChange,
  onEndDateChange,
  onTableInputChange,
  onApplyRange,
  onRetry
}: {
  result: MetricsResponse | null
  operationalResults: OSMetricResults
  loading: boolean
  error: string | null
  startDate: string
  endDate: string
  tableInput: string
  tableName: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onTableInputChange: (value: string) => void
  onApplyRange: () => void
  onRetry: () => void
}) => {
  const rows = useMemo(() => result?.metrics || [], [result?.metrics])
  const totals = useMemo(() => rows.reduce(
    (sum, row) => ({
      runs: sum.runs + row.agent_runs_count + row.team_runs_count + row.workflow_runs_count,
      sessions: sum.sessions + row.agent_sessions_count + row.team_sessions_count + row.workflow_sessions_count,
      tokens: sum.tokens + (typeof row.token_metrics?.total_tokens === 'number' && Number.isFinite(row.token_metrics.total_tokens)
        ? row.token_metrics.total_tokens
        : 0),
      tokenTotalsComplete: sum.tokenTotalsComplete && typeof row.token_metrics?.total_tokens === 'number' && Number.isFinite(row.token_metrics.total_tokens)
    }),
    { runs: 0, sessions: 0, tokens: 0, tokenTotalsComplete: true }
  ), [rows])
  const reportedTokenTotal = rows.length === 0 ? 'No data' : totals.tokenTotalsComplete ? totals.tokens : 'Incomplete'
  const tokenTotalDetail = rows.length === 0
    ? 'No daily rows were returned for this range'
    : totals.tokenTotalsComplete
    ? 'Sum of API-reported daily token totals'
    : 'At least one daily row omitted total_tokens; partial sum is not shown'

  return (
    <div className="min-w-0 space-y-4">
      <form
        className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-primary/10 bg-primaryAccent/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          onApplyRange()
        }}
      >
        <label className="block min-w-0 text-[11px] font-medium text-muted">
          Starting date
          <input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </label>
        <label className="block min-w-0 text-[11px] font-medium text-muted">
          Ending date
          <input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </label>
        <label className="block min-w-0 text-[11px] font-medium text-muted">
          Database table (optional)
          <input type="text" value={tableInput} onChange={(event) => onTableInputChange(event.target.value)} placeholder="Leave blank for default" className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <span className="mt-1 block text-[10px] font-normal">Enter a table configured for the selected database.</span>
        </label>
        <Button type="submit" variant="outline" className="h-10"><CalendarDays className="size-3.5" />Load metrics</Button>
      </form>

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Daily AgentOS metrics</h2>
          <p className="mt-1 break-words text-[10px] text-muted">GET /metrics · {startDate} through {endDate} · selected database · table: {tableName || 'AgentOS default'} · no cost estimate is available from this API</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Refresh metrics" onClick={onRetry}><RefreshCw className="size-4" /></Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted">Loading metrics…</div>
      ) : error ? (
        <ErrorPanel message={error} onRetry={onRetry} />
      ) : result ? (
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="AgentOS runs" value={totals.runs} detail="Agent + Team + Workflow runs in range" />
            <MetricCard label="AgentOS sessions" value={totals.sessions} detail="Agent + Team + Workflow sessions in range" />
            <MetricCard label="Total tokens" value={reportedTokenTotal} detail={tokenTotalDetail} />
          </div>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
              No daily metrics were returned for this database and date range.
              <p className="mt-2 text-[11px]">The metrics request succeeded with an empty result.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => <MetricDay key={`${row.date}-${row.id || ''}`} row={row} />)}
            </div>
          )}
          <p className="break-words text-[10px] text-muted">Last updated: {formatTimestamp(result.updated_at)} · {rows.length} daily rows returned. Costs are not provided or estimated.</p>
        </div>
      ) : null}

      <OperationalMetricsPanel results={operationalResults} onRetry={onRetry} />
    </div>
  )
}

const MetricDay = ({ row }: { row: DayAggregatedMetrics }) => (
  <article className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-background p-4">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <h3 className="break-words text-sm font-medium text-primary">{row.date}</h3>
      <span className="text-[10px] text-muted">{row.users_count} users · updated {formatTimestamp(row.updated_at)}</span>
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-3">
      {([
        ['Agent', row.agent_runs_count, row.agent_sessions_count],
        ['Team', row.team_runs_count, row.team_sessions_count],
        ['Workflow', row.workflow_runs_count, row.workflow_sessions_count]
      ] as const).map(([label, runs, sessions]) => (
        <div key={label} className="min-w-0 rounded-lg border border-primary/10 p-3">
          <p className="text-[10px] font-medium uppercase text-muted">{label}</p>
          <p className="mt-1 break-words text-primary">{formatNumber(runs)} runs · {formatNumber(sessions)} sessions</p>
        </div>
      ))}
      <div className="min-w-0 rounded-lg border border-primary/10 p-3 sm:col-span-3">
        <p className="text-[10px] font-medium uppercase text-muted">Token usage</p>
        <p className="mt-1 break-words text-primary">
          {formatReportedMetric(row.token_metrics?.input_tokens)} input · {formatReportedMetric(row.token_metrics?.output_tokens)} output · {formatReportedMetric(row.token_metrics?.total_tokens)} total
        </p>
      </div>
    </div>
    {Array.isArray(row.model_metrics) && row.model_metrics.length > 0 && (
      <JsonDetails label={`Model metrics · ${row.model_metrics.length}`} value={row.model_metrics} />
    )}
    <JsonDetails label="Full daily metrics record" value={row} />
  </article>
)

const ObservabilityExplorer = () => {
  const { selectedEndpoint, authToken, isEndpointActive } = useStore()
  const [dbId, setDbId] = useQueryState('db_id')
  const [viewQuery, setViewQuery] = useQueryState(
    'observability_view',
    parseAsStringEnum([...OBSERVABILITY_VIEWS]).withDefault('traces')
  )
  const [pageQuery, setPageQuery] = useQueryState('trace_page', parseAsInteger.withDefault(1))
  const [evaluationPageQuery, setEvaluationPageQuery] = useQueryState('eval_page', parseAsInteger.withDefault(1))
  const [evaluationRunQuery, setEvaluationRunQuery] = useQueryState('eval_run_id', parseAsString)
  const [runQuery, setRunQuery] = useQueryState('trace_run_id', parseAsString)
  const [sessionQuery, setSessionQuery] = useQueryState('trace_session_id', parseAsString)
  const [statusQuery, setStatusQuery] = useQueryState('trace_status', parseAsString)
  const [traceQuery, setTraceQuery] = useQueryState('trace_id', parseAsString)
  const defaultRange = getDefaultRange()
  const [metricsStartQuery, setMetricsStartQuery] = useQueryState('metrics_start', parseAsString)
  const [metricsEndQuery, setMetricsEndQuery] = useQueryState('metrics_end', parseAsString)
  const [metricsTableQuery, setMetricsTableQuery] = useQueryState('metrics_table', parseAsString)
  const page = Math.max(1, pageQuery || 1)
  const view = (viewQuery || 'traces') as ObservabilityView

  const [runFilter, setRunFilter] = useState(runQuery || '')
  const [sessionFilter, setSessionFilter] = useState(sessionQuery || '')
  const [statusFilter, setStatusFilter] = useState(statusQuery || '')
  const [metricsStartInput, setMetricsStartInput] = useState(metricsStartQuery || defaultRange.start)
  const [metricsEndInput, setMetricsEndInput] = useState(metricsEndQuery || defaultRange.end)
  const [metricsTableInput, setMetricsTableInput] = useState(metricsTableQuery || '')
  const [databaseIds, setDatabaseIds] = useState<string[]>([])
  const [databaseLoading, setDatabaseLoading] = useState(true)
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [traces, setTraces] = useState<TracePage | null>(null)
  const [tracesLoading, setTracesLoading] = useState(false)
  const [tracesError, setTracesError] = useState<string | null>(null)
  const [sessionStats, setSessionStats] = useState<TraceSessionStatsPage | null>(null)
  const [sessionStatsError, setSessionStatsError] = useState<string | null>(null)
  const [traceDetail, setTraceDetail] = useState<TraceDetail | TraceNode | null>(null)
  const [traceDetailLoading, setTraceDetailLoading] = useState(false)
  const [traceDetailError, setTraceDetailError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [operationalMetrics, setOperationalMetrics] = useState<OSMetricResults>(createEmptyOSMetricResults)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setMetricsTableInput(metricsTableQuery || '')
  }, [metricsTableQuery])

  useEffect(() => {
    if (!isEndpointActive) {
      setDatabaseIds([])
      setDatabaseError(null)
      setDatabaseLoading(false)
      return
    }
    const controller = new AbortController()
    setDatabaseLoading(true)
    setDatabaseError(null)
    getSessionDatabaseOptionsAPI(selectedEndpoint, authToken, controller.signal)
      .then((ids) => {
        if (!controller.signal.aborted) setDatabaseIds(ids)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDatabaseError(reason instanceof Error ? reason.message : 'Unable to load databases.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDatabaseLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, refreshKey])

  useEffect(() => {
    setRunFilter(runQuery || '')
    setSessionFilter(sessionQuery || '')
    setStatusFilter(statusQuery || '')
  }, [runQuery, sessionQuery, statusQuery])

  useEffect(() => {
    setMetricsStartInput(metricsStartQuery || getDefaultRange().start)
    setMetricsEndInput(metricsEndQuery || getDefaultRange().end)
  }, [metricsStartQuery, metricsEndQuery])

  useEffect(() => {
    if (!isEndpointActive || view !== 'traces') {
      setTracesLoading(false)
      return
    }
    const controller = new AbortController()
    setTracesLoading(true)
    setTracesError(null)
    setTraces(null)
    getTracesAPI(
      selectedEndpoint,
      {
        dbId: dbId || undefined,
        runId: runQuery || undefined,
        sessionId: sessionQuery || undefined,
        status: statusQuery || undefined,
        page,
        limit: PAGE_SIZE
      },
      authToken,
      controller.signal
    )
      .then((response) => {
        if (!controller.signal.aborted) setTraces(response)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setTracesError(reason instanceof Error ? reason.message : 'Unable to load AgentOS traces.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTracesLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, view, dbId, runQuery, sessionQuery, statusQuery, page, refreshKey])

  useEffect(() => {
    if (!isEndpointActive || view !== 'traces') {
      setSessionStats(null)
      setSessionStatsError(null)
      return
    }
    const controller = new AbortController()
    setSessionStatsError(null)
    getTraceSessionStatsAPI(selectedEndpoint, dbId || undefined, authToken, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setSessionStats(response)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setSessionStatsError(reason instanceof Error ? reason.message : 'Unable to load session trace summary.')
        }
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, view, dbId, refreshKey])

  useEffect(() => {
    if (!isEndpointActive || view !== 'traces' || !traceQuery) {
      setTraceDetail(null)
      setTraceDetailError(null)
      setTraceDetailLoading(false)
      return
    }
    const controller = new AbortController()
    setTraceDetailLoading(true)
    setTraceDetailError(null)
    setTraceDetail(null)
    getTraceDetailsAPI(
      selectedEndpoint,
      traceQuery,
      dbId || undefined,
      runQuery || undefined,
      authToken,
      controller.signal
    )
      .then((detail) => {
        if (!controller.signal.aborted) setTraceDetail(detail)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setTraceDetailError(reason instanceof Error ? reason.message : 'Unable to load trace detail.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTraceDetailLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, view, traceQuery, dbId, runQuery, refreshKey])

  useEffect(() => {
    if (!isEndpointActive || view !== 'metrics') {
      setMetricsLoading(false)
      return
    }
    if (metricsTableQuery && !dbId) {
      setMetrics(null)
      setMetricsError('Select a specific database before choosing a table.')
      setMetricsLoading(false)
      return
    }
    const range = getDefaultRange()
    const controller = new AbortController()
    setMetricsLoading(true)
    setMetricsError(null)
    setMetrics(null)
    getMetricsAPI(
      selectedEndpoint,
      {
        dbId: dbId || undefined,
        table: metricsTableQuery || undefined,
        startingDate: metricsStartQuery || range.start,
        endingDate: metricsEndQuery || range.end
      },
      authToken,
      controller.signal
    )
      .then((response) => {
        if (!controller.signal.aborted) setMetrics(response)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setMetricsError(reason instanceof Error ? reason.message : 'Unable to load AgentOS metrics.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetricsLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, view, dbId, metricsStartQuery, metricsEndQuery, metricsTableQuery, refreshKey])

  useEffect(() => {
    if (!isEndpointActive || view !== 'metrics') {
      setOperationalMetrics((current) => Object.fromEntries(
        OS_METRIC_NAMES.map((name) => [name, { ...current[name], loading: false }])
      ) as OSMetricResults)
      return
    }

    const range = getDefaultRange()
    const controller = new AbortController()
    setOperationalMetrics((current) => Object.fromEntries(
      OS_METRIC_NAMES.map((name) => [name, { ...current[name], loading: true, error: null }])
    ) as OSMetricResults)

    OS_METRIC_NAMES.forEach((name) => {
      getOSMetricsAPI(
        selectedEndpoint,
        name,
        {
          dbId: dbId || undefined,
          startingDate: metricsStartQuery || range.start,
          endingDate: metricsEndQuery || range.end
        },
        authToken,
        controller.signal
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setOperationalMetrics((current) => ({
              ...current,
              [name]: { loading: false, error: null, result }
            }))
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setOperationalMetrics((current) => ({
              ...current,
              [name]: {
                ...current[name],
                loading: false,
                error: reason instanceof Error ? reason.message : `Unable to load ${name} metrics.`
              }
            }))
          }
        })
    })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, view, dbId, metricsStartQuery, metricsEndQuery, refreshKey])

  const retryCurrentView = () => setRefreshKey((value) => value + 1)
  const applyTraceFilters = () => {
    void setRunQuery(runFilter.trim() || null)
    void setSessionQuery(sessionFilter.trim() || null)
    void setStatusQuery(statusFilter || null)
    void setPageQuery(1)
    void setTraceQuery(null)
  }
  const clearTraceFilters = () => {
    setRunFilter('')
    setSessionFilter('')
    setStatusFilter('')
    void setRunQuery(null)
    void setSessionQuery(null)
    void setStatusQuery(null)
    void setPageQuery(1)
    void setTraceQuery(null)
  }
  const applyMetricsRange = () => {
    const table = metricsTableInput.trim()
    if (table && !dbId) {
      setMetricsError('Select a specific database before choosing a table.')
      setMetrics(null)
      return
    }
    if (!metricsStartInput || !metricsEndInput || metricsStartInput > metricsEndInput) {
      setMetricsError('Choose a valid date range. The ending date must be on or after the starting date.')
      setMetrics(null)
      return
    }
    void setMetricsStartQuery(metricsStartInput)
    void setMetricsEndQuery(metricsEndInput)
    void setMetricsTableQuery(table || null)
  }

  const availableDatabaseIds = Array.from(
    new Set([...databaseIds, ...(dbId ? [dbId] : [])])
  ).sort((left, right) => left.localeCompare(right))
  const activeDbLabel = dbId || 'AgentOS default'
  const chooseDatabase = (next: string) => {
    void setDbId(next || null)
    void setPageQuery(1)
    void setEvaluationPageQuery(1)
    void setEvaluationRunQuery(null)
    void setTraceQuery(null)
    void setMetricsTableQuery(null)
    setMetricsTableInput('')
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background p-3 sm:p-5 lg:p-6">
      <header className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-primary/10 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-accent p-2 text-primary"><Activity className="size-4" /></span>
          <div className="min-w-0">
            <h1 className="break-words text-base font-medium text-primary sm:text-lg">Observability</h1>
            <p className="mt-1 break-words text-xs text-muted">Read native AgentOS traces, evaluation runs, and daily metrics. Database scope: {activeDbLabel}</p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <label className="block min-w-0 text-[10px] font-medium uppercase tracking-wide text-muted sm:w-64">
            <span className="flex items-center gap-1"><Database className="size-3" />Database</span>
            <select
              value={dbId || ''}
              disabled={databaseLoading}
              onChange={(event) => chooseDatabase(event.target.value)}
              className="mt-1 h-9 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-xs normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">AgentOS default</option>
              {availableDatabaseIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={retryCurrentView}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </header>

      {databaseError && (
        <p role="status" className="-mt-3 mb-4 break-words text-[10px] text-muted">
          Database list unavailable; AgentOS default remains usable. {databaseError}
        </p>
      )}

      <nav aria-label="Observability views" className="mb-4 flex max-w-full flex-wrap gap-1 rounded-lg bg-primaryAccent/30 p-1">
        {OBSERVABILITY_VIEWS.map((item) => (
          <Button
            key={item}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={view === item}
            onClick={() => void setViewQuery(item)}
            className={`text-[10px] uppercase ${view === item ? 'bg-accent text-primary' : 'text-muted'}`}
          >
            {item === 'evals' ? 'Evaluations' : item}
          </Button>
        ))}
      </nav>

      {!isEndpointActive ? (
        <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">Connect to AgentOS to load observability data.</div>
      ) : view === 'traces' ? (
        <TracePanel
          page={traces}
          loading={tracesLoading}
          error={tracesError}
          selectedTraceId={traceQuery || ''}
          onSelectTrace={(traceId) => void setTraceQuery(traceId)}
          runFilter={runFilter}
          onRunFilterChange={setRunFilter}
          sessionFilter={sessionFilter}
          onSessionFilterChange={setSessionFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onApplyFilters={applyTraceFilters}
          onClearFilters={clearTraceFilters}
          onPageChange={(nextPage) => void setPageQuery(nextPage)}
          onRetry={retryCurrentView}
          sessionStats={sessionStats}
          statsError={sessionStatsError}
          onRetryStats={retryCurrentView}
          detail={traceDetail}
          detailLoading={traceDetailLoading}
          detailError={traceDetailError}
          onRetryDetail={retryCurrentView}
        />
      ) : view === 'evals' ? (
        <EvaluationPanel
          dbId={dbId}
          refreshKey={refreshKey}
          isEndpointActive={isEndpointActive}
          pageQuery={Math.max(1, evaluationPageQuery || 1)}
          setPageQuery={setEvaluationPageQuery}
          runIdQuery={evaluationRunQuery}
          setRunIdQuery={setEvaluationRunQuery}
          onRetry={retryCurrentView}
        />
      ) : (
        <MetricsPanel
          result={metrics}
          operationalResults={operationalMetrics}
          loading={metricsLoading}
          error={metricsError}
          startDate={metricsStartInput}
          endDate={metricsEndInput}
          tableInput={metricsTableInput}
          tableName={metricsTableQuery || ''}
          onStartDateChange={setMetricsStartInput}
          onEndDateChange={setMetricsEndInput}
          onTableInputChange={setMetricsTableInput}
          onApplyRange={applyMetricsRange}
          onRetry={retryCurrentView}
        />
      )}
    </main>
  )
}

export default ObservabilityExplorer
