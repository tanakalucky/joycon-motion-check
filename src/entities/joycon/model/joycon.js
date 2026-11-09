/* Protocol adapted from joy-con-webhid (Apache-2.0), Thomas Steiner and contributors.
 * Reference: 103d33214f0e530019006ea81e696ae1552a1a5e, src/joycon.ts and src/parse.ts.
 * Changed: limited Bluetooth IMU adapter, acknowledged commands, scoped lifecycle,
 * DataView offsets, and individual approximate-g samples. See /third-party.txt.
 */
export class JoyConSession {
  constructor({
    hid,
    secure = true,
    onState,
    onPacket,
    now = () => performance.now(),
    timeout = 2000,
  }) {
    Object.assign(this, { hid, secure, onState, onPacket, now, timeout })
    this.session = null
    this.busy = false
    this.disposed = false
  }

  async connect() {
    if (this.busy || this.session || this.disposed) return
    const unsupported = supportMessage(this.secure, this.hid)
    if (unsupported) {
      this.onState("error", unsupported)
      return
    }
    this.busy = true
    const session = { cancelled: false, device: null, sequence: 0, pending: null, lastTime: null }
    this.session = session
    this.onState("connecting", "Joy-Conを選択してください。")
    try {
      const devices = await this.hid.requestDevice({
        filters: [
          { vendorId: 0x057e, productId: 0x2006 },
          { vendorId: 0x057e, productId: 0x2007 },
        ],
      })
      if (session.cancelled) return
      if (!devices.length) {
        this.onState("disconnected", "選択をキャンセルしました。")
        return
      }
      const device = devices[0]
      if (!isJoyCon(device)) throw new Error("初代Joy-Con L / Rを選択してください。")
      session.device = device
      session.input = (event) => this.receive(session, event)
      session.disconnect = (event) => {
        if (event.device === device) void this.disconnect("Joy-Conとの接続が切れました。")
      }
      this.hid.addEventListener("disconnect", session.disconnect)
      device.addEventListener("inputreport", session.input)
      await device.open()
      if (session.cancelled) return
      await this.command(session, 0x40, 0x01)
      await this.command(session, 0x03, 0x30)
      if (session.cancelled) return
      session.ready = true
      this.onState("connected", device.productId === 0x2006 ? "Joy-Con (L)" : "Joy-Con (R)")
    } catch (error) {
      if (!session.cancelled)
        this.onState(
          error.name === "NotFoundError" ? "disconnected" : "error",
          error.name === "NotFoundError"
            ? "選択をキャンセルしました。"
            : `接続できませんでした。OSのBluetooth接続と他のアプリを確認してください。${error.message ? " " + error.message : ""}`,
        )
    } finally {
      if (!session.ready || session.cancelled) {
        await this.cleanup(session)
        if (this.session === session) this.session = null
      }
      this.busy = false
      if (session.cancelled && !this.disposed) this.onState("disconnected", "接続を終了しました。")
    }
  }

  async disconnect(message = "切断しました。") {
    const session = this.session
    if (session) {
      session.cancelled = true
      session.ready = false
      session.pending?.reject(new Error("接続をキャンセルしました。"))
      await this.cleanup(session)
      // Keep a pending chooser/open locked until its own finally closes the device.
      if (!this.busy && this.session === session) this.session = null
    }
    if (!this.disposed)
      this.onState(
        this.busy ? "cancelling" : "disconnected",
        this.busy
          ? "接続を終了しています。機器の選択画面が開いている場合は閉じてください。"
          : message,
      )
  }

  async dispose() {
    this.disposed = true
    await this.disconnect()
  }

  receive(session, event) {
    if (session.cancelled || this.session !== session || event.device !== session.device) return
    const { reportId, data } = event
    if (
      reportId === 0x21 &&
      data.byteLength >= 14 &&
      session.pending &&
      data.getUint8(13) === session.pending.id
    ) {
      if (data.getUint8(12) & 0x80) session.pending.resolve()
      else session.pending.reject(new Error("Joy-Conが設定コマンドを拒否しました。"))
    }
    if (!session.ready) return
    const arrival = this.now()
    const samples = parseReport(reportId, data, arrival)
    if (!samples) return
    // Keep intra-packet spacing even when the host batches Bluetooth events.
    const end = Math.max(arrival, (session.lastTime ?? -Infinity) + 15)
    samples.forEach((sample, index) => {
      sample.time = end - (2 - index) * 5
    })
    session.lastTime = end
    this.onPacket(samples, arrival)
  }

  async command(session, id, value) {
    if (session.cancelled) throw new Error("Cancelled")
    let timer
    const response = new Promise((resolve, reject) => {
      session.pending = { id, resolve, reject }
      timer = setTimeout(() => reject(new Error("Joy-Conから応答がありません。")), this.timeout)
    })
    const payload = new Uint8Array([
      session.sequence++ & 15,
      0,
      1,
      0x40,
      0x40,
      0,
      1,
      0x40,
      0x40,
      id,
      value,
    ])
    try {
      await Promise.all([session.device.sendReport(0x01, payload), response])
    } finally {
      clearTimeout(timer)
      session.pending = null
    }
  }

  async cleanup(session) {
    if (!session.device) return
    session.device.removeEventListener("inputreport", session.input)
    this.hid.removeEventListener("disconnect", session.disconnect)
    if (session.device.opened) {
      try {
        await session.device.close()
      } catch {
        /* A physically disconnected device may already be closed. */
      }
    }
  }
}

export function supportMessage(secure, hid) {
  if (!secure) return "HTTPSまたはlocalhostで開いてください。"
  if (!hid?.requestDevice) return "WebHID非対応です。PC版Chrome / Edgeで開いてください。"
  return ""
}

export function isJoyCon(device) {
  return device?.vendorId === 0x057e && [0x2006, 0x2007].includes(device.productId)
}

export function parseReport(reportId, data, time) {
  if (
    reportId !== 0x30 ||
    !(data instanceof DataView) ||
    data.byteLength < 48 ||
    !Number.isFinite(time)
  )
    return null
  return Array.from({ length: 3 }, (_, index) => ({
    x: data.getInt16(12 + index * 12, true) * 0.000244,
    y: data.getInt16(14 + index * 12, true) * 0.000244,
    z: data.getInt16(16 + index * 12, true) * 0.000244,
    time: time - (2 - index) * 5,
  }))
}
