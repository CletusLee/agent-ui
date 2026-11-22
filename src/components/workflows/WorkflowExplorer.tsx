'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Braces,
  ChevronDown,
  GitBranch,
  Layers,
  LoaderCircle,
  RefreshCw,
  Users,
  Workflow as WorkflowIcon
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import ComponentDetails from '@/components/factory/ComponentDetails'
import {
  getFactoryWorkflowDefinitionAPI,
  getFactoryRevisionAPI,
  getWorkflowRuntimeDetailsAPI,
  getWorkflowsAPI
} from '@/api/os'
import { useStore } from '@/store'
import {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowStepType,
  WorkflowSummary
} from '@/types/os'

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  agent: 'Agent',
  team: 'Team',
  executor: 'Python function',
  condition: 'Condition',
  parallel: 'Parallel group',
  runtime_step: 'AgentOS step'
}

const stepTypeLabel = (type: string) =>
  Object.prototype.hasOwnProperty.call(STEP_TYPE_LABELS, type)
    ? STEP_TYPE_LABELS[type as WorkflowStepType]
    : `Unsupported step (${type || 'unknown'})`

const EXECUTOR_DESCRIPTIONS: Record<string, string> = {
  evidence_gate: 'Checks the work item and required evidence before planning.',
  is_ready: 'Selects the ready or blocked path using the evidence gate result.',
  apply_candidate_change:
    'Applies the proposed change in an isolated workspace.',
  verify_candidate: 'Runs the acceptance command and records its result.',
  candidate_passed:
    'Selects expert review or rework based on candidate verification.',
  blocked_result:
    'Stops the flow and reports the missing evidence or failed check.',
  pending_approval:
    'Stops before release and marks the change as awaiting human review.',
  require_observability:
    'Checks that the Observability team produced a successful result.',
  require_governance:
    'Checks that the Governance team produced a successful result.'
}

const StepIcon = ({ type }: { type: WorkflowStepType }) => {
  const className = 'size-4 shrink-0 text-muted'

  if (type === 'agent') return <Bot className={className} />
  if (type === 'team') return <Users className={className} />
  if (type === 'executor') return <Braces className={className} />
  if (type === 'condition') return <GitBranch className={className} />
  return <Layers className={className} />
}

const workflowCounts = (steps: WorkflowStepDefinition[]) => {
  let count = 0
  const agents = new Set<string>()
  const teams = new Set<string>()

  const visit = (items: WorkflowStepDefinition[]) => {
    for (const step of items) {
      count += 1
      if (step.type === 'agent' && step.ref) agents.add(step.ref)
      if (step.type === 'team' && step.ref) teams.add(step.ref)
      if (step.steps) visit(step.steps)
      if (step.else_steps) visit(step.else_steps)
    }
  }

  visit(steps)
  return { count, agents: agents.size, teams: teams.size }
}

type StepRelationship = {
  label: string
  step?: WorkflowStepDefinition
  path?: string
}

type StepRelationships = {
  previous: StepRelationship
  next: StepRelationship
  parallelSiblings: Array<{ step: WorkflowStepDefinition; path: string }>
}

const findStepRelationships = (
  steps: WorkflowStepDefinition[],
  targetPath: string
): StepRelationships | null => {
  const visit = (
    items: WorkflowStepDefinition[],
    prefix: string,
    sequenceName: string,
    previousAtStart: StepRelationship,
    nextAtEnd: StepRelationship,
    parallelGroup?: {
      step: WorkflowStepDefinition
      path: string
      next: StepRelationship
      siblings: WorkflowStepDefinition[]
    }
  ): StepRelationships | null => {
    for (let index = 0; index < items.length; index += 1) {
      const step = items[index]
      const path = `${prefix}.${index}`
      const previous = parallelGroup
        ? {
            label: `Starts with parallel group ${parallelGroup.step.name}`,
            step: parallelGroup.step,
            path: parallelGroup.path
          }
        : index > 0
          ? {
              label: `Previous step in ${sequenceName}`,
              step: items[index - 1],
              path: `${prefix}.${index - 1}`
            }
          : previousAtStart
      const next = parallelGroup
        ? parallelGroup.next
        : index < items.length - 1
          ? {
              label: `Next step in ${sequenceName}`,
              step: items[index + 1],
              path: `${prefix}.${index + 1}`
            }
          : nextAtEnd

      if (path === targetPath) {
        return {
          previous,
          next,
          parallelSiblings: parallelGroup
            ? parallelGroup.siblings.flatMap((sibling, siblingIndex) =>
                siblingIndex === index
                  ? []
                  : [{
                      step: sibling,
                      path: `${prefix}.${siblingIndex}`
                    }]
              )
            : []
        }
      }

      const nextAfterStep: StepRelationship = parallelGroup
        ? parallelGroup.next
        : index < items.length - 1
          ? {
              label: `Next step after ${step.name}`,
              step: items[index + 1],
              path: `${prefix}.${index + 1}`
            }
          : nextAtEnd

      if (step.type === 'condition') {
        const truePath = visit(
          step.steps || [],
          `${path}.then`,
          `${step.name} true branch`,
          { label: `True branch starts at ${step.name}`, step, path },
          nextAfterStep
        )
        if (truePath) return truePath

        const falsePath = visit(
          step.else_steps || [],
          `${path}.else`,
          `${step.name} false branch`,
          { label: `False branch starts at ${step.name}`, step, path },
          nextAfterStep
        )
        if (falsePath) return falsePath
      }

      if (step.type === 'parallel') {
        const nextAfterGroup = nextAfterStep.step
          ? {
              ...nextAfterStep,
              label: `After all ${step.name} members finish`
            }
          : { label: `Workflow end after ${step.name} members finish` }
        const parallelPath = visit(
          step.steps || [],
          `${path}.parallel`,
          `${step.name} parallel members`,
          { label: `Parallel group ${step.name} starts`, step, path },
          nextAfterGroup,
          {
            step,
            path,
            next: nextAfterGroup,
            siblings: step.steps || []
          }
        )
        if (parallelPath) return parallelPath
      }
    }

    return null
  }

  return visit(
    steps,
    'root',
    'workflow sequence',
    { label: 'Workflow start' },
    { label: 'End of workflow' }
  )
}

const StepCard = ({
  step,
  path,
  selected,
  onSelect
}: {
  step: WorkflowStepDefinition
  path: string
  selected: boolean
  onSelect: (step: WorkflowStepDefinition, path: string) => void
}) => (
  <button
    type="button"
    onClick={() => onSelect(step, path)}
    aria-pressed={selected}
    className={`flex w-full min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4 ${selected ? 'border-primary/50 bg-accent' : 'border-primary/10 bg-background hover:border-primary/30 hover:bg-accent/70'}`}
  >
    <span className="mt-0.5 rounded-lg border border-primary/10 bg-primaryAccent p-2">
      <StepIcon type={step.type} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block whitespace-normal break-words text-sm font-medium leading-5 text-primary [overflow-wrap:anywhere]">
        {step.name}
      </span>
      <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted [overflow-wrap:anywhere]">
        {stepTypeLabel(step.type)}
        {step.ref ? ` · ${step.ref}` : ''}
      </span>
    </span>
  </button>
)

const WorkflowSteps = ({
  steps,
  prefix,
  selectedPath,
  onSelect
}: {
  steps: WorkflowStepDefinition[]
  prefix: string
  selectedPath: string
  onSelect: (step: WorkflowStepDefinition, path: string) => void
}) => (
  <div className="space-y-3">
    {steps.map((step, index) => {
      const path = `${prefix}.${index}`
      const nestedSteps = step.steps || []
      const alternateSteps = step.else_steps || []

      return (
        <div key={path} className="relative">
          <StepCard
            step={step}
            path={path}
            selected={selectedPath === path}
            onSelect={onSelect}
          />

          {step.type === 'condition' && (
            <div
              className="mt-3 grid min-w-0 gap-2"
              style={{
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))'
              }}
            >
              <div className="min-w-0 rounded-xl border border-positive/20 bg-positive/5 p-2 sm:p-3">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-positive">
                  Condition true
                </div>
                {nestedSteps.length > 0 ? (
                  <WorkflowSteps
                    steps={nestedSteps}
                    prefix={`${path}.then`}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                  />
                ) : (
                  <p className="text-xs text-muted">No steps in this branch.</p>
                )}
              </div>
              <div className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 p-2 sm:p-3">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-destructive">
                  Condition false
                </div>
                {alternateSteps.length > 0 ? (
                  <WorkflowSteps
                    steps={alternateSteps}
                    prefix={`${path}.else`}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                  />
                ) : (
                  <p className="text-xs text-muted">No steps in this branch.</p>
                )}
              </div>
            </div>
          )}

          {step.type === 'parallel' && (
            <div className="mt-3 min-w-0 rounded-xl border border-primary/10 bg-primaryAccent/70 p-2 sm:p-3">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                Run in parallel
              </div>
              <div
                className="grid min-w-0 gap-2"
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))'
                }}
              >
                {nestedSteps.map((child, childIndex) => {
                  const childPath = `${path}.parallel.${childIndex}`
                  return (
                    <StepCard
                      key={childPath}
                      step={child}
                      path={childPath}
                      selected={selectedPath === childPath}
                      onSelect={onSelect}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {index < steps.length - 1 && (
            <div className="flex h-7 items-center pl-7 text-muted/60">
              <span className="h-5 border-l border-primary/15" />
              <ChevronDown className="-ml-[9px] size-4 bg-background" />
            </div>
          )}
        </div>
      )
    })}
  </div>
)

const GraphConnector = () => (
  <div
    aria-hidden="true"
    className="flex h-8 flex-col items-center justify-center text-muted/70"
  >
    <span className="h-4 border-l border-primary/25" />
    <ChevronDown className="-mt-1 size-4 bg-background" />
  </div>
)

const WorkflowGraph = ({
  steps,
  prefix,
  selectedPath,
  onSelect,
  sequenceConnectors = true
}: {
  steps: WorkflowStepDefinition[]
  prefix: string
  selectedPath: string
  onSelect: (step: WorkflowStepDefinition, path: string) => void
  sequenceConnectors?: boolean
}) => (
  <div role="group" aria-label="Workflow graph sequence" className="min-w-0">
    {steps.map((step, index) => {
      const path = `${prefix}.${index}`
      const nestedSteps = step.steps || []
      const alternateSteps = step.else_steps || []

      return (
        <div key={path} className="min-w-0">
          <div className="mx-auto w-full max-w-2xl">
            <StepCard
              step={step}
              path={path}
              selected={selectedPath === path}
              onSelect={onSelect}
            />
          </div>

          {step.type === 'condition' && (
            <div
              className="mt-3 grid min-w-0 gap-3"
              style={{
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))'
              }}
            >
              <section
                aria-label={`${step.name} true branch`}
                className="min-w-0 rounded-xl border border-positive/20 bg-positive/5 p-2 sm:p-3"
              >
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-positive">
                  True branch
                </h4>
                <GraphConnector />
                {nestedSteps.length > 0 ? (
                  <WorkflowGraph
                    steps={nestedSteps}
                    prefix={`${path}.then`}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                  />
                ) : (
                  <p className="text-xs text-muted">No steps in this branch.</p>
                )}
              </section>
              <section
                aria-label={`${step.name} false branch`}
                className="min-w-0 rounded-xl border border-destructive/20 bg-destructive/5 p-2 sm:p-3"
              >
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-destructive">
                  False branch
                </h4>
                <GraphConnector />
                {alternateSteps.length > 0 ? (
                  <WorkflowGraph
                    steps={alternateSteps}
                    prefix={`${path}.else`}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                  />
                ) : (
                  <p className="text-xs text-muted">No steps in this branch.</p>
                )}
              </section>
            </div>
          )}

          {step.type === 'parallel' && (
            <section
              aria-label={`${step.name} parallel group`}
              className="mt-3 min-w-0 rounded-xl border border-primary/15 bg-primaryAccent/70 p-2 sm:p-3"
            >
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Run in parallel · {nestedSteps.length} steps
              </h4>
              <GraphConnector />
              {nestedSteps.length > 0 ? (
                <div
                  className="grid min-w-0 gap-2"
                  style={{
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))'
                  }}
                >
                  <WorkflowGraph
                    steps={nestedSteps}
                    prefix={`${path}.parallel`}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                    sequenceConnectors={false}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted">No parallel steps.</p>
              )}
            </section>
          )}

          {sequenceConnectors && index < steps.length - 1 && <GraphConnector />}
        </div>
      )
    })}
  </div>
)

const StepRelationshipsPanel = ({
  relationships,
  onSelectStep
}: {
  relationships: StepRelationships
  onSelectStep: (step: WorkflowStepDefinition, path: string) => void
}) => {
  const relationControl = (title: string, relation: StepRelationship) => (
    <div className="rounded-lg border border-primary/10 bg-accent p-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        {title}
      </div>
      {relation.step && relation.path ? (
        <button
          type="button"
          aria-label={`Open ${title.toLowerCase()}: ${relation.step.name}`}
          onClick={() => onSelectStep(relation.step!, relation.path!)}
          className="w-full min-w-0 text-left"
        >
          <span className="block text-[10px] leading-4 text-muted">
            {relation.label}
          </span>
          <span className="mt-1 block break-words text-xs font-medium text-primary">
            {relation.step.name}
          </span>
          <span className="mt-1 block break-all font-mono text-[10px] text-muted">
            {stepTypeLabel(relation.step.type)} · {relation.path}
          </span>
        </button>
      ) : (
        <p className="text-xs leading-5 text-muted">{relation.label}</p>
      )}
    </div>
  )

  return (
    <section aria-label="Step relationships" className="space-y-2">
      <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted">
        Step relationships
      </h3>
      {relationControl('Previous step', relationships.previous)}
      {relationControl('Next step', relationships.next)}
      {relationships.parallelSiblings.length > 0 && (
        <div className="rounded-lg border border-primary/10 bg-accent p-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
            Runs alongside
          </div>
          <div className="space-y-1">
            {relationships.parallelSiblings.map(({ step, path }) => (
              <button
                key={path}
                type="button"
                aria-label={`Open parallel step: ${step.name}`}
                onClick={() => onSelectStep(step, path)}
                className="w-full min-w-0 rounded-md px-1 py-1 text-left hover:bg-background"
              >
                <span className="block break-words text-xs text-primary">
                  {step.name}
                </span>
                <span className="mt-1 block break-all font-mono text-[10px] text-muted">
                  {stepTypeLabel(step.type)} · {path}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const WorkflowExplorer = () => {
  const { selectedEndpoint, authToken, isEndpointActive } = useStore()
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null)
  const [revision, setRevision] = useState('')
  const [revisionError, setRevisionError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [definitionError, setDefinitionError] = useState('')
  const [definitionNotice, setDefinitionNotice] = useState('')
  const [selectedStep, setSelectedStep] =
    useState<WorkflowStepDefinition | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedComponent, setSelectedComponent] = useState<{
    kind: 'agent' | 'team'
    id: string
    returnTo?: { kind: 'team'; id: string }
  } | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [workflowView, setWorkflowView] = useState<'tree' | 'graph'>('tree')
  const [isWideViewport, setIsWideViewport] = useState(false)
  const detailsPanelRef = useRef<HTMLElement>(null)
  const closeDetailsButtonRef = useRef<HTMLButtonElement>(null)
  const stepTriggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1536px)')
    const syncViewport = () => setIsWideViewport(mediaQuery.matches)

    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  const closeStepDetails = useCallback(() => {
    setDetailsOpen(false)
    window.requestAnimationFrame(() => stepTriggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!detailsOpen || isWideViewport) return

    const panel = detailsPanelRef.current
    if (!panel) return

    closeDetailsButtonRef.current?.focus()

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeStepDetails()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!panel.contains(active)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeStepDetails, detailsOpen, isWideViewport])

  useEffect(() => {
    const controller = new AbortController()
    setWorkflows([])
    setDefinition(null)
    setRevision('')
    setRevisionError('')
    setListError('')
    setListLoading(true)
    setSelectedWorkflowId('')

    if (!isEndpointActive) {
      setListLoading(false)
      return () => controller.abort()
    }

    Promise.allSettled([
      getWorkflowsAPI(selectedEndpoint, authToken, controller.signal),
      getFactoryRevisionAPI(selectedEndpoint, authToken, controller.signal)
    ])
      .then(([workflowResult, revisionResult]) => {
        if (controller.signal.aborted) return

        if (workflowResult.status === 'fulfilled') {
          setWorkflows(workflowResult.value)
          setSelectedWorkflowId(workflowResult.value[0]?.id || '')
        } else {
          setListError(
            workflowResult.reason instanceof Error
              ? workflowResult.reason.message
              : 'Unable to load workflows.'
          )
        }
        if (revisionResult.status === 'fulfilled') {
          setRevision(revisionResult.value.revision)
        } else {
          setRevisionError(
            revisionResult.reason instanceof Error
              ? revisionResult.reason.message
              : 'Factory revision is unavailable.'
          )
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setListError(
            error instanceof Error ? error.message : 'Unable to load workflows.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, refreshKey])

  useEffect(() => {
    if (!selectedWorkflowId || !isEndpointActive) {
      setDefinition(null)
      return
    }

    const controller = new AbortController()
    setDefinition(null)
    setSelectedStep(null)
    setSelectedPath('')
    setSelectedComponent(null)
    setDetailsOpen(false)
    setDefinitionError('')
    setDefinitionNotice('')
    setDefinitionLoading(true)

    const showDefinition = (workflow: WorkflowDefinition) => {
      if (controller.signal.aborted) return
      setDefinition(workflow)
      setSelectedStep(workflow.steps[0] || null)
      setSelectedPath(workflow.steps.length > 0 ? 'root.0' : '')
      setDefinitionLoading(false)
    }

    getWorkflowRuntimeDetailsAPI(
      selectedEndpoint,
      selectedWorkflowId,
      authToken,
      controller.signal
    )
      .then((runtimeWorkflow) => {
        showDefinition(runtimeWorkflow)
        setDefinitionNotice('Loading Factory definition details…')
        return getFactoryWorkflowDefinitionAPI(
          selectedEndpoint,
          selectedWorkflowId,
          authToken,
          controller.signal
        )
          .then((factoryWorkflow) => {
            if (controller.signal.aborted) return
            setDefinition(factoryWorkflow)
            setDefinitionNotice('')
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted) {
              const reason =
                error instanceof Error
                  ? error.message
                  : 'Factory definition details are unavailable.'
              setDefinitionNotice(
                `${reason} Showing the AgentOS runtime workflow.`
              )
            }
          })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDefinitionNotice('')
          getFactoryWorkflowDefinitionAPI(
            selectedEndpoint,
            selectedWorkflowId,
            authToken,
            controller.signal
          )
            .then((factoryWorkflow) => showDefinition(factoryWorkflow))
            .catch((factoryError: unknown) => {
              if (controller.signal.aborted) return
              const runtimeMessage =
                error instanceof Error
                  ? error.message
                  : 'AgentOS workflow details are unavailable.'
              const factoryMessage =
                factoryError instanceof Error
                  ? factoryError.message
                  : 'Factory workflow details are unavailable.'
              setDefinitionError(`${runtimeMessage}. ${factoryMessage}`)
            })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDefinitionLoading(false)
      })

    return () => controller.abort()
  }, [
    selectedEndpoint,
    authToken,
    isEndpointActive,
    selectedWorkflowId,
    refreshKey
  ])

  const handleSelectStep = (step: WorkflowStepDefinition, path: string) => {
    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      !detailsPanelRef.current?.contains(activeElement)
    ) {
      stepTriggerRef.current = activeElement
    }
    setSelectedStep(step)
    setSelectedPath(path)
    setDetailsOpen(true)
    setSelectedComponent(
      (step.type === 'agent' || step.type === 'team') && step.ref
        ? { kind: step.type, id: step.ref }
        : null
    )
  }

  const selectedSummary = workflows.find(
    (workflow) => workflow.id === selectedWorkflowId
  )
  const selectedReference = selectedStep?.ref || 'No executor reference'
  const counts = definition ? workflowCounts(definition.steps) : null
  const selectedRelationships =
    definition && selectedPath
      ? findStepRelationships(definition.steps, selectedPath)
      : null

  const branchItems = (
    label: string,
    steps: WorkflowStepDefinition[],
    prefix: string,
    branch: 'true' | 'false' | 'parallel'
  ) => (
    <section
      className={`rounded-lg border p-3 ${branch === 'true' ? 'border-positive/20 bg-positive/5' : branch === 'false' ? 'border-destructive/20 bg-destructive/5' : 'border-primary/10 bg-primaryAccent/60'}`}
    >
      <div
        className={`mb-2 text-[10px] font-medium uppercase tracking-wide ${branch === 'true' ? 'text-positive' : branch === 'false' ? 'text-destructive' : 'text-muted'}`}
      >
        {label}
      </div>
      {steps.length > 0 ? (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <button
              key={`${prefix}.${index}`}
              type="button"
              onClick={() => handleSelectStep(step, `${prefix}.${index}`)}
              className="flex w-full min-w-0 items-start gap-2 rounded-lg border border-primary/10 bg-background p-2 text-left hover:border-primary/30"
            >
              <StepIcon type={step.type} />
              <span className="min-w-0">
                <span className="block whitespace-normal break-words text-xs text-primary [overflow-wrap:anywhere]">
                  {step.name}
                </span>
                <span className="mt-1 block whitespace-normal text-[10px] leading-4 text-muted [overflow-wrap:anywhere]">
                  {stepTypeLabel(step.type)}
                  {step.ref ? ` · ${step.ref}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No steps in this path.</p>
      )}
    </section>
  )

  return (
    <main className="m-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/10 px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-5 text-primary" />
            <h1 className="text-lg font-medium text-primary">Workflows</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            View the workflow definitions currently loaded by AgentOS.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {revision && (
            <span className="rounded-lg border border-primary/10 bg-accent px-3 py-2 font-mono text-xs text-muted">
              Definition {revision}
            </span>
          )}
          {revisionError && (
            <span className="text-xs text-muted">
              Factory revision unavailable
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={listLoading || !isEndpointActive}
            className="border-primary/15 bg-accent text-primary hover:bg-primaryAccent"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[14rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <aside className="overflow-y-auto border-b border-primary/10 p-4 xl:border-b-0 xl:border-r">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
            Available workflows
          </div>
          {listLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted">
              <LoaderCircle className="size-4 animate-spin" />
              Loading workflows
            </div>
          ) : listError ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{listError}</span>
            </div>
          ) : !isEndpointActive ? (
            <p className="text-xs leading-5 text-muted">
              Connect to AgentOS to view its workflows.
            </p>
          ) : workflows.length === 0 ? (
            <p className="text-xs leading-5 text-muted">
              AgentOS has no registered workflows.
            </p>
          ) : (
            <div className="space-y-2">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                  aria-pressed={selectedWorkflowId === workflow.id}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedWorkflowId === workflow.id ? 'border-primary/40 bg-accent' : 'border-primary/10 bg-background hover:bg-accent/60'}`}
                >
                  <span className="block text-sm font-medium text-primary">
                    {workflow.name || workflow.id}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted">
                    {workflow.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5 lg:p-7">
          {definitionLoading ? (
            <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" />
              Loading workflow definition
            </div>
          ) : definitionError ? (
            <div className="mx-auto mt-12 flex max-w-lg items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{definitionError}</span>
            </div>
          ) : !selectedWorkflowId ? (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted">
              Select a workflow to inspect its steps.
            </div>
          ) : definition ? (
            <div className="mx-auto w-full max-w-5xl">
              {definitionNotice && (
                <div className="mb-4 rounded-lg border border-primary/15 bg-accent px-3 py-2 text-xs leading-5 text-muted">
                  {definitionNotice}
                </div>
              )}
              <div className="mb-7">
                <h2 className="text-xl font-medium text-primary">
                  {definition.name || selectedSummary?.name || definition.id}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  {definition.description || 'No description provided.'}
                </p>
                {counts && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
                    <span>ID {definition.id}</span>
                    <span>{counts.count} steps</span>
                    <span>{counts.agents} agents</span>
                    <span>{counts.teams} teams</span>
                    {definition.revision ? (
                      <span>Revision {definition.revision}</span>
                    ) : (
                      <span>
                        Source {definition.source || 'AgentOS runtime'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Workflow view
                </span>
                <div
                  role="group"
                  aria-label="Workflow view"
                  className="flex items-center gap-1 rounded-lg border border-primary/10 bg-accent p-1"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={workflowView === 'tree' ? 'outline' : 'ghost'}
                    aria-pressed={workflowView === 'tree'}
                    onClick={() => setWorkflowView('tree')}
                    className="h-8 px-3 text-xs"
                  >
                    Tree
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={workflowView === 'graph' ? 'outline' : 'ghost'}
                    aria-pressed={workflowView === 'graph'}
                    onClick={() => setWorkflowView('graph')}
                    className="h-8 px-3 text-xs"
                  >
                    Graph
                  </Button>
                </div>
              </div>
              {definition.steps.length > 0 ? (
                workflowView === 'tree' ? (
                  <WorkflowSteps
                    steps={definition.steps}
                    prefix="root"
                    selectedPath={selectedPath}
                    onSelect={handleSelectStep}
                  />
                ) : (
                  <WorkflowGraph
                    steps={definition.steps}
                    prefix="root"
                    selectedPath={selectedPath}
                    onSelect={handleSelectStep}
                  />
                )
              ) : (
                <p className="rounded-xl border border-primary/10 bg-accent p-4 text-sm text-muted">
                  This workflow has no steps.
                </p>
              )}
              <details className="mt-5 rounded-xl border border-primary/10 bg-accent p-4">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  Full workflow definition
                </summary>
                <pre className="mt-3 max-h-[32rem] overflow-auto border-t border-primary/10 pt-3 font-mono text-[11px] leading-5 text-muted">
                  {JSON.stringify(definition, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>

        {detailsOpen && (
          <button
            type="button"
            aria-label="Close step details"
            onClick={closeStepDetails}
            className="fixed inset-0 z-40 bg-background/65 2xl:hidden"
          />
        )}
        <aside
          ref={detailsPanelRef}
          role={detailsOpen && !isWideViewport ? 'dialog' : undefined}
          aria-modal={detailsOpen && !isWideViewport ? true : undefined}
          aria-labelledby="workflow-step-details-title"
          tabIndex={detailsOpen && !isWideViewport ? -1 : undefined}
          className={`${detailsOpen ? 'fixed inset-y-3 right-3 z-50 w-[min(94vw,30rem)] rounded-xl border border-primary/15 bg-background shadow-2xl' : 'hidden'} min-h-0 overflow-y-auto p-4 sm:p-5 2xl:static 2xl:z-auto 2xl:block 2xl:w-auto 2xl:rounded-none 2xl:border-y-0 2xl:border-l 2xl:border-r-0 2xl:bg-background 2xl:shadow-none`}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div
              id="workflow-step-details-title"
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              Step details
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={closeStepDetails}
              ref={closeDetailsButtonRef}
              data-inspector-close
              className="h-8 border-primary/15 text-xs text-muted 2xl:hidden"
            >
              Close
            </Button>
          </div>
          {selectedStep && selectedRelationships && (
            <StepRelationshipsPanel
              relationships={selectedRelationships}
              onSelectStep={handleSelectStep}
            />
          )}
          {selectedComponent ? (
            <ComponentDetails
              kind={selectedComponent.kind}
              id={selectedComponent.id}
              onSelectAgent={(agentId) =>
                setSelectedComponent((current) => ({
                  kind: 'agent',
                  id: agentId,
                  returnTo:
                    current?.kind === 'team'
                      ? { kind: 'team', id: current.id }
                      : current?.returnTo
                }))
              }
              onBack={
                selectedComponent.returnTo
                  ? () =>
                      setSelectedComponent(selectedComponent.returnTo || null)
                  : undefined
              }
              backLabel={
                selectedComponent.returnTo
                  ? `Back to ${selectedComponent.returnTo.id}`
                  : undefined
              }
            />
          ) : selectedStep && definition ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-primary">
                  <StepIcon type={selectedStep.type} />
                  <h3 className="text-sm font-medium">{selectedStep.name}</h3>
                </div>
                <p className="mt-2 pl-6 text-xs text-muted">
                  {stepTypeLabel(selectedStep.type)}
                </p>
              </div>
              <div className="space-y-2 rounded-xl border border-primary/10 bg-accent p-3">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Reference
                </div>
                <div className="break-all font-mono text-xs text-primary">
                  {selectedReference}
                </div>
                <div className="mt-3 border-t border-primary/10 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted">
                  Workflow path
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-muted">
                  {selectedPath}
                </div>
              </div>
              {selectedStep.type === 'executor' && selectedStep.ref && (
                <p className="text-xs leading-5 text-muted">
                  {EXECUTOR_DESCRIPTIONS[selectedStep.ref] ||
                    'A Python function registered by the AgentOS application.'}
                </p>
              )}
              {selectedStep.type === 'condition' && (
                <div className="space-y-2 text-xs leading-5 text-muted">
                  <p>
                    <span className="text-positive">True</span> follows the
                    green branch.
                  </p>
                  <p>
                    <span className="text-destructive">False</span> follows the
                    red branch.
                  </p>
                  {selectedStep.ref &&
                    EXECUTOR_DESCRIPTIONS[selectedStep.ref] && (
                      <p>{EXECUTOR_DESCRIPTIONS[selectedStep.ref]}</p>
                    )}
                </div>
              )}
              {selectedStep.type === 'parallel' && (
                <>
                  <p className="text-xs leading-5 text-muted">
                    {selectedStep.steps?.length || 0} steps run concurrently.
                  </p>
                  {branchItems(
                    'Run in parallel',
                    selectedStep.steps || [],
                    `${selectedPath}.parallel`,
                    'parallel'
                  )}
                </>
              )}
              {selectedStep.type === 'condition' && (
                <div className="space-y-3">
                  {branchItems(
                    'Condition true',
                    selectedStep.steps || [],
                    `${selectedPath}.then`,
                    'true'
                  )}
                  {branchItems(
                    'Condition false',
                    selectedStep.else_steps || [],
                    `${selectedPath}.else`,
                    'false'
                  )}
                </div>
              )}
              <div className="border-t border-primary/10 pt-4">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Workflow definition
                </div>
                <div className="mt-2 text-xs text-primary">
                  {definition.name || definition.id}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  {definition.revision}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted">
              Select a step to see its type, reference, and configuration
              details.
            </p>
          )}
        </aside>
      </div>
    </main>
  )
}

export default WorkflowExplorer
