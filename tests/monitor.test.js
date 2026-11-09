import { afterEach, expect, test } from "bun:test"

import { mountMonitor } from "../src/pages/monitor/index.js"
import { fixture } from "./helpers/fake-hid.js"

const original = new Map(
  ["window", "document", "navigator", "setInterval", "clearInterval"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
)
let unmount

afterEach(() => {
  unmount?.()
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test("初期状態では機器を開かず接続操作の後だけ実データを表示する", async () => {
  const { root, device, tick } = mountFixture()

  expect(device.opened).toBe(false)
  root.querySelector("#connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())
  tick()

  expect(device.opened).toBe(true)
  expect(root.querySelector("#axis-z").textContent).toBe("0.999")
  expect(root.querySelector("#classification").textContent).toBe("準備中")
})

test("不正な境界の入力を拒否し初期値へリセットできる", () => {
  const { root } = mountFixture()
  const normal = root.querySelector("#threshold-normal")
  normal.value = "0.8"

  normal.dispatchEvent(new Event("input"))

  expect(root.querySelector("#threshold-error").textContent).toContain("0.05")
  expect(Number(normal.value)).toBe(0.22)
  normal.value = "0.3"
  normal.dispatchEvent(new Event("input"))
  expect(root.querySelector("#threshold-normal-value").textContent).toBe("0.30 g")
  root.querySelector("#reset").dispatchEvent(new Event("click"))
  expect(root.querySelector("#threshold-normal-value").textContent).toBe("0.22 g")
})

test("タブを離れると機器を閉じ古い値を消す", async () => {
  const { root, device, document, tick } = mountFixture()
  root.querySelector("#connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())
  tick()

  document.hidden = true
  document.dispatchEvent(new Event("visibilitychange"))
  await Bun.sleep(1)

  expect(device.opened).toBe(false)
  expect(root.querySelector("#axis-z").textContent).toBe("—")
  expect(root.querySelector("#classification").textContent).toBe("接続待ち")
})

test("受信が0.5秒途絶えると遅いではなく中断を表示する", async () => {
  const { root, device, tick } = mountFixture()
  root.querySelector("#connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())

  await Bun.sleep(510)
  tick()

  expect(root.querySelector("#classification").textContent).toBe("受信中断")
  expect(root.querySelector("#score").textContent).toBe("—")
  expect(root.querySelector("#axis-z").textContent).toBe("—")
})

test("ページ破棄後にレポートが来ても表示を書き換えない", async () => {
  const { root, device } = mountFixture()
  root.querySelector("#connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  const before = root.querySelector("#axis-z").textContent

  unmount()
  device.emit(0x30, packet())
  await Bun.sleep(1)

  expect(device.opened).toBe(false)
  expect(root.querySelector("#axis-z").textContent).toBe(before)
})

function mountFixture() {
  const { hid, device } = fixture()
  const document = new EventTarget()
  document.hidden = false
  const elements = new Map()
  const root = {
    innerHTML: "",
    querySelector(selector) {
      if (!elements.has(selector)) {
        const element = new EventTarget()
        Object.assign(element, { style: {}, dataset: {}, setAttribute() {} })
        elements.set(selector, element)
      }
      return elements.get(selector)
    },
  }
  let tick
  const globals = {
    window: { isSecureContext: true },
    document,
    navigator: { hid },
    setInterval: (callback) => {
      tick = callback
      return 1
    },
    clearInterval: () => {},
  }
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  unmount = mountMonitor(root)
  return { root, device, document, tick: () => tick() }
}

function packet() {
  const report = new DataView(new ArrayBuffer(48))
  for (let index = 0; index < 3; index++) report.setInt16(16 + index * 12, 4096, true)
  return report
}
