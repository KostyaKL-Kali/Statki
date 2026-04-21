import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { GameSession } from '../store/game'

function getPlayerId(): string {
  let id = sessionStorage.getItem('player_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('player_id', id)
  }
  return id
}

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface Props {
  onReady: (session: GameSession) => void
  onAIReady: (nickname: string) => void
  onLeaderboard: () => void
}

export function Lobby({ onReady, onAIReady, onLeaderboard }: Props) {
  const [nickname, setNickname]       = useState(() => sessionStorage.getItem('nickname') ?? '')
  const [joinCode, setJoinCode]       = useState('')
  const [phase, setPhase]             = useState<'idle' | 'waiting'>('idle')
  const [createdCode, setCreatedCode] = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  function saveNickname(v: string) {
    setNickname(v)
    sessionStorage.setItem('nickname', v)
  }

  async function handleCreate() {
    const nick = nickname.trim()
    if (!nick) { setError('Podaj pseudonim'); return }
    setLoading(true)
    setError(null)

    const playerId = getPlayerId()
    const roomCode = makeRoomCode()

    const { data, error: err } = await supabase
      .from('games')
      .insert({ player1_id: playerId, player1_nickname: nick, room_code: roomCode, status: 'waiting' })
      .select()
      .single()

    setLoading(false)
    if (err || !data) { setError(err?.message ?? 'Błąd tworzenia gry'); return }

    setCreatedCode(data.room_code)
    setPhase('waiting')

    const channel = supabase
      .channel(`lobby-${data.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${data.id}` },
        (payload) => {
          const updated = payload.new as { player2_id: string | null }
          if (updated.player2_id) {
            supabase.removeChannel(channel)
            onReady({ gameId: data.id, playerId, nickname: nick, role: 'player1' })
          }
        },
      )
      .subscribe()

    channelRef.current = channel
  }

  async function handleJoin() {
    const nick = nickname.trim()
    const code = joinCode.trim().toUpperCase()
    if (!nick) { setError('Podaj pseudonim'); return }
    if (code.length !== 6) { setError('Kod pokoju musi mieć 6 znaków'); return }
    setLoading(true)
    setError(null)

    const playerId = getPlayerId()

    const { data: game, error: findErr } = await supabase
      .from('games')
      .select()
      .eq('room_code', code)
      .eq('status', 'waiting')
      .single()

    if (findErr || !game) {
      setLoading(false)
      setError('Nie znaleziono gry o tym kodzie lub jest już pełna')
      return
    }

    if (game.player1_id === playerId) {
      setLoading(false)
      setError('Nie możesz dołączyć do własnej gry')
      return
    }

    const { data, error: joinErr } = await supabase
      .from('games')
      .update({ player2_id: playerId, player2_nickname: nick, status: 'placement' })
      .eq('id', game.id)
      .select()
      .single()

    setLoading(false)
    if (joinErr || !data) { setError(joinErr?.message ?? 'Błąd dołączania do gry'); return }

    onReady({ gameId: data.id, playerId, nickname: nick, role: 'player2' })
  }

  function handleAI() {
    const nick = nickname.trim()
    if (!nick) { setError('Podaj pseudonim'); return }
    setError(null)
    onAIReady(nick)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-4xl font-bold text-white tracking-widest">STATKI</h1>
        <p className="text-gray-500 text-sm">Gra wojenna na planszy 10×10</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col gap-6 w-80">

        {/* Pseudonim */}
        <div className="flex flex-col gap-2">
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
            Pseudonim
          </label>
          <input
            type="text"
            maxLength={20}
            placeholder="Twój nick…"
            value={nickname}
            onChange={e => saveNickname(e.target.value)}
            disabled={phase === 'waiting'}
            className="bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-40 placeholder-gray-600"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center -mt-2">{error}</p>
        )}

        {phase === 'waiting' ? (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-8 py-5 flex flex-col items-center gap-2">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Kod pokoju</p>
              <p className="text-4xl font-bold text-white tracking-[0.25em] font-mono select-all">
                {createdCode}
              </p>
              <p className="text-gray-600 text-xs">Podaj ten kod znajomemu</p>
            </div>
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Oczekiwanie na drugiego gracza…
            </div>
          </div>
        ) : (
          <>
            {/* vs Komputer */}
            <button
              onClick={handleAI}
              disabled={loading}
              className="bg-green-700 hover:bg-green-600 active:bg-green-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors tracking-wide"
            >
              🤖 GRA vs KOMPUTER
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800"/>
              <span className="text-gray-600 text-xs">multiplayer</span>
              <div className="flex-1 h-px bg-gray-800"/>
            </div>

            {/* Stwórz grę */}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors tracking-wide"
            >
              {loading ? '…' : 'STWÓRZ GRĘ'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800"/>
              <span className="text-gray-600 text-xs">lub</span>
              <div className="flex-1 h-px bg-gray-800"/>
            </div>

            {/* Dołącz do gry */}
            <div className="flex flex-col gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="WPISZ KOD"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                className="bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-amber-500 focus:outline-none text-center font-mono text-lg uppercase tracking-[0.3em] placeholder-gray-600 placeholder:tracking-wider placeholder:text-base"
              />
              <button
                onClick={handleJoin}
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors tracking-wide"
              >
                {loading ? '…' : 'DOŁĄCZ DO GRY'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tabela wyników */}
      <button
        onClick={onLeaderboard}
        className="text-gray-600 hover:text-gray-400 text-sm transition-colors underline underline-offset-2"
      >
        Tabela wyników →
      </button>
    </div>
  )
}
