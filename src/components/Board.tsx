export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'mine' | 'exploded'

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
export const COLS = Array.from({ length: 10 }, (_, i) => i + 1)

const CELL_CLASSES: Record<CellState, string> = {
  empty:    'w-[54px] h-[54px] border border-blue-900 cursor-pointer flex items-center justify-center text-base font-bold transition-colors bg-blue-500 hover:bg-blue-400',
  ship:     'w-[54px] h-[54px] border border-blue-900 cursor-pointer flex items-center justify-center text-base font-bold transition-colors bg-gray-500 hover:bg-gray-400',
  hit:      'w-[54px] h-[54px] border border-blue-900 cursor-default flex items-center justify-center text-base font-bold transition-colors bg-red-500',
  miss:     'w-[54px] h-[54px] border border-blue-900 cursor-default flex items-center justify-center text-base font-bold transition-colors bg-white text-gray-400',
  mine:     'w-[54px] h-[54px] border border-amber-700 cursor-pointer flex items-center justify-center text-base font-bold transition-colors bg-amber-500 hover:bg-amber-400',
  exploded: 'w-[54px] h-[54px] border border-orange-900 cursor-default flex items-center justify-center text-base font-bold transition-colors bg-orange-700',
}

const PREVIEW_VALID   = 'w-[54px] h-[54px] border-2 border-green-400 cursor-crosshair flex items-center justify-center text-base font-bold bg-green-400/40'
const PREVIEW_INVALID = 'w-[54px] h-[54px] border-2 border-red-400 cursor-not-allowed flex items-center justify-center text-base font-bold bg-red-400/40'

interface BoardProps {
  board: CellState[][]
  onCellClick?: (row: number, col: number) => void
  onCellHover?: (row: number, col: number) => void
  onBoardLeave?: () => void
  animating?: Set<string>
  previewCells?: Set<string>
  isValidPreview?: boolean
  disabled?: boolean   // wyłącza pointer-events i przygasza planszę
}

export function Board({
  board,
  onCellClick,
  onCellHover,
  onBoardLeave,
  animating,
  previewCells,
  isValidPreview,
  disabled,
}: BoardProps) {
  return (
    <div
      className={`inline-block select-none ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      onMouseLeave={onBoardLeave}
    >
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
            const isPreview   = previewCells?.has(key) ?? false
            const isAnimating = animating?.has(key) ?? false

            let className: string
            if (isPreview) {
              className = isValidPreview ? PREVIEW_VALID : PREVIEW_INVALID
            } else if (isAnimating) {
              const animClass = state === 'hit' ? 'animate-hit'
                : state === 'exploded'          ? 'animate-mine'
                : 'animate-miss'
              className = `${CELL_CLASSES[state]} ${animClass}`
            } else {
              className = CELL_CLASSES[state]
            }

            return (
              <div
                key={key}
                className={className}
                onClick={() => onCellClick?.(rowIdx, colIdx)}
                onMouseEnter={() => onCellHover?.(rowIdx, colIdx)}
              >
                {state === 'miss'     && !isPreview && <span className="text-lg leading-none">×</span>}
                {state === 'mine'     && !isPreview && <span className="text-lg leading-none">💣</span>}
                {state === 'exploded' && !isPreview && <span className="text-lg leading-none">💥</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
