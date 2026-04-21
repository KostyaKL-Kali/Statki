import { useState, useEffect, useRef, useMemo } from 'react'
import { Board } from './components/Board'
import { ShipPanel } from './components/ShipPanel'
import { Lobby } from './components/Lobby'
import { GameScreen } from './components/GameScreen'
import { Leaderboard } from './components/Leaderboard'
import type { CellState } from './components/Board'
import type { SelectedShip } from './components/ShipPanel'
import { SHIP_DEFS } from './store/ships'
import type { ShipType } from './store/ships'
import type { GameSession, ShotRecord } from './store/game'
import { initAITargetState, aiNextShot, aiRegisterShot } from './store/ai'
import type { AITargetState } from './store/ai'
import { playHit, playMiss, playMine, playSunk, playWin, playLose } from './lib/sounds'
import { supabase } from './lib/supabase'

const SHOT_TIME = 30

// Liczba pól statków (bez min) = warunek wygranej
const TOTAL_SHIP_CELLS = SHIP_DEFS
  .filter(d => d.type !== 'mine')
  .reduce((s, d) => s + d.size * d.total, 0)

function getShipNameBySize(size: number): string {
  return SHIP_DEFS.find(d => d.size === size && d.type !== 'mine')?.name ?? `Statek (${size})`
}


// --------------- helpers ---------------

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
        const nr = r + dr; const nc = c + dc
        if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && isOccupied(board[nr][nc]) && !cellSet.has(`${nr}-${nc}`)) return false
      }
    }
  }
  return true
}

// Zwraca wszystkie pola statku do którego należy [row, col]
function getShipGroup(board: CellState[][], row: number, col: number): string[] {
  const visited = new Set<string>()
  const queue   = [`${row}-${col}`]
  while (queue.length) {
    const key = queue.shift()!
    if (visited.has(key)) continue
    visited.add(key)
    const [r, c] = key.split('-').map(Number)
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && board[nr][nc] === 'ship') {
        queue.push(`${nr}-${nc}`)
      }
    }
  }
  return Array.from(visited)
}

function calcResult(
  board: CellState[][],
  row: number,
  col: number,
  existingHits: Set<string>,
): ShotRecord['result'] {
  const cell = board[row][col]
  if (cell === 'mine') return 'mine'
  if (cell !== 'ship') return 'miss'
  const group   = getShipGroup(board, row, col)
  const allHits = new Set(existingHits)
  allHits.add(`${row}-${col}`)
  return group.every(k => allHits.has(k)) ? 'sunk' : 'hit'
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
            cells.forEach(k => { const [r, c] = k.split('-').map(Number); board[r][c] = state })
            found = true; break
          }
        }
        if (!found) { ok = false; break outer }
      }
    }
    if (ok) return board
  }
}

// --------------- component ---------------

export default function App() {
  // ekran / sesja
  const [screen, setScreen]   = useState<'lobby' | 'placement' | 'game' | 'leaderboard'>('lobby')
  const [session, setSession] = useState<GameSession | null>(null)
  const [gameMode, setGameMode] = useState<'multiplayer' | 'ai'>('multiplayer')

  // faza rozmieszczania
  const [board, setBoard]               = useState<CellState[][]>(emptyBoard)
  const [remaining, setRemaining]       = useState<Record<ShipType, number>>(initialRemaining)
  const [selected, setSelected]         = useState<SelectedShip | null>(null)
  const [orientation, setOrientation]   = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]       = useState<{ row: number; col: number } | null>(null)
  const [myBoardReady, setMyBoardReady] = useState(false)

  // faza gry
  const [shots, setShots]                         = useState<ShotRecord[]>([])
  const [opponentBoardFull, setOpponentBoardFull] = useState<CellState[][] | null>(null)
  const [currentTurn, setCurrentTurn]             = useState<string | null>(null)
  const [opponentId, setOpponentId]               = useState<string | null>(null)
  const [myAnimating, setMyAnimating]             = useState<Set<string>>(new Set())
  const [oppAnimating, setOppAnimating]           = useState<Set<string>>(new Set())
  const [gameLoading, setGameLoading]             = useState(false)
  const [winner, setWinner]                       = useState<'me' | 'opponent' | null>(null)
  const [gameStartedAt, setGameStartedAt]         = useState<number | null>(null)
  const [sunkNotif, setSunkNotif]                 = useState<{ msg: string; type: 'attack' | 'defend' } | null>(null)

  // AI
  const [aiTargetState, setAiTargetState] = useState<AITargetState | null>(null)

  // Ref do planszy gracza – potrzebny w Realtime closures
  const boardRef = useRef<CellState[][]>(emptyBoard())
  useEffect(() => { boardRef.current = board }, [board])

  // Auto-kasowanie powiadomienia o zatopieniu
  const sunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showSunk(msg: string, type: 'attack' | 'defend') {
    if (sunkTimerRef.current) clearTimeout(sunkTimerRef.current)
    setSunkNotif({ msg, type })
    sunkTimerRef.current = setTimeout(() => setSunkNotif(null), 2800)
  }

  // kontrolki
  const [paused, setPaused]             = useState(false)
  const [shotTimeLeft, setShotTimeLeft] = useState(SHOT_TIME)

  // wartości pochodne
  const gameId   = session?.gameId
  const isMyTurn = screen === 'game' && currentTurn === session?.playerId && !winner

  // ---- widoki plansz ----

  const myBoardView = useMemo<CellState[][]>(() => {
    if (screen !== 'game') return board
    const view = board.map(row => [...row] as CellState[])
    const oppShots = shots.filter(s => s.shooter_id !== session?.playerId)
    oppShots.forEach(({ row, col, result }) => {
      if      (result === 'hit' || result === 'sunk') view[row][col] = 'hit'
      else if (result === 'miss')                     view[row][col] = 'miss'
      else if (result === 'mine')                     view[row][col] = 'exploded'
    })
    // Oznacz wszystkie pola zatopionych statków
    oppShots.filter(s => s.result === 'sunk').forEach(({ row, col }) => {
      getShipGroup(board, row, col).forEach(key => {
        const [r, c] = key.split('-').map(Number)
        view[r][c] = 'sunk'
      })
    })
    return view
  }, [board, shots, session?.playerId, screen])

  const oppBoardView = useMemo<CellState[][]>(() => {
    const view = emptyBoard()
    const myShots = shots.filter(s => s.shooter_id === session?.playerId)
    myShots.forEach(({ row, col, result }) => {
      if      (result === 'hit' || result === 'sunk') view[row][col] = 'hit'
      else if (result === 'miss')                     view[row][col] = 'miss'
      else if (result === 'mine')                     view[row][col] = 'exploded'
    })
    // Odsłoń wszystkie pola zatopionego statku (nagrodowy reveal)
    if (opponentBoardFull) {
      myShots.filter(s => s.result === 'sunk').forEach(({ row, col }) => {
        getShipGroup(opponentBoardFull, row, col).forEach(key => {
          const [r, c] = key.split('-').map(Number)
          view[r][c] = 'sunk'
        })
      })
    }
    return view
  }, [shots, session?.playerId, opponentBoardFull])

  // ---- Realtime: zmiany statusu gry i current_turn ----
  useEffect(() => {
    if (!gameId || gameMode === 'ai') return

    const channel = supabase
      .channel(`status-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as {
            status: string
            current_turn: string | null
            winner_id: string | null
          }

          if (updated.status === 'active') {
            setScreen('game')
            setShotTimeLeft(SHOT_TIME)
            setGameStartedAt(Date.now())
          }
          if (updated.status === 'finished' && updated.winner_id) {
            const iWon = updated.winner_id === session?.playerId
            setWinner(iWon ? 'me' : 'opponent')
            if (!iWon) playLose()
          } else if (updated.current_turn !== undefined) {
            setCurrentTurn(updated.current_turn)
            setShotTimeLeft(SHOT_TIME)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, gameMode, session?.playerId])

  // ---- Realtime: nowe strzały ----
  useEffect(() => {
    if (!gameId || !session || gameMode === 'ai') return

    const playerId = session.playerId
    const channel  = supabase
      .channel(`shots-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const shot = payload.new as ShotRecord

          setShots(prev => {
            const dup = prev.some(s => s.shooter_id === shot.shooter_id && s.row === shot.row && s.col === shot.col)
            return dup ? prev : [...prev, shot]
          })

          if (shot.shooter_id !== playerId) {
            // Efekty dźwiękowe na strzały przeciwnika
            if (shot.result === 'hit' || shot.result === 'sunk') playHit()
            else if (shot.result === 'miss') playMiss()
            else if (shot.result === 'mine') playMine()
            if (shot.result === 'sunk') {
              setTimeout(playSunk, 120)
              const group = getShipGroup(boardRef.current, shot.row, shot.col)
              showSunk(`⚠️ Twój ${getShipNameBySize(group.length)} zatopiony!`, 'defend')
            }

            // Animacja na mojej planszy
            const key = `${shot.row}-${shot.col}`
            setMyAnimating(prev => new Set(prev).add(key))
            setTimeout(() => setMyAnimating(prev => { const n = new Set(prev); n.delete(key); return n }), 950)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, gameMode, session?.playerId])

  // ---- Ładowanie danych gry gdy screen → 'game' (tylko multiplayer) ----
  useEffect(() => {
    if (screen !== 'game' || !session || gameMode === 'ai') return

    let cancelled = false
    setGameLoading(true)

    async function load() {
      const gId = session!.gameId

      const { data: boards } = await supabase
        .from('boards')
        .select('player_id, cells')
        .eq('game_id', gId)

      if (cancelled || !boards) return

      const myData  = boards.find(b => b.player_id === session!.playerId)
      const oppData = boards.find(b => b.player_id !== session!.playerId)

      if (myData?.cells) {
        const flat = myData.cells as string[]
        setBoard(Array.from({ length: 10 }, (_, r) => flat.slice(r * 10, r * 10 + 10) as CellState[]))
      }
      if (oppData?.cells) {
        const flat = oppData.cells as string[]
        setOpponentBoardFull(Array.from({ length: 10 }, (_, r) => flat.slice(r * 10, r * 10 + 10) as CellState[]))
      }

      const { data: game } = await supabase
        .from('games')
        .select('current_turn, player1_id, player2_id, updated_at')
        .eq('id', gId)
        .single()

      if (!cancelled && game) {
        setCurrentTurn(game.current_turn)
        setOpponentId(session!.role === 'player1' ? game.player2_id : game.player1_id)
        if (game.updated_at) setGameStartedAt(new Date(game.updated_at).getTime())
      }

      const { data: history } = await supabase
        .from('shots')
        .select('shooter_id, row, col, result')
        .eq('game_id', gId)
        .order('created_at', { ascending: true })

      if (!cancelled && history) setShots(history as ShotRecord[])
      if (!cancelled) setGameLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [screen, gameMode, session?.gameId])

  // ---- Timer ----
  useEffect(() => {
    if (!isMyTurn || paused || gameMode === 'ai') return
    const id = setInterval(() => {
      setShotTimeLeft(t => (t <= 1 ? SHOT_TIME : t - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [isMyTurn, paused, gameMode])

  // ---- Klawisze ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation(o => o === 'h' ? 'v' : 'h')
      if (e.key === 'Escape' && screen === 'game' && gameMode !== 'ai') setPaused(p => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, gameMode])

  // ---- Reset stanu gry ----
  function resetGame() {
    setBoard(emptyBoard())
    setRemaining(initialRemaining())
    setSelected(null)
    setHoverCell(null)
    setMyBoardReady(false)
    setShots([])
    setOpponentBoardFull(null)
    setCurrentTurn(null)
    setOpponentId(null)
    setPaused(false)
    setShotTimeLeft(SHOT_TIME)
    setWinner(null)
    setAiTargetState(null)
    setGameStartedAt(null)
    setSunkNotif(null)
  }

  // ---- Akcje ----

  function handleGameReady(s: GameSession) {
    setGameMode('multiplayer')
    setSession(s)
    resetGame()
    setScreen('placement')
  }

  function handleAIGameReady(nickname: string) {
    const s: GameSession = {
      gameId:   'ai-' + crypto.randomUUID(),
      playerId: 'player',
      nickname,
      role:     'player1',
    }
    setGameMode('ai')
    setSession(s)
    resetGame()
    setScreen('placement')
  }

  function handleRandomize() {
    if (myBoardReady) return
    setBoard(generateRandomBoard())
    setRemaining(emptyRemaining())
    setSelected(null)
    setHoverCell(null)
  }

  async function handleReady() {
    if (!session || myBoardReady) return
    setSelected(null)
    setMyBoardReady(true)

    // ---- Tryb AI ----
    if (gameMode === 'ai') {
      const aiBoard = generateRandomBoard()
      setOpponentBoardFull(aiBoard)
      setOpponentId('ai')
      setCurrentTurn('player')
      setShotTimeLeft(SHOT_TIME)
      setAiTargetState(initAITargetState())
      setGameStartedAt(Date.now())
      setScreen('game')
      return
    }

    // ---- Multiplayer ----
    const { error } = await supabase
      .from('boards')
      .insert({ game_id: session.gameId, player_id: session.playerId, cells: board.flat(), is_ready: true })

    if (error) { console.error('Błąd zapisu planszy:', error); setMyBoardReady(false); return }

    const { data: allBoards } = await supabase
      .from('boards').select('is_ready').eq('game_id', session.gameId)

    if (allBoards?.length === 2 && allBoards.every(b => b.is_ready)) {
      const { data: game } = await supabase
        .from('games').select('player1_id').eq('id', session.gameId).single()

      await supabase.from('games').update({
        status:       'active',
        current_turn: game?.player1_id,
      }).eq('id', session.gameId)
    }
  }

  async function handleSurrender() {
    if (gameMode === 'multiplayer' && session && opponentId) {
      await supabase.from('games').update({
        status:    'finished',
        winner_id: opponentId,
      }).eq('id', session.gameId).neq('status', 'finished')
    }
    setSession(null)
    resetGame()
    setScreen('lobby')
  }

  // ---- Animacja strzału ----
  function animateShot(board: 'my' | 'opp', row: number, col: number) {
    const key = `${row}-${col}`
    const setter = board === 'opp' ? setOppAnimating : setMyAnimating
    setter(prev => new Set(prev).add(key))
    setTimeout(() => setter(prev => { const n = new Set(prev); n.delete(key); return n }), 950)
  }

  // ---- Tura AI ----
  function handleAITurn(currentShots: ShotRecord[], currentAIState: AITargetState, playerBoard: CellState[][]) {
    const [ar, ac_] = aiNextShot(currentAIState)
    const hitSet    = new Set(
      currentShots.filter(s => s.shooter_id === 'ai' && (s.result === 'hit' || s.result === 'sunk')).map(s => `${s.row}-${s.col}`)
    )
    const result    = calcResult(playerBoard, ar, ac_, hitSet)
    const newState  = aiRegisterShot(currentAIState, ar, ac_, result)
    const shot: ShotRecord = { shooter_id: 'ai', row: ar, col: ac_, result }
    const newShots  = [...currentShots, shot]

    setShots(newShots)
    setAiTargetState(newState)
    animateShot('my', ar, ac_)

    if (result === 'hit' || result === 'sunk') playHit()
    else if (result === 'miss') playMiss()
    else if (result === 'mine') playMine()
    if (result === 'sunk') {
      setTimeout(playSunk, 120)
      const group = getShipGroup(playerBoard, ar, ac_)
      showSunk(`⚠️ Twój ${getShipNameBySize(group.length)} zatopiony!`, 'defend')
    }

    const aiHits = newShots.filter(s => s.shooter_id === 'ai' && (s.result === 'hit' || s.result === 'sunk')).length
    if (aiHits >= TOTAL_SHIP_CELLS) {
      setWinner('opponent')
      setTimeout(playLose, 200)
      return
    }

    const keepTurn = result === 'hit' || result === 'sunk'
    if (keepTurn) {
      setTimeout(() => handleAITurn(newShots, newState, playerBoard), 900)
    } else {
      setCurrentTurn('player')
      setShotTimeLeft(SHOT_TIME)
    }
  }

  // ---- Strzał gracza (AI) ----
  function handleShotAI(row: number, col: number) {
    if (!session || !opponentBoardFull || !aiTargetState) return
    if (!isMyTurn) return

    const alreadyShot = shots.some(s => s.shooter_id === 'player' && s.row === row && s.col === col)
    if (alreadyShot) return

    const hitSet = new Set(
      shots.filter(s => s.shooter_id === 'player' && (s.result === 'hit' || s.result === 'sunk')).map(s => `${s.row}-${s.col}`)
    )
    const result   = calcResult(opponentBoardFull, row, col, hitSet)
    const shot: ShotRecord = { shooter_id: 'player', row, col, result }
    const newShots = [...shots, shot]

    setShots(newShots)
    animateShot('opp', row, col)

    if (result === 'hit' || result === 'sunk') playHit()
    else if (result === 'miss') playMiss()
    else if (result === 'mine') playMine()
    if (result === 'sunk') {
      setTimeout(playSunk, 120)
      const group = getShipGroup(opponentBoardFull!, row, col)
      showSunk(`💥 ${getShipNameBySize(group.length)} zatopiony!`, 'attack')
    }

    const playerHits = newShots.filter(s => s.shooter_id === 'player' && (s.result === 'hit' || s.result === 'sunk')).length
    if (playerHits >= TOTAL_SHIP_CELLS) {
      setWinner('me')
      setTimeout(playWin, 200)
      return
    }

    const keepTurn = result === 'hit' || result === 'sunk'
    if (!keepTurn) {
      setCurrentTurn('ai')
      // Zrzut planszy gracza do lokalnej zmiennej, żeby AI nie czytało ze stale closure
      const playerBoard = board
      setTimeout(() => handleAITurn(newShots, aiTargetState!, playerBoard), 1200)
    }
  }

  // ---- Strzał gracza (multiplayer) ----
  async function handleShotMultiplayer(row: number, col: number) {
    if (!session || !opponentBoardFull || !opponentId) return
    if (!isMyTurn || paused) return

    const alreadyShot = shots.some(s => s.shooter_id === session.playerId && s.row === row && s.col === col)
    if (alreadyShot) return

    const hitSet = new Set(
      shots.filter(s => s.shooter_id === session.playerId && (s.result === 'hit' || s.result === 'sunk')).map(s => `${s.row}-${s.col}`)
    )
    const result   = calcResult(opponentBoardFull, row, col, hitSet)
    const shot: ShotRecord = { shooter_id: session.playerId, row, col, result }
    const newShots = [...shots, shot]

    setShots(newShots)
    setShotTimeLeft(SHOT_TIME)
    animateShot('opp', row, col)

    if (result === 'hit' || result === 'sunk') playHit()
    else if (result === 'miss') playMiss()
    else if (result === 'mine') playMine()
    if (result === 'sunk') {
      setTimeout(playSunk, 120)
      const group = getShipGroup(opponentBoardFull, row, col)
      showSunk(`💥 ${getShipNameBySize(group.length)} zatopiony!`, 'attack')
    }

    // Zapisz strzał w bazie zawsze – także przy wygranej, żeby Realtime dotarł do obu graczy
    const { error: shotErr } = await supabase.from('shots').insert({
      game_id:    session.gameId,
      shooter_id: session.playerId,
      row, col, result,
    })

    if (shotErr) {
      setShots(prev => prev.filter(s => !(s.shooter_id === session.playerId && s.row === row && s.col === col)))
      console.error('Błąd zapisu strzału:', shotErr)
      return
    }

    const playerHits = newShots.filter(s => s.shooter_id === session.playerId && (s.result === 'hit' || s.result === 'sunk')).length
    if (playerHits >= TOTAL_SHIP_CELLS) {
      setWinner('me')
      setTimeout(playWin, 200)
      await supabase.from('games').update({
        status:    'finished',
        winner_id: session.playerId,
      }).eq('id', session.gameId)
      return
    }

    const keepTurn = result === 'hit' || result === 'sunk'
    const nextTurn = keepTurn ? session.playerId : opponentId
    await supabase.from('games').update({ current_turn: nextTurn }).eq('id', session.gameId)
  }

  function handleShot(row: number, col: number) {
    if (gameMode === 'ai') handleShotAI(row, col)
    else handleShotMultiplayer(row, col)
  }

  // ---- Kliknięcie planszy (faza rozmieszczania) ----
  function handlePlacementClick(row: number, col: number) {
    if (!selected) return
    const cells = calcCells(row, col, selected.size, orientation)
    if (!isValidPlacement(cells, board)) return

    const targetState: CellState = selected.type === 'mine' ? 'mine' : 'ship'
    setBoard(prev => {
      const next = prev.map(r => [...r])
      cells.forEach(key => { const [r, c] = key.split('-').map(Number); next[r][c] = targetState })
      return next
    })

    const newRemaining = { ...remaining, [selected.type]: remaining[selected.type] - 1 }
    setRemaining(newRemaining)
    if (newRemaining[selected.type] <= 0) setSelected(null)
  }

  // ---- Renderowanie ----

  if (screen === 'lobby') {
    return (
      <Lobby
        onReady={handleGameReady}
        onAIReady={handleAIGameReady}
        onLeaderboard={() => setScreen('leaderboard')}
      />
    )
  }

  if (screen === 'leaderboard') {
    const playerId = sessionStorage.getItem('player_id') ?? ''
    return (
      <Leaderboard
        currentPlayerId={playerId}
        onBack={() => setScreen('lobby')}
      />
    )
  }

  if (screen === 'game') {
    return (
      <GameScreen
        session={session!}
        myBoardView={myBoardView}
        oppBoardView={oppBoardView}
        myAnimating={myAnimating}
        oppAnimating={oppAnimating}
        isMyTurn={isMyTurn}
        paused={paused}
        shotTimeLeft={shotTimeLeft}
        loading={gameLoading}
        winner={winner}
        gameStartedAt={gameStartedAt}
        myShots={shots.filter(s => s.shooter_id === session?.playerId).length}
        totalShots={shots.length}
        sunkNotif={sunkNotif}
        isAIMode={gameMode === 'ai'}
        onShot={handleShot}
        onPause={() => setPaused(p => !p)}
        onSurrender={handleSurrender}
        onPlayAgain={() => {
          setSession(null)
          resetGame()
          setScreen('lobby')
        }}
      />
    )
  }

  // ---- Faza rozmieszczania ----
  const previewCells = selected && hoverCell
    ? calcCells(hoverCell.row, hoverCell.col, selected.size, orientation)
    : []
  const previewSet   = new Set(previewCells)
  const validPreview = previewCells.length > 0 && isValidPlacement(previewCells, board)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 p-8">

      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          Statki – {gameMode === 'ai' ? 'vs Komputer' : 'Multiplayer'}
        </h1>
        {session && (
          <span className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 font-mono">
            {session.nickname} · {session.role === 'player1' ? 'Gracz 1' : 'Gracz 2'}
          </span>
        )}
      </div>

      <div className="flex gap-10 items-start">
        <div className="relative">
          <Board
            board={board}
            onCellClick={handlePlacementClick}
            onCellHover={(r, c) => setHoverCell({ row: r, col: c })}
            onBoardLeave={() => setHoverCell(null)}
            previewCells={previewSet}
            isValidPreview={validPreview}
          />

          {myBoardReady && (
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-sm">
              <svg className="animate-spin h-8 w-8 text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-white font-bold text-sm">Plansza zatwierdzona ✓</p>
              <p className="text-gray-400 text-xs">
                {gameMode === 'ai' ? 'Komputer rozstawia flotę…' : 'Oczekiwanie na przeciwnika…'}
              </p>
            </div>
          )}
        </div>

        <ShipPanel
          remaining={remaining}
          selected={selected}
          orientation={orientation}
          myBoardReady={myBoardReady}
          onSelect={setSelected}
          onToggleOrientation={() => setOrientation(o => o === 'h' ? 'v' : 'h')}
          onRandomize={handleRandomize}
          onReady={handleReady}
        />
      </div>
    </div>
  )
}
