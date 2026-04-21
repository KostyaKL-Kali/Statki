import { useState, useEffect, useRef } from 'react'
import { Board } from './components/Board'
import { ShipPanel } from './components/ShipPanel'
import type { CellState } from './components/Board'
import type { SelectedShip } from './components/ShipPanel'
import { SHIP_DEFS } from './store/ships'
import type { ShipType } from './store/ships'
import { supabase } from './lib/supabase'

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

function generateRandomBoard(): CellState[][] {
  // ponawia całość jeśli któryś statek nie zmieści się w 500 próbach
  while (true) {
    const board: CellState[][] = Array.from({ length: 10 }, () => Array(10).fill('empty') as CellState[])
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

export default function App() {
  const [board, setBoard]           = useState<CellState[][]>(
    () => Array.from({ length: 10 }, () => Array(10).fill('empty'))
  )
  const [animating, setAnimating]   = useState<Set<string>>(new Set())
  const [remaining, setRemaining]   = useState<Record<ShipType, number>>(initialRemaining)
  const [selected, setSelected]     = useState<SelectedShip | null>(null)
  const [orientation, setOrientation] = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]   = useState<{ row: number; col: number } | null>(null)
  const [stunTurns, setStunTurns]   = useState(0)
  const [isReady, setIsReady]       = useState(false)
  const [dbStatus, setDbStatus]     = useState<'checking' | 'ok' | 'error'>('checking')
  const [gamesCount, setGamesCount] = useState<number | null>(null)
  const tested = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation(o => o === 'h' ? 'v' : 'h')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // test połączenia z Supabase
  useEffect(() => {
    if (tested.current) return
    tested.current = true
    supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) { setDbStatus('error'); return }
        setDbStatus('ok')
        setGamesCount(count ?? 0)
      })
  }, [])

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
    setIsReady(true)
  }

  function triggerAnim(key: string) {
    setAnimating(prev => new Set(prev).add(key))
    setTimeout(() => {
      setAnimating(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 950)
  }

  function handleClick(row: number, col: number) {
    // tryb rozstawiania
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

    // tryb gry – stun aktywny
    if (stunTurns > 0) {
      setStunTurns(t => t - 1)
      return
    }

    // tryb gry – normalne kliknięcie
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
  }

  const stunLabel = stunTurns === 1 ? '1 tura' : `${stunTurns} tury`

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold text-white tracking-wide">Statki – Multiplayer</h1>

      <div className={`text-xs px-3 py-1 rounded-full font-mono ${
        dbStatus === 'checking' ? 'bg-gray-800 text-gray-400' :
        dbStatus === 'ok'       ? 'bg-green-900 text-green-400' :
                                  'bg-red-900 text-red-400'
      }`}>
        {dbStatus === 'checking' && '⏳ Łączenie z Supabase…'}
        {dbStatus === 'ok'       && `✓ Supabase OK · games: ${gamesCount}`}
        {dbStatus === 'error'    && '✗ Błąd połączenia z Supabase'}
      </div>

      {stunTurns > 0 && (
        <div className="bg-amber-900/80 border border-amber-500 text-amber-200 rounded-xl px-6 py-3 text-sm font-semibold flex items-center gap-3">
          <span className="text-xl">💣</span>
          <span>Trafiłeś minę! Omijasz <span className="text-amber-400 font-bold">{stunLabel}</span>.</span>
          <span className="text-amber-500 text-xs ml-1">(kliknij planszę aby kontynuować)</span>
        </div>
      )}

      <div className="flex gap-10 items-start">
        <Board
          board={board}
          onCellClick={handleClick}
          onCellHover={(r, c) => setHoverCell({ row: r, col: c })}
          onBoardLeave={() => setHoverCell(null)}
          animating={animating}
          previewCells={previewSet}
          isValidPreview={validPreview}
        />
        <ShipPanel
          remaining={remaining}
          selected={selected}
          orientation={orientation}
          isReady={isReady}
          onSelect={setSelected}
          onToggleOrientation={() => setOrientation(o => o === 'h' ? 'v' : 'h')}
          onRandomize={handleRandomize}
          onReady={handleReady}
        />
      </div>
    </div>
  )
}
