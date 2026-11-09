export const DEFAULT_THRESHOLDS = Object.freeze({ normal: 0.22, fast: 0.55 })

export class MotionProcessor {
  constructor() {
    this.reset()
  }

  reset() {
    this.gravity = null
    this.energy = []
    this.elapsed = 0
    this.previous = null
    this.lastTime = null
  }

  push(sample, thresholds = DEFAULT_THRESHOLDS) {
    if (
      !validateThresholds(thresholds) ||
      ![sample.x, sample.y, sample.z, sample.time].every(Number.isFinite)
    )
      return null
    if (this.lastTime !== null && sample.time <= this.lastTime) return null
    if (this.lastTime !== null && sample.time - this.lastTime > 500) this.reset()
    this.lastTime = sample.time
    if (!this.gravity) this.gravity = { x: sample.x, y: sample.y, z: sample.z }

    // Each report contains three 5 ms IMU samples; arrival jitter is not sensor dt.
    const alpha = 1 - Math.exp(-0.005 / 0.5)
    let squared = 0
    for (const axis of ["x", "y", "z"]) {
      this.gravity[axis] += alpha * (sample[axis] - this.gravity[axis])
      squared += (sample[axis] - this.gravity[axis]) ** 2
    }
    this.elapsed += 5
    this.energy.push(squared)
    if (this.energy.length > 60) this.energy.shift()
    const score = Math.sqrt(this.energy.reduce((sum, value) => sum + value, 0) / this.energy.length)
    const warming = this.elapsed < 1000
    this.previous = warming ? null : classifyMotion(score, thresholds, this.previous)
    return {
      ...sample,
      score,
      magnitude: Math.sqrt(squared),
      level: this.previous,
      warming,
      remaining: Math.max(0, (1000 - this.elapsed) / 1000),
    }
  }
}

export function classifyMotion(score, thresholds = DEFAULT_THRESHOLDS, previous = null) {
  if (!Number.isFinite(score) || score < 0 || !validateThresholds(thresholds)) return null
  const margin = 0.025
  if (score >= thresholds.fast || (previous === "fast" && score >= thresholds.fast - margin))
    return "fast"
  if (
    score >= thresholds.normal ||
    (previous && previous !== "slow" && score >= thresholds.normal - margin)
  )
    return "normal"
  return "slow"
}

export function validateThresholds({ normal, fast }) {
  return (
    Number.isFinite(normal) &&
    Number.isFinite(fast) &&
    normal >= 0.05 &&
    normal <= 0.9 &&
    fast <= 1 &&
    fast - normal >= 0.05 - 1e-9
  )
}
