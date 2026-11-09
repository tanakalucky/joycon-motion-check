import { expect, test } from "bun:test"

import { createCloudflare } from "./adapters.mjs"
import { validatePreviewResult } from "./lifecycle.mjs"

const payload = [{ path: "index.html", content: "aGk=" }]
const sha = "a".repeat(40)

test.each(["", " \n", "Deploy complete\n"])(
  "本番 CLI が正常終了すれば stdout が JSON でなくても完了する: %p",
  async (stdout) => {
    const calls = []
    const cloudflare = createCloudflare("fake", (_executable, args) => {
      calls.push(args.slice(1))
      return Buffer.from(stdout)
    })

    const result = await cloudflare.deploy(payload, undefined, sha)

    expect(result).toBeUndefined()
    expect(calls).toEqual([["deploy", "--prebuilt", "--mode", "production", "--message", sha]])
  },
)

test.each([undefined, "pr-1"])(
  "CLI の異常終了は本番・preview とも失敗として伝える: %p",
  async (name) => {
    const failure = new Error("CLI exited with status 1")
    const cloudflare = createCloudflare("fake", () => {
      throw failure
    })

    await expect(cloudflare.deploy(payload, name, sha)).rejects.toBe(failure)
  },
)

test.each(["", " \n", "Deploy complete\n"])(
  "preview の空または JSON でない stdout は拒否する: %p",
  async (stdout) => {
    const cloudflare = createCloudflare("fake", () => Buffer.from(stdout))

    await expect(cloudflare.deploy(payload, "pr-1", sha)).rejects.toThrow()
  },
)

test("preview の構造化結果を返し、URL と対象名の検証を維持する", async () => {
  const preview = { preview_name: "pr-1", preview_urls: ["https://pr-1.example.workers.dev"] }
  const cloudflare = createCloudflare("fake", () => Buffer.from(JSON.stringify(preview)))

  const result = await cloudflare.deploy(payload, "pr-1", sha)

  expect(result).toEqual(preview)
  expect(validatePreviewResult(result, "pr-1")).toBe("https://pr-1.example.workers.dev/")
  expect(() => validatePreviewResult(result, "pr-2")).toThrow()
  expect(() => validatePreviewResult({ preview_name: "pr-1" }, "pr-1")).toThrow()
})
