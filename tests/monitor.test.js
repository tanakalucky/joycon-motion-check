import { afterEach, expect, test } from "bun:test"

import { mountMonitor } from "../src/pages/monitor/index.js"
import { FakeDevice, fixture } from "./helpers/fake-hid.js"

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
  const { panel, device, tick } = mountFixture()

  expect(device.opened).toBe(false)
  panel(0, "connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())
  tick()

  expect(device.opened).toBe(true)
  expect(panel(0, "axis-z").textContent).toBe("0.999")
  expect(panel(0, "classification").textContent).toBe("準備中")
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
  const { panel, device, document, tick } = mountFixture()
  panel(0, "connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())
  tick()

  document.hidden = true
  document.dispatchEvent(new Event("visibilitychange"))
  await Bun.sleep(1)

  expect(device.opened).toBe(false)
  expect(panel(0, "axis-z").textContent).toBe("—")
  expect(panel(0, "classification").textContent).toBe("接続待ち")
})

test("受信が0.5秒途絶えると遅いではなく中断を表示する", async () => {
  const { panel, device, tick } = mountFixture()
  panel(0, "connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  device.emit(0x30, packet())

  await Bun.sleep(510)
  tick()

  expect(panel(0, "classification").textContent).toBe("受信中断")
  expect(panel(0, "score").textContent).toBe("—")
  expect(panel(0, "axis-z").textContent).toBe("—")
})

test("ページ破棄後にレポートが来ても表示を書き換えない", async () => {
  const { panel, device } = mountFixture()
  panel(0, "connect").dispatchEvent(new Event("click"))
  await Bun.sleep(1)
  const before = panel(0, "axis-z").textContent

  unmount()
  device.emit(0x30, packet())
  await Bun.sleep(1)

  expect(device.opened).toBe(false)
  expect(panel(0, "axis-z").textContent).toBe(before)
})

test("同じ側の2台の加速度は別のパネルに表示され、片方の切断は他方に影響しない", async () => {
  const { root, hid, panel, device, tick } = mountFixture()
  const other = new FakeDevice()
  const choices = [device, other]
  hid.requestDevice = async () => [choices.shift()]

  panel(0, "connect").click()
  await Bun.sleep(1)
  root.querySelector("#add-device").click()
  await Bun.sleep(1)
  device.emit(0x30, packet(4096))
  other.emit(0x30, packet(-2048))
  tick()

  expect(panel(0, "axis-z").textContent).toBe("0.999")
  expect(panel(1, "axis-z").textContent).toBe("-0.500")
  panel(0, "connect").click()
  await Bun.sleep(1)
  other.emit(0x30, packet(1024))
  tick()
  expect(device.opened).toBe(false)
  expect(other.opened).toBe(true)
  expect(panel(0, "axis-z").textContent).toBe("—")
  expect(panel(1, "axis-z").textContent).toBe("0.250")
})

test("同一機器の再選択や追加のキャンセルでも既存機器はそのまま受信する", async () => {
  const { root, device, hid, panel, tick } = mountFixture()
  panel(0, "connect").click()
  await Bun.sleep(1)
  root.querySelector("#add-device").click()
  await Bun.sleep(1)

  expect(panel(1, "connection-message").textContent).toContain("使用中")
  expect(device.reports).toHaveLength(2)
  hid.requestDevice = async () => []
  root.querySelector("#add-device").click()
  await Bun.sleep(1)
  device.emit(0x30, packet())
  tick()

  expect(panel(1, "connection-message").textContent).toContain("キャンセル")
  expect(panel(0, "axis-z").textContent).toBe("0.999")
  expect(device.opened).toBe(true)
})

test("片方の受信中断はもう片方の値を消さず、タブを離れると両方を閉じる", async () => {
  const { root, document, device, hid, panel, tick } = mountFixture()
  const other = new FakeDevice()
  panel(0, "connect").click()
  await Bun.sleep(1)
  hid.requestDevice = async () => [other]
  root.querySelector("#add-device").click()
  await Bun.sleep(1)
  device.emit(0x30, packet())

  await Bun.sleep(510)
  other.emit(0x30, packet())
  tick()
  expect(panel(0, "classification").textContent).toBe("受信中断")
  expect(panel(1, "axis-z").textContent).toBe("0.999")
  document.hidden = true
  document.dispatchEvent(new Event("visibilitychange"))
  await Bun.sleep(1)

  expect([device.opened, other.opened]).toEqual([false, false])
  expect([panel(0, "axis-z").textContent, panel(1, "axis-z").textContent]).toEqual(["—", "—"])
})

test("選択画面を開いている間は追加を繰り返しても別の選択画面やパネルが増えない", async () => {
  const { root, hid, panel } = mountFixture()
  const add = root.querySelector("#add-device")
  panel(0, "connect").click()
  await Bun.sleep(1)
  let prompts = 0
  const chooser = Promise.withResolvers()
  hid.requestDevice = () => {
    prompts++
    return chooser.promise
  }

  add.click()
  add.click()

  expect(add.disabled).toBe(true)
  expect(prompts).toBe(1)
  expect(root.querySelector("#device-panels").children).toHaveLength(2)
  chooser.resolve([])
  await Bun.sleep(1)
  expect(add.disabled).toBe(false)
})

test("追加に失敗した機器を閉じ終わるまで再選択を待ち、直後に同じパネルで再試行できる", async () => {
  const { root, hid, panel } = mountFixture()
  const add = root.querySelector("#add-device")
  panel(0, "connect").click()
  await Bun.sleep(1)
  const other = new FakeDevice()
  other.failSend = true
  const closed = Promise.withResolvers()
  other.close = async () => {
    await closed.promise
    other.opened = false
  }
  hid.requestDevice = async () => [other]

  add.click()
  await Bun.sleep(1)
  expect(add.disabled).toBe(true)
  closed.resolve()
  await Bun.sleep(1)

  expect(panel(1, "connection-status").textContent).toBe("接続エラー")
  expect(add.disabled).toBe(false)
  other.failSend = false
  add.click()
  await Bun.sleep(1)
  expect(panel(1, "connection-status").textContent).toBe("接続済み")
  expect(root.querySelector("#device-panels").children).toHaveLength(2)
})

function mountFixture() {
  const { hid, device } = fixture()
  const document = new EventTarget()
  document.hidden = false
  document.createElement = fakeElement
  const root = fakeElement()
  const panel = (index, name) =>
    root.querySelector("#device-panels").children[index].querySelector(`[data-field="${name}"]`)
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
  return { root, panel, hid, device, document, tick: () => tick() }
}

function fakeElement() {
  const elements = new Map()
  return Object.assign(new EventTarget(), {
    style: {},
    dataset: {},
    children: [],
    setAttribute() {},
    append(child) {
      this.children.push(child)
    },
    click() {
      if (!this.disabled) this.dispatchEvent(new Event("click"))
    },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, fakeElement())
      return elements.get(selector)
    },
  })
}

function packet(z = 4096) {
  const report = new DataView(new ArrayBuffer(48))
  for (let index = 0; index < 3; index++) report.setInt16(16 + index * 12, z, true)
  return report
}
