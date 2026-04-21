import { useState } from 'react'
import { Board } from './Board'
import type { CellState } from './Board'
import type { GameSession } from '../store/game'

const SHOT_TIME = 30

function ShotTimer({ timeLeft }: { timeLeft: number }) {
  const R      = 26
  const circ   = 2 * Math.PI * R
  const offset = circ * (1 - timeLeft / SHOT_TIME)
  const color  = timeLeft <= 5  ? '#ef4444'
               : timeLeft <= 10 ? '#f59e0b'
               : '#3b82f6'
  return (
    <svg width="52" height="52" viewBox="0 0 60 60" className="shrink-0">
      <circle cx="30" cy="30" r={R} fill="none" stroke="#374151" strokeWidth="5" />
      <circle
        cx="30" cy="30" r={R}
        fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 30 30)"
        style={{ transition: 'stroke-dashoffset 0.85s linear, stroke 0.3s' }}
      />
      <text x="30" y="36" textAnchor="middle" fontSize="17" fontWeight="bold"
        fill={color} style={{ transition: 'fill 0.3s' }}>
        {timeLeft}
      </text>
    </svg>
  )
}

interface Props {
  session: GameSession
  myBoardView: CellState[][]
  oppBoardView: CellState[][]
  myAnimating: Set<string>
  oppAnimating: Set<string>
  isMyTurn: boolean
  paused: boolean
  shotTimeLeft: number
  loading: boolean
  onShot: (row: number, col: number) => void
  onPause: () => void
  onSurrender: () => void
}

export function GameScreen({
  session, myBoardView, oppBoardView,
  myAnimating, oppAnimating,
  isMyTurn, paused, shotTimeLeft, loading,
  onShot, onPause, onSurrender,
}: Props) {
  const [confirmSurrender, setConfirmSurrender] = useState(false)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-5 p-6">

      {/* Nagłówek */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-white tracking-wide">Statki – Multiplayer</h1>
        <span className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 font-mono">
          {session.nickname} · {session.role === 'player1' ? 'Gracz 1' : 'Gracz 2'}
        </span>
      </div>

      {/* Baner tury */}
      <div className={`flex items-center gap-4 px-6 py-2.5 rounded-xl border font-semibold text-sm transition-colors ${
        isMyTurn
          ? 'bg-green-900/50 border-green-600 text-green-300'
          : 'bg-gray-800 border-gray-700 text-gray-400'
      }`}>
        {isMyTurn ? (
          <>
            <ShotTimer timeLeft={shotTimeLeft} />
            <span className="text-base">🎯 TWOJA TURA – strzelaj!</span>
          </>
        ) : (
          <>
            <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span>⏳ Tura przeciwnika…</span>
          </>
        )}
        {paused && (
          <span className="text-yellow-400 font-bold ml-4 animate-pulse">⏸ PAUZA</span>
        )}
      </div>

      {/* Plansza gry */}
      <div className="flex gap-6 items-start">

        {/* Moja plansza */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
            Moja plansza
          </p>
          <Board
            board={myBoardView}
            animating={myAnimating}
            disabled={true}
          />
        </div>

        {/* Separator VS */}
        <div className="self-center flex flex-col items-center gap-1 px-1">
          <div className="w-px h-16 bg-gray-700" />
          <span className="text-gray-600 font-bold text-sm">VS</span>
          <div className="w-px h-16 bg-gray-700" />
        </div>

        {/* Plansza przeciwnika */}
        <div className="flex flex-col items-center gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
            isMyTurn ? 'text-green-400' : 'text-gray-500'
          }`}>
            Plansza przeciwnika
          </p>
          <div className="relative">
            <Board
              board={oppBoardView}
              onCellClick={isMyTurn && !paused ? onShot : undefined}
              animating={oppAnimating}
              disabled={!isMyTurn || paused || loading}
            />

            {/* Nakładka: tura przeciwnika */}
            {!isMyTurn && !paused && (
              <div className="absolute inset-0 bg-gray-950/60 flex items-center justify-center rounded-sm">
                <span className="text-gray-400 text-sm font-semibold">Tura przeciwnika…</span>
              </div>
            )}

            {/* Nakładka pauzy */}
            {paused && (
              <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-sm">
                <span className="text-4xl">⏸</span>
                <span className="text-white text-lg font-bold tracking-widest">PAUZA</span>
                <span className="text-gray-400 text-xs">[Esc] aby wznowić</span>
              </div>
            )}

            {/* Nakładka ładowania danych */}
            {loading && (
              <div className="absolute inset-0 bg-gray-950/80 flex flex-col items-center justify-center gap-3 rounded-sm">
                <svg className="animate-spin h-8 w-8 text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-gray-400 text-xs">Ładowanie gry…</span>
              </div>
            )}
          </div>
        </div>

        {/* Panel boczny */}
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3 self-start ml-2 w-44">
          <button
            onClick={onPause}
            className={`text-sm font-bold rounded-lg px-3 py-2.5 transition-colors w-full ${
              paused
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {paused ? '▶ WZNÓW' : '⏸ PAUZA'}
          </button>

          <button
            onClick={() => setConfirmSurrender(true)}
            className="bg-red-900 hover:bg-red-700 text-red-200 text-sm font-bold rounded-lg px-3 py-2.5 transition-colors w-full"
          >
            🏳 PODDAJĘ SIĘ
          </button>
        </div>
      </div>

      {/* Modal potwierdzenia poddania */}
      {confirmSurrender && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setConfirmSurrender(false)}
        >
          <div
            className="bg-gray-900 border border-red-800 rounded-2xl p-8 flex flex-col gap-5 items-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl">🏳</div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-white font-bold text-lg">Poddajesz się?</p>
              <p className="text-gray-400 text-sm">Twój przeciwnik wygrywa tę partię.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setConfirmSurrender(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={() => { setConfirmSurrender(false); onSurrender() }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
              >
                Poddaję się
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
