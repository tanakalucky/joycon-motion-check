import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import config from "../../cloudflare.config.ts"
import { prepareOutput } from "./assets.mjs"

test("宣言設定では本番 URL と preview URL の両方を有効にする", () => {
  const worker = config.worker

  expect(worker.workersDev).toBe(true)
  expect(worker.previewUrls).toBe(true)
})

test.each([false, true])(
  "本番・preview の生成設定は preview URL を無効化せず宣言設定と一致する: isPreview=%p",
  async (isPreview) => {
    const directory = await mkdtemp(join(tmpdir(), "joycon-config-test-"))
    const payload = [{ path: "index.html", content: "aGk=" }]
    try {
      await prepareOutput(directory, payload, isPreview)
      const output = join(directory, ".cloudflare/output/v0")
      const buildConfig = JSON.parse(await readFile(join(output, "config.json"), "utf8"))
      const workerConfig = JSON.parse(
        await readFile(join(output, "workers/default/worker.config.json"), "utf8"),
      )

      expect(buildConfig).toEqual({
        accountId: config.accountId,
        buildContext: { isPreview, mode: "production" },
      })
      expect(workerConfig.previewUrls).toBe(true)
      expect(workerConfig).toEqual(config.worker)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
