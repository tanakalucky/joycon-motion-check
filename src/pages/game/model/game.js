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
    this.progress = 0
    this.phase = "ready"
    this.phaseTime = 0
    this.penalized = false
    this.redBaseline = null
  }

  start() {
    this.phase = "green"
    this.phaseTime = 0
  }

  observeRed(sample) {
    if (this.phase !== "red" || this.phaseTime < RED_GRACE_MS || this.penalized) return
    const baseline = (this.redBaseline ??= sample)
    if (Math.hypot(sample.x - baseline.x, sample.y - baseline.y, sample.z - baseline.z) >= 0.2) {
      this.progress = Math.max(0, this.progress - RED_PENALTY)
      this.penalized = true
    }
  }

  forgetRedBaseline() {
    this.redBaseline = null
  }

  advance(ms, score) {
    if (!["green", "red"].includes(this.phase)) return
    if (!Number.isFinite(ms) || !Number.isFinite(score) || ms <= 0) return

    const strength = Math.min(1, Math.max(0, (score - 0.1) / 0.65))
    let remaining = Math.min(ms, 100)
    while (remaining > 0) {
      const duration = this.phase === "green" ? GREEN_MS : RED_MS
      const step = Math.min(remaining, duration - this.phaseTime)
      if (this.phase === "green") {
        this.progress = Math.min(1, this.progress + 0.00028 * strength * step)
        if (this.progress === 1) {
          this.phase = "won"
          return
        }
      }
      this.phaseTime += step
      remaining -= step
      if (this.phaseTime >= duration) {
        this.phase = this.phase === "green" ? "red" : "green"
        this.phaseTime = 0
        this.penalized = false
        this.redBaseline = null
      }
    }
  }
}
