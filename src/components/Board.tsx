export type CellState = 'empty' | 'ship' | 'hit' | 'miss'

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
export const COLS = Array.from({ length: 10 }, (_, i) => i + 1)

const BASE = 'w-[54px] h-[54px] border border-blue-900 cursor-pointer flex items-center justify-center text-base font-bold transition-colors'

const CELL_CLASSES: Record<CellState, string> = {
  empty: `${BASE} bg-blue-500 hover:bg-blue-400`,
  ship:  `${BASE} bg-gray-500 hover:bg-gray-400`,
  hit:   `${BASE} bg-red-500 hover:bg-red-400`,
  miss:  `${BASE} bg-white hover:bg-gray-100 text-gray-400`,
}

interface BoardProps {
  board: CellState[][]
  onCellClick: (row: number, col: number) => void
  animating?: Set<string>
}

export function Board({ board, onCellClick, animating }: BoardProps) {
  return (
    <div className="inline-block select-none">
      {/* nagłówek kolumn */}
      <div className="flex">
        <div className="w-10 h-[54px]" />
        {COLS.map(col => (
          <div key={col} className="w-[54px] h-[54px] flex items-center justify-center text-sm font-semibold text-gray-300">
            {col}
          </div>
        ))}
      </div>

      {/* wiersze A–J */}
      {ROWS.map((letter, rowIdx) => (
        <div key={letter} className="flex">
          <div className="w-10 h-[54px] flex items-center justify-center text-sm font-semibold text-gray-300">
            {letter}
          </div>
          {COLS.map((_, colIdx) => {
            const state = board[rowIdx][colIdx]
            const key = `${rowIdx}-${colIdx}`
            const isAnimating = animating?.has(key) ?? false
            const animClass = isAnimating
              ? state === 'hit' ? 'animate-hit' : 'animate-miss'
              : ''
            return (
              <div
                key={key}
                className={`${CELL_CLASSES[state]} ${animClass}`}
                onClick={() => onCellClick(rowIdx, colIdx)}
              >
                {state === 'miss' && <span className="text-lg leading-none">×</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
