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

test("4台の同じ型のJoy-Conを区別し、赤の減点と切断を他のプレイヤーに適用しない", async () => {
  const { hid, roster, emit, click, select } = mountFixture()
  let chosen = 0
  hid.requestDevice = async () => [roster[chosen++]]
  for (const _ of roster) {
    click("connect")
    await Bun.sleep(1)
  }
  for (let i = 0; i < 70; i++) emit([0, 0, 0, 0])
  click("start")
  expect(select("connect").disabled).toBe(true)
  expect(roster.every((device) => device.opened)).toBe(true)

  for (let i = 0; i < 214; i++) {
    const sign = i % 2 ? 1 : -1
    emit([2500 * sign, 1000 * sign, 0, 1600 * sign])
  }
  for (let i = 0; i < 16; i++) emit([0, 0, 0, 0])
  const snapshot = roster.map((_, index) => select("progress", index).value)
  expect(snapshot[0]).toBeGreaterThan(snapshot[1])
  expect(snapshot[2]).toBe(0)
  emit([[0, 3000, 0], 0, 0, 0])
  expect(select("progress", 0).value).toBeCloseTo(snapshot[0] - 0.08)
  expect(select("progress", 1).value).toBe(snapshot[1])
  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device: roster[0] }))
  await Bun.sleep(1)
  for (let i = 0; i < 400; i++) emit([null, 0, 0, i % 2 ? 3500 : -3500])

  expect(select("signal").textContent).toBe("プレイヤー 4 の勝ち！")
  expect(select("progress", 0).value).toBeCloseTo(snapshot[0] - 0.08)
  expect(select("progress", 3).value).toBe(1)
  click("reset")
  expect(select("progress", 3).value).toBe(0)
  expect(select("connect").disabled).toBe(false)
  click("start")
  for (let i = 0; i < 20; i++) emit([null, 0, 0, i % 2 ? 3500 : -3500])
  expect(select("signal").dataset.phase).toBe("green")
  expect(select("progress", 3).value).toBeGreaterThan(0)
})

test("ロビーで切断処理中の機器を参加させず、処理中は別の選択も始めない", async () => {
  const { roster, hid, click, select, emit } = mountFixture()
  let chosen = 0
  hid.requestDevice = async () => [roster[chosen++]]
  for (let i = 0; i < 2; i++) {
    click("connect")
    await Bun.sleep(1)
  }
  for (let i = 0; i < 70; i++) emit([0, 0])
  const closed = deferClose(roster[0])

  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device: roster[0] }))
  click("start")
  click("connect")

  expect(select("start").disabled).toBe(true)
  expect(select("signal").dataset.phase).toBe("ready")
  expect(chosen).toBe(2)
  closed.resolve()
  await Bun.sleep(1)
  expect(select("start").disabled).toBe(false)
})

test("受信が新しくても切断を開始した選手は止まり他の選手は進む", async () => {
  const fixture = await startTwo()
  const { roster, hid, emit, select } = fixture
  for (let i = 0; i < 25; i++) emit([i % 2 ? 2700 : -2700, 0])
  const before = select("progress").value
  const closed = deferClose(roster[0])

  hid.dispatchEvent(Object.assign(new Event("disconnect"), { device: roster[0] }))
  for (let i = 0; i < 20; i++) emit([null, i % 2 ? 3000 : -3000])

  expect(select("progress").value).toBe(before)
  expect(select("progress", 1).value).toBeGreaterThan(0)
  expect(roster[0].opened).toBe(true)
  closed.resolve()
  await Bun.sleep(1)
})

test("受信停止で1台だけ止まり再準備後に停止分を取り戻さず再開する", async () => {
  const { roster, emit, select } = await startTwo()
  for (let i = 0; i < 10; i++) emit([0, i % 2 ? 2700 : -2700])
  for (let i = 0; i < 36; i++) emit([null, i % 2 ? 2700 : -2700])
  const otherBefore = select("progress", 1).value

  for (let i = 0; i < 67; i++) emit([i % 2 ? 3000 : -3000, i % 2 ? 2700 : -2700])

  expect(roster[0].opened).toBe(true)
  expect(select("progress").value).toBe(0)
  expect(select("progress", 1).value).toBeGreaterThan(otherBefore)
  emit([-3000, 0])
  expect(select("progress").value).toBeGreaterThan(0)
})

async function startTwo() {
  const fixture = mountFixture()
  const { hid, roster, click, emit } = fixture
  let chosen = 0
  hid.requestDevice = async () => [roster[chosen++]]
  for (let i = 0; i < 2; i++) {
    click("connect")
    await Bun.sleep(1)
  }
  for (let i = 0; i < 70; i++) emit([0, 0])
  click("start")
  return fixture
}

function deferClose(device) {
  const gate = Promise.withResolvers()
  device.close = async () => {
    await gate.promise
    device.opened = false
  }
  return gate
}

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
  doc.createElement = fakeElement
  let now = 100
  let tick
  const root = fakeElement()
  const select = (name, index = 0) =>
    ["progress", "strength", "runner", "connection"].includes(name)
      ? root.querySelector("#game-players").children[index]?.querySelector(`[data-field="${name}"]`)
      : root.querySelector(`#game-${name}`)
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
  const roster = [device, other, new FakeDevice(), new FakeDevice()]
  unmount = mountGame(root)

  function emit(values) {
    now += 15
    values.forEach((value, index) => {
      if (value !== null) roster[index].emit(0x30, packet(value))
    })
    tick()
  }

  return {
    device,
    other,
    roster,
    emit,
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

function fakeElement() {
  const children = []
  const elements = new Map()
  return Object.assign(new EventTarget(), {
    style: {},
    dataset: {},
    children,
    append(child) {
      children.push(child)
    },
    setAttribute() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, fakeElement())
      return elements.get(selector)
    },
  })
}

function packet(x) {
  const bytes = new DataView(new ArrayBuffer(48))
  for (let i = 0; i < 3; i++) {
    bytes.setInt16(12 + i * 12, Array.isArray(x) ? x[i] : x, true)
    bytes.setInt16(16 + i * 12, 4096, true)
  }
  return bytes
}
