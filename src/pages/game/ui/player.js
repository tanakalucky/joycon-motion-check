import { JoyConSession } from "../../../entities/joycon/index.js"
import { MotionProcessor } from "../../../entities/motion/index.js"
import { STALE_MS } from "../model/game.js"
import { playerMarkup } from "./markup.js"

export function mountPlayer(panel, { id, race, render, isRedReport }) {
  panel.className = "game-player"
  panel.setAttribute("aria-label", `プレイヤー ${id}`)
  panel.innerHTML = playerMarkup(id)
  const select = (name) => panel.querySelector(`[data-field="${name}"]`)
  const motion = new MotionProcessor()
  const disconnectButton = select("disconnect")
  let connection = "disconnected"
  let reading = null
  let arrival = null
  let readySince = null
  let disposed = false
  const session = new JoyConSession({
    hid: navigator.hid,
    secure: window.isSecureContext,
    onState,
    onPacket,
    onDisconnecting: () => onState("cancelling", "切断中…"),
  })
  disconnectButton.addEventListener("click", () => {
    if (race.phase === "ready" && ["connected", "connecting"].includes(connection))
      void session.disconnect()
  })

  return {
    id,
    connect: () => session.connect(),
    disconnect: () => session.disconnect("画面を離れたため切断しました。"),
    dispose() {
      disposed = true
      return session.dispose()
    },
    active,
    connected: () => connection === "connected",
    busy: () => ["connecting", "cancelling"].includes(connection),
    score: (since) => (readySince <= since ? reading.score : 0),
    render: renderPlayer,
  }

  function onState(state, message) {
    if (disposed) return
    connection = state
    clearMotion()
    select("connection").textContent = `プレイヤー ${id}：${message}`
    render()
  }

  function clearMotion() {
    motion.reset()
    race.forgetRedBaseline(id)
    reading = null
    arrival = null
    readySince = null
  }

  function onPacket(samples, now) {
    if (disposed) return
    if (arrival !== null && now - arrival > STALE_MS) clearMotion()
    arrival = now
    for (const sample of samples) {
      const next = motion.push(sample)
      if (!next) continue
      reading = next
      if (!next.warming) readySince ??= now
      if (isRedReport(now) && active(now)) race.observeRed(id, next)
    }
  }

  function active(now) {
    return (
      !document.hidden &&
      connection === "connected" &&
      readySince !== null &&
      now - arrival <= STALE_MS
    )
  }

  function renderPlayer(now) {
    const usable = active(now)
    const player = race.players.get(id)
    const progress = player?.progress ?? 0
    select("runner").style.left = `${progress * 100}%`
    select("progress").value = progress
    select("strength").value = usable ? Math.min(1, reading.score) : 0
    disconnectButton.hidden =
      race.phase !== "ready" || !["connected", "connecting"].includes(connection)
    disconnectButton.textContent =
      connection === "connecting" ? "選択をキャンセル" : "このJoy-Conを切断"
    const note = usable
      ? race.phase === "red" && player?.penalized
        ? "動きを検知したため少し戻りました。"
        : "準備完了"
      : connection === "connected" && arrival !== null && now - arrival <= STALE_MS
        ? "準備中。Joy-Conを静止させてください。"
        : "信号待ち"
    const announcement = `プレイヤー ${id}：${note}`
    if (select("hint").textContent !== announcement) select("hint").textContent = announcement
  }
}
