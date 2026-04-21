import { useState, useEffect, useMemo } from 'react'
import { Board } from './components/Board'
import { ShipPanel } from './components/ShipPanel'
import { Lobby } from './components/Lobby'
import { GameScreen } from './components/GameScreen'
import type { CellState } from './components/Board'
import type { SelectedShip } from './components/ShipPanel'
import { SHIP_DEFS } from './store/ships'
import type { ShipType } from './store/ships'
import type { GameSession, ShotRecord } from './store/game'
import { supabase } from './lib/supabase'

const SHOT_TIME = 30

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
  const [screen, setScreen]             = useState<'lobby' | 'placement' | 'game'>('lobby')
  const [session, setSession]           = useState<GameSession | null>(null)

  // faza rozmieszczania
  const [board, setBoard]               = useState<CellState[][]>(emptyBoard)
  const [remaining, setRemaining]       = useState<Record<ShipType, number>>(initialRemaining)
  const [selected, setSelected]         = useState<SelectedShip | null>(null)
  const [orientation, setOrientation]   = useState<'h' | 'v'>('h')
  const [hoverCell, setHoverCell]       = useState<{ row: number; col: number } | null>(null)
  const [myBoardReady, setMyBoardReady] = useState(false)

  // faza gry
  const [shots, setShots]                     = useState<ShotRecord[]>([])
  const [opponentBoardFull, setOpponentBoardFull] = useState<CellState[][] | null>(null)
  const [currentTurn, setCurrentTurn]         = useState<string | null>(null)
  const [opponentId, setOpponentId]           = useState<string | null>(null)
  const [myAnimating, setMyAnimating]         = useState<Set<string>>(new Set())
  const [oppAnimating, setOppAnimating]       = useState<Set<string>>(new Set())
  const [gameLoading, setGameLoading]         = useState(false)

  // kontrolki
  const [paused, setPaused]             = useState(false)
  const [shotTimeLeft, setShotTimeLeft] = useState(SHOT_TIME)

  // wartości pochodne
  const gameId    = session?.gameId
  const isMyTurn  = screen === 'game' && currentTurn === session?.playerId

  // ---- widoki plansz (memoizowane) ----

  // Moja plansza: moje statki + strzały przeciwnika na wierzchu
  const myBoardView = useMemo<CellState[][]>(() => {
    if (screen !== 'game') return board
    const view = board.map(row => [...row] as CellState[])
    shots
      .filter(s => s.shooter_id !== session?.playerId)
      .forEach(({ row, col, result }) => {
        if      (result === 'hit'  ) view[row][col] = 'hit'
        else if (result === 'miss' ) view[row][col] = 'miss'
        else if (result === 'mine' ) view[row][col] = 'exploded'
      })
    return view
  }, [board, shots, session?.playerId, screen])

  // Plansza przeciwnika: tylko pola, w które już strzelałem
  const oppBoardView = useMemo<CellState[][]>(() => {
    const view = emptyBoard()
    shots
      .filter(s => s.shooter_id === session?.playerId)
      .forEach(({ row, col, result }) => {
        if      (result === 'hit'  ) view[row][col] = 'hit'
        else if (result === 'miss' ) view[row][col] = 'miss'
        else if (result === 'mine' ) view[row][col] = 'exploded'
      })
    return view
  }, [shots, session?.playerId])

  // ---- Realtime: zmiany statusu gry i current_turn ----
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(`status-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as { status: string; current_turn: string | null }
          if (updated.status === 'active') {
            setScreen('game')
            setShotTimeLeft(SHOT_TIME)
          }
          if (updated.current_turn !== undefined) {
            setCurrentTurn(updated.current_turn)
            setShotTimeLeft(SHOT_TIME)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // ---- Realtime: nowe strzały ----
  useEffect(() => {
    if (!gameId || !session) return

    const playerId = session.playerId
    const channel  = supabase
      .channel(`shots-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shots', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const shot = payload.new as ShotRecord

          // Pomiń duplikat (optimistic update tego samego gracza)
          setShots(prev => {
            const dup = prev.some(s => s.shooter_id === shot.shooter_id && s.row === shot.row && s.col === shot.col)
            return dup ? prev : [...prev, shot]
          })

          // Animuj strzał na MOJEJ planszy gdy strzelał przeciwnik
          if (shot.shooter_id !== playerId) {
            const key = `${shot.row}-${shot.col}`
            setMyAnimating(prev => new Set(prev).add(key))
            setTimeout(() => setMyAnimating(prev => { const n = new Set(prev); n.delete(key); return n }), 950)
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, session?.playerId])

  // ---- Ładowanie danych gry gdy screen → 'game' ----
  useEffect(() => {
    if (screen !== 'game' || !session) return

    let cancelled = false
    setGameLoading(true)

    async function load() {
      const gameId = session!.gameId

      // Obie plansze
      const { data: boards } = await supabase
        .from('boards')
        .select('player_id, cells')
        .eq('game_id', gameId)

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

      // Stan gry: current_turn, opponent ID
      const { data: game } = await supabase
        .from('games')
        .select('current_turn, player1_id, player2_id')
        .eq('id', gameId)
        .single()

      if (!cancelled && game) {
        setCurrentTurn(game.current_turn)
        setOpponentId(session!.role === 'player1' ? game.player2_id : game.player1_id)
      }

      // Historia strzałów
      const { data: history } = await supabase
        .from('shots')
        .select('shooter_id, row, col, result')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })

      if (!cancelled && history) setShots(history as ShotRecord[])

      if (!cancelled) setGameLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [screen, session?.gameId])

  // ---- Timer ----
  useEffect(() => {
    if (!isMyTurn || paused) return
    const id = setInterval(() => {
      setShotTimeLeft(t => (t <= 1 ? SHOT_TIME : t - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [isMyTurn, paused])

  // ---- Klawisze ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation(o => o === 'h' ? 'v' : 'h')
      if (e.key === 'Escape' && screen === 'game') setPaused(p => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  // ---- Akcje ----

  function handleGameReady(s: GameSession) {
    setSession(s)
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

    const { error } = await supabase
      .from('boards')
      .insert({ game_id: session.gameId, player_id: session.playerId, cells: board.flat(), is_ready: true })

    if (error) { console.error('Błąd zapisu planszy:', error); setMyBoardReady(false); return }

    // Jeśli obaj gotowi → zmień status i ustaw pierwszą turę
    const { data: allBoards } = await supabase
      .from('boards').select('is_ready').eq('game_id', session.gameId)

    if (allBoards?.length === 2 && allBoards.every(b => b.is_ready)) {
      const { data: game } = await supabase
        .from('games').select('player1_id').eq('id', session.gameId).single()

      await supabase.from('games').update({
        status: 'active',
        current_turn: game?.player1_id,
      }).eq('id', session.gameId)
      // Realtime wywoła setScreen('game') u obu graczy
    }
  }

  function handleSurrender() {
    setSession(null)   // czyści subskrypcje Realtime
    setScreen('lobby')
    setBoard(emptyBoard())
    setRemaining(initialRemaining())
    setSelected(null)
    setMyBoardReady(false)
    setShots([])
    setOpponentBoardFull(null)
    setCurrentTurn(null)
    setOpponentId(null)
    setPaused(false)
    setShotTimeLeft(SHOT_TIME)
  }

  async function handleShot(row: number, col: number) {
    if (!session || !opponentBoardFull || !opponentId) return
    if (!isMyTurn || paused) return

    // Sprawdź czy pole nie było już strzelane
    const alreadyShot = shots.some(s => s.shooter_id === session.playerId && s.row === row && s.col === col)
    if (alreadyShot) return

    // Wyznacz wynik na podstawie planszy przeciwnika
    const cell   = opponentBoardFull[row][col]
    const result = cell === 'ship' ? 'hit' : cell === 'mine' ? 'mine' : 'miss'

    // Optymistyczna aktualizacja
    const shot: ShotRecord = { shooter_id: session.playerId, row, col, result }
    setShots(prev => [...prev, shot])
    setShotTimeLeft(SHOT_TIME)
    const key = `${row}-${col}`
    setOppAnimating(prev => new Set(prev).add(key))
    setTimeout(() => setOppAnimating(prev => { const n = new Set(prev); n.delete(key); return n }), 950)

    // Zapisz do bazy
    const { error: shotErr } = await supabase.from('shots').insert({
      game_id: session.gameId, shooter_id: session.playerId, row, col, result,
    })

    if (shotErr) {
      // Cofnij optimistic update
      setShots(prev => prev.filter(s => !(s.shooter_id === session.playerId && s.row === row && s.col === col)))
      console.error('Błąd zapisu strzału:', shotErr)
      return
    }

    // Trafienie → moja tura zostaje, pudło/mina → tura przechodzi
    const nextTurn = result === 'hit' ? session.playerId : opponentId
    await supabase.from('games').update({ current_turn: nextTurn }).eq('id', session.gameId)
    // Realtime zaktualizuje current_turn u obu graczy
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
    return <Lobby onReady={handleGameReady} />
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
        onShot={handleShot}
        onPause={() => setPaused(p => !p)}
        onSurrender={handleSurrender}
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
        <h1 className="text-2xl font-bold text-white tracking-wide">Statki – Multiplayer</h1>
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

          {/* Nakładka oczekiwania */}
          {myBoardReady && (
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-sm">
              <svg className="animate-spin h-8 w-8 text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <p className="text-white font-bold text-sm">Plansza zatwierdzona ✓</p>
              <p className="text-gray-400 text-xs">Oczekiwanie na przeciwnika…</p>
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
