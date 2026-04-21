import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface Message {
  id: number
  nickname: string
  text: string
  isMe: boolean
}

interface Props {
  gameId: string
  nickname: string
}

export function Chat({ gameId, nickname }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const bottomRef   = useRef<HTMLDivElement>(null)
  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const counterRef  = useRef(0)

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${gameId}`)
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        const { nick, text } = payload as { nick: string; text: string }
        setMessages(prev => [...prev, {
          id: ++counterRef.current,
          nickname: nick,
          text,
          isMe: nick === nickname,
        }])
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [gameId, nickname])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    const text = input.trim()
    if (!text || !channelRef.current) return
    channelRef.current.send({ type: 'broadcast', event: 'msg', payload: { nick: nickname, text } })
    setInput('')
  }

  return (
    <div className="bg-gray-900 rounded-xl flex flex-col w-56 h-72">
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Czat</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-700 text-xs text-center mt-6">Brak wiadomości…</p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.isMe ? 'items-end' : 'items-start'}`}>
            <span className="text-gray-600 text-[10px] mb-0.5">{m.nickname}</span>
            <span className={`text-xs px-2.5 py-1 rounded-xl max-w-[190px] break-words leading-tight ${
              m.isMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'
            }`}>
              {m.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-gray-800 flex gap-1.5 shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          maxLength={200}
          placeholder="Napisz…"
          className="flex-1 bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-600 min-w-0"
        />
        <button
          onClick={send}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
