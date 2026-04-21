import { SHIP_DEFS } from '../store/ships'
import type { ShipType } from '../store/ships'

export interface SelectedShip {
  type: ShipType
  name: string
  size: number
}

interface ShipPanelProps {
  remaining: Record<ShipType, number>
  selected: SelectedShip | null
  orientation: 'h' | 'v'
  isReady: boolean
  onSelect: (ship: SelectedShip) => void
  onToggleOrientation: () => void
  onRandomize: () => void
  onReady: () => void
}

function ShipVisual({ size, type, active, depleted }: {
  size: number
  type: ShipType
  active: boolean
  depleted: boolean
}) {
  const color = depleted
    ? 'bg-gray-700'
    : type === 'mine'
    ? (active ? 'bg-amber-300' : 'bg-amber-500')
    : (active ? 'bg-blue-400' : 'bg-gray-400')

  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: size }).map((_, i) => (
        <div key={i} className={`w-5 h-5 rounded-sm transition-colors ${color} flex items-center justify-center text-xs`}>
          {type === 'mine' ? '💣' : ''}
        </div>
      ))}
    </div>
  )
}

const SHIPS = SHIP_DEFS.filter(d => d.type !== 'mine')
const MINES = SHIP_DEFS.filter(d => d.type === 'mine')

export function ShipPanel({ remaining, selected, orientation, isReady, onSelect, onToggleOrientation, onRandomize, onReady }: ShipPanelProps) {
  const allPlaced = SHIP_DEFS.every(def => remaining[def.type] === 0)
  const isMineSelected = selected?.type === 'mine'

  function renderItem(def: typeof SHIP_DEFS[0]) {
    const left = remaining[def.type]
    const depleted = left === 0
    const active = selected?.type === def.type
    const isMine = def.type === 'mine'

    return (
      <button
        key={def.type}
        disabled={depleted}
        onClick={() => onSelect({ type: def.type, name: def.name, size: def.size })}
        className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors text-left w-full ${
          depleted
            ? 'opacity-40 cursor-not-allowed bg-gray-800'
            : active
            ? isMine
              ? 'bg-amber-800 ring-2 ring-amber-400 cursor-pointer'
              : 'bg-blue-700 ring-2 ring-blue-400 cursor-pointer'
            : 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
        }`}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-white text-xs font-medium">{def.name}</span>
          <ShipVisual size={def.size} type={def.type} active={active} depleted={depleted} />
        </div>
        <span className="text-xs font-bold ml-3 text-gray-400">{left}/{def.total}</span>
      </button>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 w-56 flex flex-col gap-4 self-start">
      <h2 className="text-white font-semibold text-xs uppercase tracking-widest">Flota</h2>

      <div className="flex flex-col gap-2">
        {SHIPS.map(renderItem)}
      </div>

      <div className="border-t border-gray-700 pt-3 flex flex-col gap-2">
        <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Miny</p>
        {MINES.map(renderItem)}
      </div>

      {selected && !isMineSelected && (
        <div className="border-t border-gray-700 pt-3">
          <button
            onClick={onToggleOrientation}
            className="bg-gray-800 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors flex items-center justify-between w-full"
          >
            <span>↺ OBRÓĆ</span>
            <span className="text-gray-400">{orientation === 'h' ? '→ poziomo' : '↓ pionowo'}</span>
            <span className="text-gray-600 text-[10px]">[R]</span>
          </button>
        </div>
      )}

      <div className="border-t border-gray-700 pt-3 flex flex-col gap-2 mt-auto">
        <button
          onClick={onRandomize}
          className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors w-full"
        >
          🎲 LOSOWE ROZMIESZCZENIE
        </button>

        <button
          disabled={!allPlaced || isReady}
          onClick={onReady}
          className={`text-sm font-bold rounded-lg px-3 py-3 transition-colors w-full ${
            isReady
              ? 'bg-green-800 text-green-300 cursor-default'
              : allPlaced
              ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
          }`}
        >
          {isReady ? '✓ Gotowy!' : 'GOTOWY'}
        </button>
      </div>
    </div>
  )
}
