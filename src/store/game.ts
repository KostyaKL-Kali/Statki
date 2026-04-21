export interface GameSession {
  gameId: string
  playerId: string
  nickname: string
  role: 'player1' | 'player2'
}

export interface Game {
  id: string
  room_code: string
  player1_id: string
  player2_id: string | null
  status: 'waiting' | 'placement' | 'active' | 'finished'
  current_turn: string | null
  winner_id: string | null
  stun: Record<string, number>
  created_at: string
  updated_at: string
}
