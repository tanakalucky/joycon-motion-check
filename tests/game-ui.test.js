import { afterEach, expect, test } from "bun:test"

import { mountGame } from "../src/pages/game/index.js"
import { FakeDevice } from "./helpers/fake-hid.js"

const originals = new Map(
  ["window", "document", "navigator", "performance", "setInterval", "clearInterval"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
)
let unmount

afterEach(() => {
  unmount?.()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test("明示的に選んだ機器だけで進み、未選択の機器の動きと切断は影響しない", async () => {
  const { device, other, hid, click, select, step } = mountFixture()
  expect(device.opened).toBe(false)
  click("connect")
  await Bun.sleep(1)
  for (let i = 0; i < 70; i++) step(0)
  click("start")
  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device: other }))
  for (let i = 0; i < 20; i++) step(0, 2700)

  expect(select("progress").value).toBe(0)
  expect(other.opened).toBe(false)
  expect(device.opened).toBe(true)
  for (let i = 0; i < 20; i++) step(i % 2 ? 2700 : -2700)
  expect(select("progress").value).toBeGreaterThan(0)
})

test("受信中断または選択中の機器が切断されると進まない", async () => {
  const { device, hid, click, select, step, advance } = mountFixture()
  click("connect")
  await Bun.sleep(1)
  for (let i = 0; i < 70; i++) step(0)
  click("start")
  for (let i = 0; i < 20; i++) step(i % 2 ? 2700 : -2700)
  const before = select("progress").value

  advance(700)
  expect(select("signal").textContent).toBe("一時停止")
  expect(select("progress").value).toBe(before)
  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device }))
  await Bun.sleep(1)
  step(2700)

  expect(device.opened).toBe(false)
  expect(select("progress").value).toBe(before)
})

test("青信号で方向を変えて静止し、赤信号直後の猶予中に揺れても減点しない", async () => {
  const { select, step, advance } = await startRace()
  for (let i = 0; i < 210; i++) step(i % 2 ? 2500 : -2500)
  for (let i = 0; i < 4; i++) step(3300)
  expect(select("signal").dataset.phase).toBe("red")
  const before = select("progress").value

  step([3300, -3300, 3300])
  for (let i = 0; i < 3; i++) advance(90)
  for (let i = 0; i < 10; i++) step(3300)

  expect(select("progress").value).toBe(before)
})

test("赤信号のレポート内の途中の揺れも取りこぼさず一度だけ減点する", async () => {
  const { select, step } = await startRace()
  for (let i = 0; i < 214; i++) step(i % 2 ? 2500 : -2500)
  for (let i = 0; i < 16; i++) step(0)
  const before = select("progress").value

  step([0, 3000, 0])
  step([0, 3000, 0])

  expect(select("signal").dataset.phase).toBe("red")
  expect(select("progress").value).toBeCloseTo(before - 0.08)
})

test("受信直後でも選択中の機器の切断で即座に一時停止する", async () => {
  const { device, hid, select, step } = await startRace()
  for (let i = 0; i < 30; i++) step(i % 2 ? 2700 : -2700)
  const before = select("progress").value

  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device }))
  await Bun.sleep(1)
  step(2700)

  expect(select("signal").dataset.phase).toBe("paused")
  expect(select("progress").value).toBe(before)
})

async function startRace() {
  const fixture = mountFixture()
  fixture.click("connect")
  await Bun.sleep(1)
  for (let i = 0; i < 70; i++) fixture.step(0)
  fixture.click("start")
  return fixture
}

function mountFixture() {
  const device = new FakeDevice()
  const other = new FakeDevice()
  const hid = new EventTarget()
  hid.requestDevice = async () => [device]
  const doc = new EventTarget()
  const elements = new Map()
  let now = 100
  let tick
  const root = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        const element = new EventTarget()
        Object.assign(element, { style: {}, dataset: {} })
        elements.set(selector, element)
      }
      return elements.get(selector)
    },
  }
  const select = (name) => root.querySelector(`#game-${name}`)
  for (const [key, value] of Object.entries({
    window: { isSecureContext: true },
    document: doc,
    navigator: { hid },
    performance: { now: () => now },
    setInterval: (callback) => {
      tick = callback
      return 1
    },
    clearInterval: () => {},
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  unmount = mountGame(root)

  return {
    device,
    other,
    hid,
    select,
    click(name) {
      select(name).dispatchEvent(new Event("click"))
    },
    step(x, otherX = 0) {
      now += 15
      device.emit(0x30, packet(x))
      other.emit(0x30, packet(otherX))
      tick()
    },
    advance(ms) {
      now += ms
      tick()
    },
  }
}

function packet(x) {
  const bytes = new DataView(new ArrayBuffer(48))
  for (let i = 0; i < 3; i++) {
    bytes.setInt16(12 + i * 12, Array.isArray(x) ? x[i] : x, true)
    bytes.setInt16(16 + i * 12, 4096, true)
  }
  return bytes
}
