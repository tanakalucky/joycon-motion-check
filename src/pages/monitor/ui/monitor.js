import { supportMessage } from "../../../entities/joycon/index.js"
import { DEFAULT_THRESHOLDS, validateThresholds } from "../../../entities/motion/index.js"
import { mountDevice } from "./device.js"
import { monitorMarkup } from "./markup.js"

export function mountMonitor(root) {
  root.innerHTML = monitorMarkup()
  const select = (selector) => root.querySelector(selector)
  const devices = []
  const unsupported = supportMessage(window.isSecureContext, navigator.hid)
  let thresholds = { ...DEFAULT_THRESHOLDS }
  let disposed = false
  addPanel()

  select("#add-device").addEventListener("click", () => {
    if (unsupported || pickerBusy() || disposed) return
    const available = devices.find((device) => ["disconnected", "error"].includes(device.status))
    void (available ?? addPanel()).connect()
  })
  for (const name of ["normal", "fast"])
    select(`#threshold-${name}`).addEventListener("input", (event) => {
      const next = { ...thresholds, [name]: Number(event.target.value) }
      if (!validateThresholds(next)) {
        event.target.value = thresholds[name]
        select("#threshold-error").textContent = "境界の間隔は0.05 g以上にしてください。"
        return
      }
      thresholds = next
      select("#threshold-error").textContent = ""
      renderThresholds()
    })
  select("#reset").addEventListener("click", () => {
    thresholds = { ...DEFAULT_THRESHOLDS }
    select("#threshold-error").textContent = ""
    renderThresholds()
  })
  const visibility = () => {
    if (document.hidden) for (const device of devices) void device.disconnect()
  }
  document.addEventListener("visibilitychange", visibility)
  const timer = setInterval(() => devices.forEach((device) => device.renderMeasurement()), 100)
  renderThresholds()
  updateControls()

  return () => {
    disposed = true
    clearInterval(timer)
    document.removeEventListener("visibilitychange", visibility)
    for (const device of devices) void device.dispose()
  }

  function addPanel() {
    const panel = document.createElement("section")
    const number = devices.length + 1
    panel.className = "monitor-layout"
    panel.setAttribute("aria-label", `コントローラー ${number}`)
    select("#device-panels").append(panel)
    const device = mountDevice(panel, {
      number,
      initialMessage: unsupported || "OSのBluetooth設定でペアリングしてから接続。",
      getThresholds: () => thresholds,
      pickerBusy,
      stateChanged: updateControls,
    })
    devices.push(device)
    device.setThresholds(thresholds)
    return device
  }

  function pickerBusy() {
    return devices.some((device) => ["connecting", "cancelling"].includes(device.status))
  }

  function updateControls() {
    if (disposed) return
    const disabled = Boolean(unsupported) || pickerBusy()
    select("#add-device").disabled = disabled
    select("#add-device").hidden = !devices.some((device) => device.status === "connected")
    for (const device of devices) device.setAvailable(disabled)
  }

  function renderThresholds() {
    for (const name of ["normal", "fast"]) {
      select(`#threshold-${name}`).value = thresholds[name]
      select(`#threshold-${name}-value`).textContent = thresholds[name].toFixed(2) + " g"
    }
    for (const device of devices) device.setThresholds(thresholds)
  }
}
