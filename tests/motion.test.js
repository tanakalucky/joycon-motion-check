import { describe, expect, test } from "bun:test"

import {
  classifyMotion,
  MotionProcessor,
  validateThresholds,
} from "../src/entities/motion/index.js"

describe("動きの強さ", () => {
  test("任意の向きで静止すると準備後に重力を除いて遅いになる", () => {
    const processor = new MotionProcessor()
    let result

    for (let index = 0; index < 240; index++)
      result = processor.push({ x: 0.6, y: 0, z: 0.8, time: index * 5 })

    expect(result.warming).toBe(false)
    expect(result.score).toBe(0)
    expect(result.level).toBe("slow")
  })
  test("最初の1秒は分類を出さない", () => {
    const processor = new MotionProcessor()

    const result = processor.push({ x: 0, y: 0, z: 1, time: 0 })

    expect(result.level).toBeNull()
    expect(result.warming).toBe(true)
  })
  test("重力に振動が加わるとRMSが上がり速いになる", () => {
    const processor = new MotionProcessor()
    let result

    for (let index = 0; index < 400; index++)
      result = processor.push({
        x: index < 200 ? 0 : Math.sin(index / 3) * 1.5,
        y: 0,
        z: 1,
        time: index * 5,
      })

    expect(result.score).toBeGreaterThan(0.55)
    expect(result.level).toBe("fast")
  })
  test("境界では上がり下降時は余裕を設ける", () => {
    const thresholds = { normal: 0.22, fast: 0.55 }

    const levels = [
      classifyMotion(0.22, thresholds),
      classifyMotion(0.55, thresholds),
      classifyMotion(0.54, thresholds, "fast"),
      classifyMotion(0.52, thresholds, "fast"),
      classifyMotion(0.19, thresholds, "normal"),
    ]

    expect(levels).toEqual(["normal", "fast", "fast", "normal", "slow"])
  })
  test("不正な境界と非有限値を受け付けない", () => {
    const processor = new MotionProcessor()

    const result = processor.push({ x: NaN, y: 0, z: 1, time: 0 })

    expect(result).toBeNull()
    expect(classifyMotion(Infinity)).toBeNull()
    expect(validateThresholds({ normal: 0.3, fast: 0.3 })).toBe(false)
    expect(validateThresholds({ normal: -1, fast: 0.5 })).toBe(false)
    expect(validateThresholds({ normal: 0.2, fast: 0.25 })).toBe(true)
  })
  test("受信中断後は以前の分類を消して準備をやり直す", () => {
    const processor = new MotionProcessor()
    for (let index = 0; index < 250; index++) processor.push({ x: 0, y: 0, z: 1, time: index * 5 })

    const result = processor.push({ x: 1, y: 0, z: 0, time: 3000 })

    expect(result.warming).toBe(true)
    expect(result.level).toBeNull()
    expect(result.score).toBe(0)
  })
  test("時刻が逆戻りしたサンプルは処理しない", () => {
    const processor = new MotionProcessor()
    processor.push({ x: 0, y: 0, z: 1, time: 10 })

    const result = processor.push({ x: 2, y: 0, z: 1, time: 5 })

    expect(result).toBeNull()
  })
})
