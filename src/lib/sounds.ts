let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0) {
  const c = ac()
  const t = c.currentTime + delay
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.start(t)
  osc.stop(t + dur)
}

export function playMiss() {
  tone(280, 0.4, 'sine', 0.15)
  tone(200, 0.5, 'sine', 0.08, 0.12)
}

export function playHit() {
  tone(130, 0.18, 'sawtooth', 0.45)
  tone(80,  0.40, 'square',   0.30, 0.14)
}

export function playMine() {
  tone(95,  0.14, 'sawtooth', 0.60)
  tone(55,  0.35, 'square',   0.55, 0.10)
  tone(130, 0.25, 'sawtooth', 0.35, 0.24)
}

export function playSunk() {
  tone(200, 0.18, 'sawtooth', 0.40)
  tone(160, 0.20, 'sawtooth', 0.40, 0.18)
  tone(120, 0.22, 'sawtooth', 0.40, 0.36)
  tone(75,  0.45, 'square',   0.55, 0.54)
}

export function playWin() {
  const notes = [261, 329, 392, 523, 659]
  notes.forEach((freq, i) => tone(freq, 0.30, 'triangle', 0.35, i * 0.13))
}

export function playLose() {
  const notes = [330, 277, 220, 165]
  notes.forEach((freq, i) => tone(freq, 0.32, 'sawtooth', 0.22, i * 0.20))
}
