'use client'
import Sidebar from '@/components/chat/Sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { Fragment, Suspense } from 'react'
import { useStore } from '@/store'
import WorkflowExplorer from '@/components/workflows/WorkflowExplorer'
import AgentExplorer from '@/components/factory/AgentExplorer'
import RunExplorer from '@/components/runs/RunExplorer'
import DataExplorer from '@/components/data/DataExplorer'
import ObservabilityExplorer from '@/components/observability/ObservabilityExplorer'
import SystemExplorer from '@/components/system/SystemExplorer'
import Overview from '@/components/overview/Overview'
import ToolsExplorer from '@/components/catalog/ToolsExplorer'

export default function Home() {
  const activeView = useStore((state) => state.activeView)
  const authVersion = useStore((state) => state.authVersion)
  const selectedEndpoint = useStore((state) => state.selectedEndpoint)
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="flex h-screen bg-background/80">
        <Sidebar />
        <Fragment key={`${selectedEndpoint}:${authVersion}`}>
          {activeView === 'overview' ? (
            <Overview />
          ) : activeView === 'workflows' ? (
            <WorkflowExplorer />
          ) : activeView === 'agents' ? (
            <AgentExplorer />
          ) : activeView === 'tools' ? (
            <ToolsExplorer />
          ) : activeView === 'runs' ? (
            <RunExplorer />
          ) : activeView === 'data' ? (
            <DataExplorer />
          ) : activeView === 'observability' ? (
            <ObservabilityExplorer />
          ) : activeView === 'system' ? (
            <SystemExplorer />
          ) : (
            <ChatArea />
          )}
        </Fragment>
      </div>
    </Suspense>
  )
}
