import { expect, test } from "bun:test"

import { MotionProcessor } from "../src/entities/motion/index.js"
import { Race } from "../src/pages/game/model/game.js"

test("静止時に進まず3軸のどの揺れでも青信号で進む", () => {
  const distances = [null, "x", "y", "z"].map((axis) => distance(axis, 0.5))

  expect(distances[0]).toBe(0)
  for (const progress of distances.slice(1)) expect(progress).toBeGreaterThan(0)
})

test("揺れを大きくすると同じ時間でも青信号で遠くへ進む", () => {
  expect(distance("x", 0.6)).toBeGreaterThan(distance("x", 0.25))
})

test("赤信号では青信号中の平均値で減点せず赤信号中の動きに一度だけ減点する", () => {
  const race = new Race()
  race.start([1])
  for (let i = 0; i < 32; i++) race.advance(100, new Map([[1, 0.4]]))
  const before = race.players.get(1)?.progress

  for (let i = 0; i < 4; i++) race.advance(100, new Map([[1, 0.4]]))
  race.observeRed(1, { x: 0, y: 0, z: 1 })
  expect(race.phase).toBe("red")
  expect(race.players.get(1)?.progress).toBe(before)
  for (const x of [0.5, -0.5, 0.5, -0.5]) race.observeRed(1, { x, y: 0, z: 1 })

  expect(race.players.get(1)?.progress).toBeCloseTo(before - 0.08)
})

test("赤信号中に少しずつ姿勢を変えても合計の変化で一度減点する", () => {
  const race = new Race()
  race.start([1])
  for (let i = 0; i < 34; i++) race.advance(100, new Map([[1, 0.4]]))
  const before = race.players.get(1)?.progress
  race.observeRed(1, { x: 0, y: 0, z: 1 })

  for (let i = 1; i <= 40; i++) {
    const angle = (i * Math.PI) / 80
    race.observeRed(1, { x: Math.sin(angle), y: 0, z: Math.cos(angle) })
    race.advance(5, new Map([[1, 0]]))
  }

  expect(race.players.get(1)?.progress).toBeCloseTo(before - 0.08)
})

test("ゴール後は位置を保ちリセットでスタートに戻る", () => {
  const race = new Race()
  race.start([1])
  for (let i = 0; i < 100; i++) race.advance(100, new Map([[1, 1]]))

  expect(race.phase).toBe("won")
  expect(race.players.get(1)?.progress).toBe(1)
  race.reset()
  expect(race.phase).toBe("ready")
  expect(race.players.size).toBe(0)
})

test("同じフレームでも先にゴールに届く選手が勝つ", () => {
  const race = new Race()
  race.start([1, 2])
  race.players.get(1).progress = 0.98
  race.players.get(2).progress = 0.99

  race.advance(
    100,
    new Map([
      [1, 1],
      [2, 1],
    ]),
  )

  expect(race.winner).toBe(2)
  expect(race.players.get(1).progress).toBeCloseTo(0.99)
})

function distance(axis, amplitude) {
  const motion = new MotionProcessor()
  const race = new Race()
  race.start([1])
  for (let i = 0; i < 400; i++) {
    const sample = { x: 0, y: 0, z: 1, time: i * 5 }
    if (axis && i >= 200) sample[axis] += amplitude * Math.sin(i / 10)
    const reading = motion.push(sample)
    if (!reading.warming) race.advance(5, new Map([[1, reading.score]]))
  }
  return race.players.get(1)?.progress
}
