import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface GameRow {
  id: string
  player1_nickname: string | null
  player2_nickname: string | null
  player1_id: string
  player2_id: string | null
  winner_id: string | null
  created_at: string
}

interface Props {
  currentPlayerId: string
  onBack: () => void
}

export function Leaderboard({ currentPlayerId, onBack }: Props) {
  const [rows, setRows]     = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('games')
      .select('id, player1_nickname, player2_nickname, player1_id, player2_id, winner_id, created_at')
      .eq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setRows(data as GameRow[])
        setLoading(false)
      })
  }, [])

  function winnerName(row: GameRow): string {
    if (!row.winner_id) return '—'
    if (row.winner_id === row.player1_id) return row.player1_nickname ?? 'Gracz 1'
    return row.player2_nickname ?? 'Gracz 2'
  }

  function myResult(row: GameRow): 'win' | 'loss' | null {
    if (row.player1_id !== currentPlayerId && row.player2_id !== currentPlayerId) return null
    return row.winner_id === currentPlayerId ? 'win' : 'loss'
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-3xl font-bold text-white tracking-widest">WYNIKI</h1>
        <p className="text-gray-500 text-sm">Historia zakończonych gier</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden w-full max-w-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span className="text-gray-500 text-sm">Ładowanie…</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-16">Brak zakończonych gier</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-semibold">Gracz 1</th>
                <th className="px-4 py-3 text-left font-semibold">Gracz 2</th>
                <th className="px-4 py-3 text-left font-semibold">Zwycięzca</th>
                <th className="px-4 py-3 text-right font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const result = myResult(row)
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-800/20'} ${
                      result === 'win'  ? 'bg-green-900/10' :
                      result === 'loss' ? 'bg-red-900/10'   : ''
                    }`}
                  >
                    <td className={`px-4 py-2.5 ${row.player1_id === currentPlayerId ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>
                      {row.player1_nickname ?? '?'}
                    </td>
                    <td className={`px-4 py-2.5 ${row.player2_id === currentPlayerId ? 'text-blue-400 font-semibold' : 'text-gray-300'}`}>
                      {row.player2_nickname ?? '?'}
                    </td>
                    <td className="px-4 py-2.5 text-yellow-400 font-semibold">
                      {winnerName(row)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <button
        onClick={onBack}
        className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
      >
        ← Powrót
      </button>
    </div>
  )
}
