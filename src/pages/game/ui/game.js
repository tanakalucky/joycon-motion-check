import { supportMessage } from "../../../entities/joycon/index.js"
import { Race } from "../model/game.js"
import { gameMarkup } from "./markup.js"
import { mountPlayer } from "./player.js"

export function mountGame(root) {
  root.innerHTML = gameMarkup()
  const select = (selector) => root.querySelector(selector)
  const connect = select("#game-connect")
  const start = select("#game-start")
  const reset = select("#game-reset")
  const signal = select("#game-signal")
  const hint = select("#game-hint")
  const unsupported = supportMessage(window.isSecureContext, navigator.hid)
  const race = new Race()
  const players = []
  let lastFrame = null
  let redStartedAt = null
  let disposed = false

  connect.addEventListener("click", () => {
    if (disposed || unsupported || race.phase !== "ready" || pickerBusy()) return
    const player = players.find((entry) => !entry.connected()) ?? addPlayer()
    void player.connect()
  })
  start.addEventListener("click", () => {
    const now = performance.now()
    if (!canStart(now)) return
    race.start(players.filter((player) => player.connected()).map((player) => player.id))
    lastFrame = now
    render(now)
  })
  reset.addEventListener("click", () => {
    race.reset()
    redStartedAt = null
    render()
  })
  const visibility = () => {
    lastFrame = null
    if (document.hidden) for (const player of players) void player.disconnect()
    render()
  }
  document.addEventListener("visibilitychange", visibility)
  const timer = setInterval(tick, 40)
  render()

  return () => {
    disposed = true
    clearInterval(timer)
    document.removeEventListener("visibilitychange", visibility)
    for (const player of players) void player.dispose()
  }

  function addPlayer() {
    const panel = document.createElement("section")
    select("#game-players").append(panel)
    const player = mountPlayer(panel, {
      id: players.length + 1,
      race,
      render,
      isRedReport: (time) => redStartedAt !== null && time > redStartedAt,
    })
    players.push(player)
    return player
  }

  function pickerBusy() {
    return players.some((player) => player.busy())
  }

  function canStart(now) {
    const connected = players.filter((player) => player.connected())
    return (
      race.phase === "ready" &&
      !pickerBusy() &&
      connected.length > 0 &&
      connected.every((player) => player.active(now))
    )
  }

  function tick() {
    const now = performance.now()
    const scores = new Map(
      players
        .filter((player) => player.active(now))
        .map((player) => [player.id, player.score(lastFrame)]),
    )
    if (scores.size && lastFrame !== null) {
      const before = race.phase
      race.advance(now - lastFrame, scores)
      if (before !== race.phase) redStartedAt = race.phase === "red" ? now : null
    }
    lastFrame = scores.size ? now : null
    render(now)
  }

  function render(now = performance.now()) {
    if (disposed) return
    const running = race.phase === "green" || race.phase === "red"
    const active = players.some((player) => player.active(now))
    const phase = running && !active ? "paused" : race.phase
    connect.disabled = Boolean(unsupported) || race.phase !== "ready" || pickerBusy()
    start.disabled = !canStart(now)
    reset.disabled = race.phase === "ready"
    signal.dataset.phase = phase
    const label = {
      ready: "スタート待ち",
      green: "青信号 · 振って進む",
      red: "赤信号 · 止まる",
      paused: "一時停止",
      won: `プレイヤー ${race.winner} の勝ち！`,
    }[phase]
    if (signal.textContent !== label) signal.textContent = label
    hint.textContent =
      unsupported ||
      (phase === "paused"
        ? "コントローラーの信号を待っています。再接続するには「最初から」を押してください。"
        : "")
    for (const player of players) player.render(now)
  }
}
