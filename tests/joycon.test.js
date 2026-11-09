import { describe, expect, test } from "bun:test"

import { parseReport, supportMessage } from "../src/entities/joycon/index.js"
import { fixture } from "./helpers/fake-hid.js"

describe("Joy-Conの限定WebHID接続", () => {
  test("非対応または非セキュア環境では機器選択を開始しない", async () => {
    const { session, states } = fixture()
    session.secure = false

    await session.connect()

    expect(states.at(-1)[0]).toBe("error")
    expect(supportMessage(true, null)).toContain("非対応")
    expect(session.session).toBeNull()
  })
  test("IMUと標準モードのみを設定し3サンプルを受け取る", async () => {
    const { session, device, packets, states } = fixture()

    await session.connect()
    device.emit(0x30, new DataView(new ArrayBuffer(48)))

    expect(device.reports.map(([id, bytes]) => [id, bytes[9], bytes[10]])).toEqual([
      [1, 0x40, 1],
      [1, 3, 0x30],
    ])
    expect(states.at(-1)[0]).toBe("connected")
    expect(packets[0][0].map((sample) => sample.time)).toEqual([90, 95, 100])
    await session.dispose()
  })
  test("DataViewのオフセットを保って符号付き3軸をgへ換算する", () => {
    const report = new DataView(new ArrayBuffer(60), 8, 48)
    report.setInt16(12, -4096, true)
    report.setInt16(14, 2048, true)
    report.setInt16(16, 4096, true)
    report.setInt16(24, 1000, true)
    report.setInt16(36, -1000, true)

    const samples = parseReport(0x30, report, 30)

    expect(samples[0]).toEqual({ x: -0.999424, y: 0.499712, z: 0.999424, time: 20 })
    expect(samples[1].x).toBe(0.244)
    expect(samples[2].x).toBe(-0.244)
  })
  test("短いレポートと別のレポートIDは捨てる", () => {
    const short = new DataView(new ArrayBuffer(47))

    const parsed = parseReport(0x30, short, 1)

    expect(parsed).toBeNull()
    expect(parseReport(0x21, new DataView(new ArrayBuffer(48)), 1)).toBeNull()
  })
  test("選択キャンセルは接続エラーにしない", async () => {
    const { hid, session, states } = fixture()
    hid.requestDevice = async () => []

    await session.connect()

    expect(states.at(-1)[0]).toBe("disconnected")
  })
  test("対象外機器は開かない", async () => {
    const { session, device, states } = fixture()
    device.productId = 0x2009

    await session.connect()

    expect(device.opened).toBe(false)
    expect(states.at(-1)[0]).toBe("error")
  })
  test("選択待ちのキャンセル後に機器が返っても開かない", async () => {
    const { hid, session, device, states } = fixture()
    let choose
    hid.requestDevice = () =>
      new Promise((resolve) => {
        choose = resolve
      })
    const connecting = session.connect()

    await session.disconnect()
    choose([device])
    await connecting

    expect(device.opened).toBe(false)
    expect(states.at(-1)[0]).toBe("disconnected")
    expect(session.session).toBeNull()
  })
  test("open待ちでキャンセルしても完了後に閉じる", async () => {
    const { session, device } = fixture()
    let opened
    device.open = () =>
      new Promise((resolve) => {
        opened = () => {
          device.opened = true
          resolve()
        }
      })
    const connecting = session.connect()
    await Promise.resolve()

    await session.disconnect()
    opened()
    await connecting

    expect(device.opened).toBe(false)
    expect(device.reports).toHaveLength(0)
  })
  test("ACKが来ない場合はタイムアウトして機器を閉じる", async () => {
    const { session, device, states } = fixture()
    device.autoAck = false

    await session.connect()

    expect(states.at(-1)[0]).toBe("error")
    expect(device.opened).toBe(false)
  })
  test("送信失敗では機器を閉じエラーを表示する", async () => {
    const { session, device, states } = fixture()
    device.failSend = true

    await session.connect()

    expect(device.opened).toBe(false)
    expect(states.at(-1)[0]).toBe("error")
  })
  test("再接続を繰り返してもイベントを重複受信しない", async () => {
    const { session, device, packets } = fixture()
    await session.connect()
    await session.disconnect()
    await session.connect()

    device.emit(0x30, new DataView(new ArrayBuffer(48)))
    await session.disconnect()
    device.emit(0x30, new DataView(new ArrayBuffer(48)))

    expect(packets).toHaveLength(1)
    expect(device.opened).toBe(false)
  })
  test("OSからの切断通知で対象機器を閉じる", async () => {
    const { hid, session, device, states } = fixture()
    await session.connect()
    const event = new Event("disconnect")
    event.device = device

    hid.dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()

    expect(device.opened).toBe(false)
    expect(states.at(-1)[0]).toBe("disconnected")
  })
})
