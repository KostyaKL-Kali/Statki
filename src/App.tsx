import { useState } from 'react'
import { Board } from './components/Board'
import type { CellState } from './components/Board'

function makeTestBoard(): CellState[][] {
  const b: CellState[][] = Array.from({ length: 10 }, () => Array(10).fill('empty'))
  // testowe statki
  b[1][2] = 'ship'
  b[1][3] = 'ship'
  b[1][4] = 'ship'
  b[4][6] = 'hit'
  b[7][1] = 'miss'
  return b
}

export default function App() {
  const [board, setBoard] = useState<CellState[][]>(makeTestBoard)
  const [animating, setAnimating] = useState<Set<string>>(new Set())

  function triggerAnim(key: string) {
    setAnimating(prev => new Set(prev).add(key))
    setTimeout(() => {
      setAnimating(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 750)
  }

  function handleClick(row: number, col: number) {
    setBoard(prev => {
      const next = prev.map(r => [...r])
      const cur = next[row][col]
      if (cur === 'empty') {
        next[row][col] = 'miss'
        triggerAnim(`${row}-${col}`)
      } else if (cur === 'ship') {
        next[row][col] = 'hit'
        triggerAnim(`${row}-${col}`)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold text-white tracking-wide">Statki – Multiplayer</h1>
      <Board board={board} onCellClick={handleClick} animating={animating} />
    </div>
  )
}
