import type { ShotRecord } from './game'

export interface AITargetState {
  unshot: Set<string>
  pendingHits: string[]
}

export function initAITargetState(): AITargetState {
  const unshot = new Set<string>()
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      unshot.add(`${r}-${c}`)
  return { unshot, pendingHits: [] }
}

export function aiNextShot(state: AITargetState): [number, number] {
  // Target mode: try adjacent cells around any pending hit
  if (state.pendingHits.length > 0) {
    // Try to extend in a consistent direction if we have 2+ hits
    if (state.pendingHits.length >= 2) {
      const [r0, c0] = state.pendingHits[0].split('-').map(Number)
      const [r1, c1] = state.pendingHits[state.pendingHits.length - 1].split('-').map(Number)
      const dr = r1 - r0, dc = c1 - c0
      const normR = dr === 0 ? 0 : dr / Math.abs(dr)
      const normC = dc === 0 ? 0 : dc / Math.abs(dc)
      // Try forward
      const fwdKey = `${r1 + normR}-${c1 + normC}`
      if (state.unshot.has(fwdKey)) {
        return [r1 + normR, c1 + normC]
      }
      // Try backward
      const bwdKey = `${r0 - normR}-${c0 - normC}`
      if (state.unshot.has(bwdKey)) {
        return [r0 - normR, c0 - normC]
      }
    }
    // Try all 4 neighbors of any pending hit
    for (const hit of state.pendingHits) {
      const [hr, hc] = hit.split('-').map(Number)
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const key = `${hr + dr}-${hc + dc}`
        if (state.unshot.has(key)) return [hr + dr, hc + dc]
      }
    }
  }

  // Hunt mode: checkerboard pattern for efficiency
  const candidates = Array.from(state.unshot)
  const checker = candidates.filter(k => {
    const [r, c] = k.split('-').map(Number)
    return (r + c) % 2 === 0
  })
  const pool = checker.length > 0 ? checker : candidates
  const key  = pool[Math.floor(Math.random() * pool.length)]
  const [r, c] = key.split('-').map(Number)
  return [r, c]
}

export function aiRegisterShot(
  state: AITargetState,
  row: number,
  col: number,
  result: ShotRecord['result'],
): AITargetState {
  const key   = `${row}-${col}`
  const unshot = new Set(state.unshot)
  unshot.delete(key)

  if (result === 'sunk') return { unshot, pendingHits: [] }
  if (result === 'hit')  return { unshot, pendingHits: [...state.pendingHits, key] }
  return { unshot, pendingHits: state.pendingHits }
}
