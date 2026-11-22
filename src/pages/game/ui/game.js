import { JoyConSession, supportMessage } from "../../../entities/joycon/index.js"
import { MotionProcessor } from "../../../entities/motion/index.js"
import { Race, STALE_MS } from "../model/game.js"
import { gameMarkup } from "./markup.js"

export function mountGame(root) {
  root.innerHTML = gameMarkup()
  const select = (selector) => root.querySelector(selector)
  const connect = select("#game-connect")
  const start = select("#game-start")
  const reset = select("#game-reset")
  const signal = select("#game-signal")
  const hint = select("#game-hint")
  const runner = select("#game-runner")
  const progress = select("#game-progress")
  const strength = select("#game-strength")
  const unsupported = supportMessage(window.isSecureContext, navigator.hid)
  const motion = new MotionProcessor()
  const race = new Race()
  let connection = "disconnected"
  let reading = null
  let arrival = null
  let lastFrame = null
  let redStartedAt = null
  let disposed = false
  const session = new JoyConSession({
    hid: navigator.hid,
    secure: window.isSecureContext,
    onState,
    onPacket,
  })

  connect.addEventListener("click", () => {
    if (connection === "connected" || connection === "connecting") void session.disconnect()
    else if (!unsupported && connection !== "cancelling") void session.connect()
  })
  start.addEventListener("click", () => {
    if (!usable(performance.now()) || race.phase !== "ready") return
    race.start()
    lastFrame = performance.now()
    render()
  })
  reset.addEventListener("click", () => {
    race.reset()
    redStartedAt = null
    render()
  })
  const visibility = () => {
    if (document.hidden) void session.disconnect("画面を離れたため切断しました。")
  }
  document.addEventListener("visibilitychange", visibility)
  const timer = setInterval(tick, 40)
  onState("disconnected", unsupported || "Bluetoothでペアリングした機器を1台選んでください。")

  return () => {
    disposed = true
    clearInterval(timer)
    document.removeEventListener("visibilitychange", visibility)
    void session.dispose()
  }

  function onState(state, message) {
    if (disposed) return
    connection = state
    motion.reset()
    race.forgetRedBaseline()
    reading = null
    arrival = null
    select("#game-connection").textContent = message
    connect.disabled = Boolean(unsupported) || state === "cancelling"
    connect.textContent =
      {
        connected: "切断する",
        connecting: "キャンセル",
        cancelling: "終了中…",
      }[state] ?? "Joy-Conに接続 →"
    render()
  }

  function onPacket(samples, now) {
    if (disposed) return
    if (arrival !== null && now - arrival > STALE_MS) {
      motion.reset()
      race.forgetRedBaseline()
    }
    arrival = now
    for (const sample of samples) {
      const next = motion.push(sample)
      if (!next) continue
      reading = next
      // WebHID identifies report arrival, not when each physical movement happened.
      if (redStartedAt !== null && now > redStartedAt && usable(now)) race.observeRed(next)
    }
  }

  function tick() {
    const now = performance.now()
    if (usable(now) && lastFrame !== null) {
      const before = race.phase
      race.advance(now - lastFrame, reading.score)
      if (before !== race.phase) redStartedAt = race.phase === "red" ? now : null
    }
    lastFrame = now
    render(now)
  }

  function usable(now) {
    return (
      !document.hidden &&
      connection === "connected" &&
      reading &&
      !reading.warming &&
      now - arrival <= STALE_MS
    )
  }

  function render(now = performance.now()) {
    const active = usable(now)
    const running = race.phase === "green" || race.phase === "red"
    const phase = running && !active ? "paused" : race.phase
    start.disabled = !active || race.phase !== "ready"
    reset.disabled = race.phase === "ready"
    signal.dataset.phase = phase
    const label = {
      ready: "スタート待ち",
      green: "青信号 · 振って進む",
      red: "赤信号 · 止まる",
      paused: "一時停止",
      won: "ゴール！",
    }[phase]
    if (signal.textContent !== label) signal.textContent = label
    const note = active
      ? race.phase === "red" && race.penalized
        ? "動きを検知したため少し戻りました。"
        : ""
      : connection === "connected" && arrival !== null && now - arrival <= STALE_MS
        ? "準備中。Joy-Conを静止させてください。"
        : "信号が届くまでゲームは進みません。"
    if (hint.textContent !== note) hint.textContent = note
    runner.style.left = `${race.progress * 100}%`
    progress.value = race.progress
    strength.value = active ? Math.min(1, reading.score) : 0
  }
}
