'use client'

import ChatInput from './ChatInput'
import MessageArea from './MessageArea'
const ChatArea = () => {
  return (
    <main className="relative m-1.5 flex min-w-0 flex-grow flex-col rounded-xl bg-background">
      <MessageArea />
      <div className="sticky bottom-0 ml-0 w-full min-w-0 px-3 pb-2 sm:ml-9 sm:w-auto sm:px-4">
        <ChatInput />
      </div>
    </main>
  )
}

export default ChatArea
