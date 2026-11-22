export const STALE_MS = 500

const GREEN_MS = 3200
const RED_MS = 2300
const RED_GRACE_MS = 200
const RED_PENALTY = 0.08

export class Race {
  constructor() {
    this.reset()
  }

  reset() {
    this.players = new Map()
    this.phase = "ready"
    this.phaseTime = 0
    this.winner = null
  }

  start(ids) {
    this.reset()
    this.players = new Map(ids.map((id) => [id, { progress: 0, penalized: false, baseline: null }]))
    this.phase = "green"
  }

  observeRed(id, sample) {
    const player = this.players.get(id)
    if (!player || this.phase !== "red" || this.phaseTime < RED_GRACE_MS || player.penalized) return

    const baseline = (player.baseline ??= sample)
    if (Math.hypot(sample.x - baseline.x, sample.y - baseline.y, sample.z - baseline.z) >= 0.2) {
      player.progress = Math.max(0, player.progress - RED_PENALTY)
      player.penalized = true
    }
  }

  forgetRedBaseline(id) {
    const player = this.players.get(id)
    if (player) player.baseline = null
  }

  advance(ms, scores) {
    if (!["green", "red"].includes(this.phase) || !Number.isFinite(ms) || ms <= 0) return
    const racers = [...this.players].map(([id, player]) => [id, player, speed(scores.get(id))])
    let remaining = Math.min(ms, 100)
    while (remaining > 0) {
      const duration = this.phase === "green" ? GREEN_MS : RED_MS
      const step = Math.min(remaining, duration - this.phaseTime)
      if (this.phase === "green" && this.advancePlayers(racers, step)) return

      this.phaseTime += step
      remaining -= step
      if (this.phaseTime >= duration) {
        this.phase = this.phase === "green" ? "red" : "green"
        this.phaseTime = 0
        for (const player of this.players.values()) {
          player.penalized = false
          player.baseline = null
        }
      }
    }
  }

  advancePlayers(racers, step) {
    let finishTime = step
    for (const [id, player, rate] of racers) {
      if (rate === 0) continue
      const crossing = (1 - player.progress) / rate
      if (crossing < finishTime || (crossing === finishTime && this.winner === null)) {
        finishTime = crossing
        this.winner = id
      }
    }
    for (const [, player, rate] of racers) {
      player.progress = Math.min(1, player.progress + rate * finishTime)
    }
    if (this.winner === null) return false
    this.players.get(this.winner).progress = 1
    this.phase = "won"
    return true
  }
}

function speed(score) {
  return Number.isFinite(score) ? 0.00028 * Math.min(1, Math.max(0, (score - 0.1) / 0.65)) : 0
}
