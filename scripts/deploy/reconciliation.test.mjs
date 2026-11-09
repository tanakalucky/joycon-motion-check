import { afterEach, expect, test } from "bun:test"

import { createGitHub } from "./adapters.mjs"
import { reconcile } from "./lifecycle.mjs"
import { resolveTarget } from "./resolve.mjs"
import { target } from "./target.mjs"
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
const sha = "a".repeat(40),
  newSha = "b".repeat(40)

test.each([false, true])(
  "遅れた古い CI / 同 SHA の失敗通知でも現在の成功 CI を公開する: %p",
  async (sameSha) => {
    const currentSha = sameSha ? sha : newSha
    const pr = {
      number: 7,
      state: "open",
      base: { ref: "main", repo: { full_name: target.repository } },
      head: { sha: currentSha, ref: "feature", repo: { id: 2 } },
    }
    const old = {
      id: 10,
      name: "CI",
      path: target.workflowPath,
      status: "completed",
      conclusion: "failure",
      event: "pull_request",
      head_sha: sha,
      head_branch: "feature",
      head_repository: { id: 2 },
      repository: { id: 1, full_name: target.repository },
      pull_requests: [{ number: 7 }],
    }
    const success = { ...old, id: 11, conclusion: "success", head_sha: currentSha }
    const comments = []
    globalThis.fetch = async (url, options = {}) => {
      if (url.endsWith("/actions/runs/10")) return Response.json(old)
      if (url.endsWith("/pulls/7")) return Response.json(pr)
      if (url.includes("/actions/workflows/")) {
        expect(url).toContain(`head_sha=${currentSha}`)
        return Response.json({ workflow_runs: [success] })
      }
      if (options.method) {
        comments.push(JSON.parse(options.body).body)
        return Response.json({})
      }
      if (url.includes("/comments?")) return Response.json([])
      throw new Error(`Unexpected URL: ${url}`)
    }
    const github = createGitHub("fake")
    const deployed = []
    github.artifact = async (run) => {
      expect(run.id).toBe(11)
      return []
    }

    const number = await github.resolveNumber(10)
    await reconcile({
      github,
      number,
      cloudflare: {
        deploy: async (_payload, name, commit) => {
          deployed.push(commit)
          return { preview_name: name, preview_urls: ["https://pr-7.example.workers.dev"] }
        },
      },
    })

    expect(deployed).toEqual([currentSha])
    expect(comments).toHaveLength(1)
    expect(comments[0]).toContain(currentSha)
    expect(comments[0]).not.toContain("更新待ち")
  },
)

test("異なる PR と本番は別の正規化キーになり、不正入力は拒否する", async () => {
  const github = { resolveNumber: async () => 8 }

  const first = await resolveTarget(
    "pull_request_target",
    { action: "closed", pull_request: { number: 7 } },
    "",
    github,
  )
  const second = await resolveTarget("workflow_run", { workflow_run: { id: 10 } }, "", github)
  const production = await resolveTarget(
    "workflow_dispatch",
    { inputs: { pr: "0" } },
    "refs/heads/main",
    github,
  )

  expect([first.key, second.key, production.key]).toEqual(["pr-7", "pr-8", "production"])
  await expect(
    resolveTarget("workflow_dispatch", { inputs: { pr: "1;echo bad" } }, "refs/heads/main", github),
  ).rejects.toThrow()
})

test("削除表示の判定は文言ではなく明示された closed 状態を使う", async () => {
  const pr = {
    number: 1,
    state: "open",
    head: { sha },
    base: { ref: "main", repo: { full_name: target.repository } },
  }
  globalThis.fetch = async () => Response.json(pr)

  await expect(createGitHub("fake").comment(1, "Removed", undefined, "closed")).rejects.toThrow(
    "state",
  )
})
