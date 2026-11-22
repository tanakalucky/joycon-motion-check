import { JoyConSession } from "../../../entities/joycon/index.js"
import { MotionProcessor } from "../../../entities/motion/index.js"
import { deviceMarkup } from "./markup.js"

export function mountDevice(
  panel,
  { number, initialMessage, getThresholds, pickerBusy, stateChanged },
) {
  panel.innerHTML = deviceMarkup(number)
  const select = (name) => panel.querySelector(`[data-field="${name}"]`)
  const processor = new MotionProcessor()
  let status = "disconnected"
  let latest = null
  let history = []
  let arrivals = []
  let lastArrival = null
  let connectedAt = null
  let disposed = false
  const session = new JoyConSession({
    hid: navigator.hid,
    secure: window.isSecureContext,
    onState,
    onPacket,
  })

  select("connect").addEventListener("click", () => {
    if (status === "connecting" || status === "connected")
      void session.disconnect("接続を終了しました。")
    else if (!pickerBusy()) void session.connect()
  })
  select("connection-message").textContent = initialMessage
  renderMeasurement()
  return {
    get status() {
      return status
    },
    connect: () => session.connect(),
    disconnect: () => session.disconnect("画面を離れたため切断しました。再接続してください。"),
    dispose() {
      disposed = true
      return session.dispose()
    },
    setAvailable(disabled) {
      select("connect").disabled =
        status === "cancelling" || (disabled && status !== "connected" && status !== "connecting")
    },
    setThresholds({ normal, fast }) {
      processor.previous = null
      select("motion-meter").style.gridTemplateColumns =
        `${normal}fr ${fast - normal}fr ${1 - fast}fr`
    },
    renderMeasurement,
  }

  function onState(next, message) {
    if (disposed) return
    status = next
    stateChanged()
    if (next !== "connected") {
      processor.reset()
      latest = null
      history = []
      arrivals = []
      lastArrival = null
    } else connectedAt = performance.now()
    select("connection-status").textContent = {
      disconnected: "未接続",
      connecting: "接続中…",
      cancelling: "終了中…",
      connected: "接続済み",
      error: "接続エラー",
    }[next]
    select("connection-status").dataset.connected = next === "connected"
    select("connection-message").textContent = message
    select("connect").textContent =
      next === "connected" ? "切断する" : next === "connecting" ? "キャンセル" : "Joy-Conに接続 →"
    renderMeasurement()
  }

  function onPacket(samples, arrival) {
    if (disposed) return
    if (lastArrival !== null && arrival - lastArrival > 500) {
      processor.reset()
      history = []
    }
    lastArrival = arrival
    arrivals.push(arrival)
    for (const sample of samples) {
      const result = processor.push(sample, getThresholds())
      if (result) {
        latest = result
        history.push(result)
      }
    }
    history = history.slice(-1600)
  }

  function renderMeasurement() {
    const now = performance.now()
    arrivals = arrivals.filter((time) => now - time < 1000)
    const stale = status === "connected" && now - (lastArrival ?? connectedAt) > 500
    const visible = status === "connected" && latest && !stale
    const label = stale
      ? "受信中断"
      : !visible
        ? status === "connected"
          ? "受信待ち"
          : "接続待ち"
        : latest.warming
          ? "準備中"
          : { slow: "遅い", normal: "普通", fast: "速い" }[latest.level]
    if (select("classification").textContent !== label) select("classification").textContent = label
    select("reading-note").textContent = stale
      ? "Bluetooth接続を確認してください。"
      : visible && latest.warming
        ? `静止してください · あと${latest.remaining.toFixed(1)}秒`
        : ""
    select("result").dataset.level = visible ? (latest.level ?? "disconnected") : "disconnected"
    select("score").textContent = visible && !latest.warming ? latest.score.toFixed(3) : "—"
    select("packet-rate").textContent =
      status === "connected" ? `${arrivals.length} packets/s` : "— packets/s"
    select("last-received").textContent =
      lastArrival === null
        ? "最終受信 —"
        : `最終受信 ${Math.max(0, now - lastArrival).toFixed(0)} ms前`
    for (const axis of ["x", "y", "z"])
      select(`axis-${axis}`).textContent = visible ? latest[axis].toFixed(3) : "—"
    select("chart-empty").hidden = Boolean(visible)
    select("chart-empty").textContent = stale ? "データの受信が止まっています" : "受信待ち"
    const recent = visible ? history.filter((sample) => latest.time - sample.time <= 8000) : []
    select("wave-line").setAttribute(
      "points",
      recent
        .filter((_, index) => index % 4 === 0)
        .map(
          (sample) =>
            `${680 - ((latest.time - sample.time) / 8000) * 680},${150 - Math.min(sample.magnitude, 2) * 60}`,
        )
        .join(" "),
    )
    select("meter-marker").style.left =
      visible && !latest.warming ? `${Math.min(latest.score, 1) * 100}%` : "0%"
  }
}
