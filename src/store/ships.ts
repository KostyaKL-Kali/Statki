export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'destroyer' | 'mine'

export interface ShipDef {
  type: ShipType
  name: string
  size: number
  total: number
}

export const SHIP_DEFS: ShipDef[] = [
  { type: 'carrier',    name: 'Lotniskowiec', size: 5, total: 1 },
  { type: 'battleship', name: 'Pancernik',    size: 4, total: 1 },
  { type: 'cruiser',    name: 'Krążownik',    size: 3, total: 2 },
  { type: 'destroyer',  name: 'Niszczyciel',  size: 2, total: 1 },
  { type: 'mine',       name: 'Mina',         size: 1, total: 2 },
]
