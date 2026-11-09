import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"

import { prepareOutput, validateAssets } from "./assets.mjs"
import { reconcile, validatePreviewResult, validateRun } from "./lifecycle.mjs"
import { previewName, target } from "./target.mjs"

const sha = "a".repeat(40)
const otherSha = "b".repeat(40)
const payload = [
  { path: "index.html", content: Buffer.from("<title>Test</title>").toString("base64") },
]

function scenario() {
  const calls = []
  const pr = {
    number: 1,
    state: "open",
    base: { ref: "main", repo: { full_name: target.repository } },
    head: { sha, ref: "feature", repo: { id: 2 } },
  }
  const run = {
    id: 10,
    repository: { id: 1, full_name: target.repository },
    path: target.workflowPath,
    name: "CI",
    status: "completed",
    conclusion: "success",
    head_sha: sha,
    event: "pull_request",
    head_repository: { id: 2 },
    head_branch: "feature",
  }
  const github = {
    pull: async () => structuredClone(pr),
    main: async () => sha,
    successfulRun: async () => structuredClone(run),
    artifact: async () => payload,
    comment: async (_number, body) => calls.push(["comment", body]),
  }
  const cloudflare = {
    deploy: async (_payload, name) => {
      calls.push(["deploy", name])
      return {
        preview_name: name,
        preview_urls: ["https://pr-1-joycon-motion-check.example.workers.dev"],
      }
    },
    remove: async (name) => calls.push(["remove", name]),
  }
  return { pr, run, github, cloudflare, calls }
}

describe("デプロイの信頼境界", () => {
  test.each([0, -1, 1.5, NaN, "1", Infinity])("正の整数でない PR 番号 %p は拒否する", (number) => {
    expect(() => previewName(number)).toThrow()
  })
  test.each([
    { conclusion: "failure" },
    { repository: { full_name: "other/repo" } },
    { path: ".github/workflows/other.yml" },
    { head_sha: otherSha },
    { head_repository: { id: 3 } },
    { event: "push" },
    { head_branch: "other" },
  ])("異なる出所や未成功 run %p は拒否する", (change) => {
    const { run, pr } = scenario()

    expect(() => validateRun({ ...run, ...change }, pr)).toThrow()
  })
  test("PR 成果物は本番へ昇格できない", () => {
    const { run } = scenario()

    expect(() => validateRun(run)).toThrow()
  })
  test.each([
    "../index.html",
    "/index.html",
    "a/../../index.html",
    ".env",
    "_worker.js",
    "cloudflare.config.ts",
    "a\\b.js",
  ])("禁止パス %s は拒否する", (path) => {
    expect(() => validateAssets([{ ...payload[0], path }])).toThrow()
  })
  test("重複パスと不正 base64 は拒否する", () => {
    expect(() => validateAssets([...payload, ...payload])).toThrow()
    expect(() => validateAssets([{ path: "index.html", content: "!invalid!" }])).toThrow()
  })
  test("未確認の Preview URL や別名は成功結果にしない", () => {
    expect(() =>
      validatePreviewResult(
        { preview_name: "pr-2", preview_urls: ["https://test.workers.dev"] },
        "pr-1",
      ),
    ).toThrow()
    expect(() =>
      validatePreviewResult(
        { preview_name: "pr-1", preview_urls: ["https://example.com"] },
        "pr-1",
      ),
    ).toThrow()
  })
  test("設定と preview フラグは信頼済み定数から作る", async () => {
    const directory = await mkdtemp("/tmp/joycon-output-test-")
    try {
      await prepareOutput(directory, payload, true)

      const root = JSON.parse(
        await readFile(`${directory}/.cloudflare/output/v0/config.json`, "utf8"),
      )
      const worker = JSON.parse(
        await readFile(
          `${directory}/.cloudflare/output/v0/workers/default/worker.config.json`,
          "utf8",
        ),
      )
      expect(root.accountId).toBe(target.accountId)
      expect(root.buildContext.isPreview).toBe(true)
      expect(worker.name).toBe(target.worker)
      expect(worker.bindings).toBeUndefined()
      expect(worker.domains).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("ライフサイクルの再照合", () => {
  test("最新 head の CI 成功で同じ PR 名を公開し SHA 付きコメントを残す", async () => {
    const fixture = scenario()

    const result = await reconcile({ ...fixture, number: 1 })

    expect(result).toBe("deployed")
    expect(fixture.calls[0]).toEqual(["deploy", "pr-1"])
    expect(fixture.calls[1][1]).toContain(sha)
  })
  test("closed は CI の成否に関係なく対象 preview のみ削除する", async () => {
    const fixture = scenario()
    fixture.pr.state = "closed"
    fixture.github.successfulRun = async () => {
      throw new Error("Must not read build")
    }

    await reconcile({ ...fixture, number: 1 })

    expect(fixture.calls[0]).toEqual(["remove", "pr-1"])
    expect(fixture.calls[1][1]).toContain("削除済み")
  })
  test("cleanup 失敗を削除済みとは表示しない", async () => {
    const fixture = scenario()
    fixture.pr.state = "closed"
    fixture.cloudflare.remove = async () => {
      throw new Error("403")
    }

    await expect(reconcile({ ...fixture, number: 1 })).rejects.toThrow("403")

    expect(fixture.calls[0][1]).toContain("確認待ち")
    expect(fixture.calls[0][1]).not.toContain("削除済み")
  })
  test("deploy 中の close は URL 投稿せず cleanup に収束する", async () => {
    const fixture = scenario()
    fixture.cloudflare.deploy = async () => {
      fixture.pr.state = "closed"
      return {}
    }

    const result = await reconcile({ ...fixture, number: 1 })

    expect(result).toBe("removed")
    expect(fixture.calls[0]).toEqual(["remove", "pr-1"])
    expect(fixture.calls.at(-1)[1]).not.toContain("https:")
  })
  test("cleanup 中の reopen は古い削除表示で上書きしない", async () => {
    const fixture = scenario()
    fixture.pr.state = "closed"
    fixture.cloudflare.remove = async () => {
      fixture.pr.state = "open"
    }

    const result = await reconcile({ ...fixture, number: 1 })

    expect(result).toBe("deployed")
    expect(fixture.calls.at(-1)[1]).toContain(sha)
  })
  test("成果物読取中に push されれば古い head を公開しない", async () => {
    const fixture = scenario()
    fixture.github.artifact = async () => {
      fixture.pr.head.sha = otherSha
      fixture.github.successfulRun = async () => undefined
      return payload
    }

    const result = await reconcile({ ...fixture, number: 1 })

    expect(result).toBe("waiting")
    expect(fixture.calls.some(([action]) => action === "deploy")).toBe(false)
  })
  test("本番は main の成功 push CI のみ公開する", async () => {
    const fixture = scenario()
    Object.assign(fixture.run, {
      event: "push",
      head_branch: "main",
      head_repository: { full_name: target.repository },
    })

    const result = await reconcile({ ...fixture, number: 0 })

    expect(result).toBe("deployed")
    expect(fixture.calls).toEqual([["deploy", undefined]])
  })
  test("古い main の CI は本番を巻き戻さない", async () => {
    const fixture = scenario()
    Object.assign(fixture.run, {
      event: "push",
      head_branch: "main",
      head_repository: { full_name: target.repository },
    })
    fixture.github.main = async () => otherSha

    await expect(reconcile({ ...fixture, number: 0 })).rejects.toThrow("Stale")

    expect(fixture.calls).toEqual([])
  })
})
