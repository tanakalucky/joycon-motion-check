import { afterEach, expect, test } from "bun:test"

import { createCloudflare, createGitHub } from "./adapters.mjs"
import { target } from "./target.mjs"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
const pr = {
  number: 1,
  state: "open",
  head: { sha: "a".repeat(40) },
  base: { ref: "main", repo: { full_name: target.repository } },
}
const owned = { id: 15, body: `${target.marker}\nold`, user: { id: target.botId, type: "Bot" } }
const json = (value) => new Response(JSON.stringify(value), { status: 200 })

test("コメントの全ページを読み、他者の同じマーカーを変更しない", async () => {
  const writes = []
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/pulls/1")) return json(pr)
    if (options.method) {
      writes.push([url, options])
      return json({})
    }
    if (url.endsWith("&page=1"))
      return json(
        Array.from({ length: 100 }, (_, id) => ({ ...owned, id, user: { id: 999, type: "User" } })),
      )
    return json([owned])
  }

  await createGitHub("fake").comment(1, `${target.marker}\nnew`, pr.head.sha)

  expect(writes.length).toBe(1)
  expect(writes[0][0]).toEndWith("/issues/comments/15")
  expect(writes[0][1].method).toBe("PATCH")
})

test("投稿応答不明でも読み戻しで保存済みなら重複 POST しない", async () => {
  let stored
  let posts = 0
  const body = `${target.marker}\nnew`
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/pulls/1")) return json(pr)
    if (options.method === "POST") {
      posts++
      stored = { ...owned, body }
      throw new Error("Lost response")
    }
    return json(stored ? [stored] : [])
  }

  await createGitHub("fake").comment(1, body, pr.head.sha)

  expect(posts).toBe(1)
})

test("既存専用コメントが重複していれば自動で追加・変更しない", async () => {
  let writes = 0
  globalThis.fetch = async (url, options = {}) => {
    if (options.method) writes++
    return json(url.endsWith("/pulls/1") ? pr : [owned, { ...owned, id: 16 }])
  }

  await expect(createGitHub("fake").comment(1, "new", pr.head.sha)).rejects.toThrow("Duplicate")

  expect(writes).toBe(0)
})

test("コメント投稿直前の新 head には古い URL を表示しない", async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return json({ ...pr, head: { sha: "b".repeat(40) } })
  }

  await expect(createGitHub("fake").comment(1, "old", pr.head.sha)).rejects.toThrow("changed")

  expect(calls).toBe(1)
})

test("preview の 404 は削除済みとして扱い、対象以外へアクセスしない", async () => {
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(url)
    return new Response("", { status: 404 })
  }

  await createCloudflare("fake").remove("pr-1")

  expect(urls).toEqual([
    `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/workers/${target.worker}/previews/pr-1`,
  ])
})

test("preview の認証・権限エラーは削除成功にしない", async () => {
  globalThis.fetch = async () => new Response("", { status: 403 })

  await expect(createCloudflare("fake").remove("pr-1")).rejects.toThrow("403")
})

test("別の preview 名が返れば削除しない", async () => {
  globalThis.fetch = async () => json({ success: true, result: { name: "pr-2" } })

  await expect(createCloudflare("fake").remove("pr-1")).rejects.toThrow("ownership")
})
