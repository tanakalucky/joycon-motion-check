import { JoyConSession } from "../../src/entities/joycon/index.js"

export class FakeDevice extends EventTarget {
  vendorId = 0x057e
  productId = 0x2006
  opened = false
  reports = []
  autoAck = true
  async open() {
    this.opened = true
  }
  async close() {
    this.opened = false
  }
  async sendReport(id, payload) {
    this.reports.push([id, [...payload]])
    if (this.failSend) throw new Error("送信失敗")
    if (this.autoAck) {
      const ack = new DataView(new ArrayBuffer(14))
      ack.setUint8(12, 0x80)
      ack.setUint8(13, payload[9])
      this.emit(0x21, ack)
    }
  }
  emit(reportId, data) {
    const event = new Event("inputreport")
    Object.assign(event, { device: this, reportId, data })
    this.dispatchEvent(event)
  }
}

export function fixture(device = new FakeDevice()) {
  const hid = new EventTarget()
  const states = []
  const packets = []
  hid.requestDevice = async () => [device]
  const session = new JoyConSession({
    hid,
    onState: (...state) => states.push(state),
    onPacket: (...packet) => packets.push(packet),
    now: () => 100,
    timeout: 15,
  })
  return { hid, states, packets, session, device }
}
