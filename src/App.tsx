import { useState, useEffect } from 'react'
import { Board } from './components/Board'
import { ShipPanel } from './components/ShipPanel'
import { Lobby } from './components/Lobby'
import type { CellState } from './components/Board'
import type { SelectedShip } from './components/ShipPanel'
import { SHIP_DEFS } from './store/ships'
import type { ShipType } from './store/ships'
import type { GameSession } from './store/game'

const SHOT_TIME = 30

function calcCells(row: number, col: number, size: number, orientation: 'h' | 'v'): string[] {
  return Array.from({ length: size }, (_, i) => {
    const r = orientation === 'v' ? row + i : row
    const c = orientation === 'h' ? col + i : col
    return `${r}-${c}`
  })
}

function isOccupied(state: CellState): boolean {
  return state === 'ship' || state === 'mine'
}

function isValidPlacement(cells: string[], board: CellState[][]): boolean {
  const cellSet = new Set(cells)
  for (const key of cells) {
    const [r, c] = key.split('-').map(Number)
    if (r < 0 || r >= 10 || c < 0 || c >= 10) return false
    if (isOccupied(board[r][c])) return false
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr
        const nc = c + dc
        if (
          nr >= 0 && nr < 10 && nc >= 0 && nc < 10 &&
          isOccupied(board[nr][nc]) &&
          !cellSet.has(`${nr}-${nc}`)
        ) return false
      }
    }
  }
  return true
}

const initialRemaining = () =>
  Object.fromEntries(SHIP_DEFS.map(s => [s.type, s.total])) as Record<ShipType, number>

const emptyRemaining = () =>
  Object.fromEntries(SHIP_DEFS.map(s => [s.type, 0])) as Record<ShipType, number>

const emptyBoard = (): CellState[][] =>
  Array.from({ length: 10 }, () => Array(10).fill('empty'))

function generateRandomBoard(): CellState[][] {
  while (true) {
    const board: CellState[][] = emptyBoard()
    let ok = true

    outer: for (const def of SHIP_DEFS) {
      for (let placed = 0; placed < def.total; placed++) {
        let found = false
        for (let attempt = 0; attempt < 500; attempt++) {
          const orientation: 'h' | 'v' = Math.random() < 0.5 ? 'h' : 'v'
          const row = Math.floor(Math.random() * 10)
          const col = Math.floor(Math.random() * 10)
          const cells = calcCells(row, col, def.size, orientation)
          if (isValidPlacement(cells, board)) {
            const state: CellState = def.type === 'mine' ? 'mine' : 'ship'
            cells.forEach(k => {
              const [r, c] = k.split('-').map(Number)
              board[r][c] = state
            })
            found = true
            break
          }
        }
        if (!found) { ok = false; break outer }
      }
    }

    if (ok) return board
  }
}

// Kołowy timer SVG
function ShotTimer({ timeLeft }: { timeLeft: number }) {
  const R    = 26
  const circ = 2 * Math.PI * R
  const offset = circ * (1 - timeLeft / SHOT_TIME)
  const color  = timeLeft <= 5  ? '#ef4444'
               : timeLeft <= 10 ? '#f59e0b'
               : '#3b82f6'

  return (
    <div className="flex items-center gap-3">
      <svg width="60" height="60" viewBox="0 0 60 60">
        {/* tor */}
        <circle cx="30" cy="30" r={R} fill="none" stroke="#374151" strokeWidth="5" />
        {/* postęp */}
        <circle
          cx="30" cy="30" r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 30 30)"
          style={{ transition: 'stroke-dashoffset 0.85s linear, stroke 0.3s' }}
        />
        <text
          x="30" y="36"
          textAnchor="middle"
          fontSize="18"
          fontWeight="bold"
          fill={color}
          style={{ transition: 'fill 0.3s' }}
        >
          {timeLeft}
        </text>
      </svg>
      <div className="flex flex-col">
        <span className="text-gray-300 text-xs font-semibold">CZAS NA STRZAŁ</span>
        <span className="text-gray-500 text-xs">sekund</span>
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen]           = useState<'lobby' | 'placement'>('lobby')
  const [session, setSession]         = useState<GameSession | null>(null)

  const [board, setBoard]             = useState<CellState[][]>(emptyBoard)
  const [animating, setAnimating]     = useState<Set<string>>(new Set())
  const [remaining, setRemaining]     = useState<Record<ShipType, number>>(initialRemaining)
  const [selected, setSelected]       = useState<SelectedShip | null>(null)
  const [orientation, setOrientation] = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]     = useState<{ row: number; col: number } | null>(null)
  const [stunTurns, setStunTurns]     = useState(0)
  const [isReady, setIsReady]         = useState(false)

  const [paused, setPaused]           = useState(false)
  const [shotTimeLeft, setShotTimeLeft] = useState(SHOT_TIME)
  const [surrenderConfirm, setSurrenderConfirm] = useState(false)

  // Odliczanie czasu na strzał – zatrzymuje się na pauzie i podczas ogłuszenia
  useEffect(() => {
    if (!isReady || paused || stunTurns > 0) return
    const id = setInterval(() => {
      setShotTimeLeft(t => (t <= 1 ? SHOT_TIME : t - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [isReady, paused, stunTurns])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation(o => o === 'h' ? 'v' : 'h')
      if (e.key === 'Escape' && isReady) setPaused(p => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isReady])

  function handleGameReady(s: GameSession) {
    setSession(s)
    setBoard(emptyBoard())
    setRemaining(initialRemaining())
    setSelected(null)
    setHoverCell(null)
    setStunTurns(0)
    setIsReady(false)
    setPaused(false)
    setShotTimeLeft(SHOT_TIME)
    setSurrenderConfirm(false)
    setScreen('placement')
  }

  if (screen === 'lobby') {
    return <Lobby onReady={handleGameReady} />
  }

  const previewCells = selected && hoverCell
    ? calcCells(hoverCell.row, hoverCell.col, selected.size, orientation)
    : []
  const previewSet   = new Set(previewCells)
  const validPreview = previewCells.length > 0 && isValidPlacement(previewCells, board)

  function handleRandomize() {
    setBoard(generateRandomBoard())
    setRemaining(emptyRemaining())
    setSelected(null)
    setHoverCell(null)
    setIsReady(false)
  }

  function handleReady() {
    setSelected(null)
    setShotTimeLeft(SHOT_TIME)
    setIsReady(true)
  }

  function handleSurrender() {
    setSurrenderConfirm(false)
    setScreen('lobby')
    setSession(null)
    setBoard(emptyBoard())
    setRemaining(initialRemaining())
    setSelected(null)
    setStunTurns(0)
    setPaused(false)
    setShotTimeLeft(SHOT_TIME)
    setIsReady(false)
  }

  function triggerAnim(key: string) {
    setAnimating(prev => new Set(prev).add(key))
    setTimeout(() => {
      setAnimating(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 950)
  }

  function handleClick(row: number, col: number) {
    // faza rozmieszczania
    if (selected) {
      const cells = calcCells(row, col, selected.size, orientation)
      if (!isValidPlacement(cells, board)) return

      const targetState: CellState = selected.type === 'mine' ? 'mine' : 'ship'
      setBoard(prev => {
        const next = prev.map(r => [...r])
        cells.forEach(key => {
          const [r, c] = key.split('-').map(Number)
          next[r][c] = targetState
        })
        return next
      })

      const newRemaining = { ...remaining, [selected.type]: remaining[selected.type] - 1 }
      setRemaining(newRemaining)
      if (newRemaining[selected.type] <= 0) setSelected(null)
      return
    }

    // gra wstrzymana
    if (paused) return

    // ogłuszenie po minie
    if (stunTurns > 0) {
      setStunTurns(t => t - 1)
      setShotTimeLeft(SHOT_TIME)
      return
    }

    // normalny strzał
    setBoard(prev => {
      const next = prev.map(r => [...r])
      const cur = next[row][col]
      const key = `${row}-${col}`

      if (cur === 'empty') {
        next[row][col] = 'miss'
        triggerAnim(key)
      } else if (cur === 'ship') {
        next[row][col] = 'hit'
        triggerAnim(key)
      } else if (cur === 'mine') {
        next[row][col] = 'exploded'
        triggerAnim(key)
        setStunTurns(2)
      }

      return next
    })
    setShotTimeLeft(SHOT_TIME)
  }

  const stunLabel = stunTurns === 1 ? '1 tura' : `${stunTurns} tury`

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 p-8">

      {/* Nagłówek */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white tracking-wide">Statki – Multiplayer</h1>
        {session && (
          <span className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 font-mono">
            {session.nickname} · {session.role === 'player1' ? 'Gracz 1' : 'Gracz 2'}
          </span>
        )}
      </div>

      {/* Baner miny */}
      {stunTurns > 0 && (
        <div className="bg-amber-900/80 border border-amber-500 text-amber-200 rounded-xl px-6 py-3 text-sm font-semibold flex items-center gap-3">
          <span className="text-xl">💣</span>
          <span>Trafiłeś minę! Omijasz <span className="text-amber-400 font-bold">{stunLabel}</span>.</span>
          <span className="text-amber-500 text-xs ml-1">(kliknij planszę aby kontynuować)</span>
        </div>
      )}

      <div className="flex gap-10 items-start">

        {/* Plansza z timerem i nakładką pauzy */}
        <div className="flex flex-col gap-3">
          {isReady && (
            <div className="flex items-center justify-between px-1">
              <ShotTimer timeLeft={shotTimeLeft} />
              {paused && (
                <span className="text-yellow-400 font-bold text-sm tracking-widest animate-pulse">
                  ⏸ GRA WSTRZYMANA
                </span>
              )}
            </div>
          )}

          <div className="relative">
            <Board
              board={board}
              onCellClick={handleClick}
              onCellHover={(r, c) => setHoverCell({ row: r, col: c })}
              onBoardLeave={() => setHoverCell(null)}
              animating={animating}
              previewCells={previewSet}
              isValidPreview={validPreview}
            />

            {/* Nakładka pauzy */}
            {paused && (
              <div className="absolute inset-0 bg-gray-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-sm">
                <span className="text-5xl">⏸</span>
                <span className="text-white text-xl font-bold tracking-widest">PAUZA</span>
                <span className="text-gray-400 text-xs">[Esc] aby wznowić</span>
              </div>
            )}
          </div>
        </div>

        <ShipPanel
          remaining={remaining}
          selected={selected}
          orientation={orientation}
          isReady={isReady}
          paused={paused}
          onSelect={setSelected}
          onToggleOrientation={() => setOrientation(o => o === 'h' ? 'v' : 'h')}
          onRandomize={handleRandomize}
          onReady={handleReady}
          onPause={() => setPaused(p => !p)}
          onSurrender={() => setSurrenderConfirm(true)}
        />
      </div>

      {/* Modal potwierdzenia poddania */}
      {surrenderConfirm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setSurrenderConfirm(false)}
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
                onClick={() => setSurrenderConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSurrender}
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
