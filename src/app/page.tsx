'use client'
import Sidebar from '@/components/chat/Sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { Suspense } from 'react'
import { useStore } from '@/store'
import WorkflowExplorer from '@/components/workflows/WorkflowExplorer'
import AgentExplorer from '@/components/factory/AgentExplorer'

export default function Home() {
  // Check if OS_SECURITY_KEY is defined on server-side
  const hasEnvToken = !!process.env.NEXT_PUBLIC_OS_SECURITY_KEY
  const envToken = process.env.NEXT_PUBLIC_OS_SECURITY_KEY || ''
  const activeView = useStore((state) => state.activeView)
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="flex h-screen bg-background/80">
        <Sidebar hasEnvToken={hasEnvToken} envToken={envToken} />
        {activeView === 'workflows' ? (
          <WorkflowExplorer />
        ) : activeView === 'agents' ? (
          <AgentExplorer />
        ) : (
          <ChatArea />
        )}
      </div>
    </Suspense>
  )
}
