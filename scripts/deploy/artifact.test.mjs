import { afterEach, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"

import { createGitHub } from "./adapters.mjs"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
const sha = "a".repeat(40)
const run = { id: 10, head_sha: sha, repository: { id: 1 } }
const artifact = {
  id: 20,
  name: "static-site",
  expired: false,
  size_in_bytes: 200,
  workflow_run: { id: 10, head_sha: sha, repository_id: 1 },
}
const site = [{ path: "index.html", content: "aGk=" }]

function archive(kind = "valid") {
  return execFileSync("python3", [
    "-c",
    `import io,zipfile,sys,json,stat
b=io.BytesIO()
with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED) as z:
 i=zipfile.ZipInfo('site.json'); i.external_attr=((stat.S_IFLNK if sys.argv[1]=='symlink' else stat.S_IFREG)|0o644)<<16
 content=json.dumps([{'path':'index.html','content':'aGk='}]).encode()
 if sys.argv[1]=='large': content=b' '*(30*1024*1024+1)
 z.writestr(i,content,compress_type=zipfile.ZIP_DEFLATED)
 if sys.argv[1]=='extra': z.writestr('../extra.txt','bad')
sys.stdout.buffer.write(b.getvalue())`,
    kind,
  ])
}

function fakeArtifacts(pages, zip = archive()) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(String(url))
    if (String(url).includes("/artifacts?"))
      return Response.json({
        artifacts: pages[Number(new URL(url).searchParams.get("page")) - 1] ?? [],
      })
    if (String(url).endsWith("/zip"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://artifact.example/site.zip" },
      })
    expect(options?.headers?.Authorization).toBeUndefined()
    return new Response(zip)
  }
  return calls
}

test.each([
  { workflow_run: { ...artifact.workflow_run, id: 11 } },
  { workflow_run: { ...artifact.workflow_run, repository_id: 2 } },
  { workflow_run: { ...artifact.workflow_run, head_sha: "b".repeat(40) } },
  { size_in_bytes: 30 * 1024 * 1024 + 1 },
])("artifact の run/repo/head/容量が不一致なら download 前に拒否する: %p", async (change) => {
  const calls = fakeArtifacts([[{ ...artifact, ...change }]])

  await expect(createGitHub("fake").artifact(run)).rejects.toThrow("mismatch")

  expect(calls).toHaveLength(1)
})

test.each([[[artifact, { ...artifact, id: 21 }]], [[{ ...artifact, expired: true }]]])(
  "重複または期限切れ artifact は拒否する: %p",
  async (entries) => {
    fakeArtifacts([entries])

    await expect(createGitHub("fake").artifact(run)).rejects.toThrow("exactly one")
  },
)

test("全ページから一つの有効 artifact を読み、署名付き URL に token を渡さない", async () => {
  const calls = fakeArtifacts([
    Array.from({ length: 100 }, (_, id) => ({ ...artifact, id, name: "other" })),
    [artifact],
  ])

  const result = await createGitHub("fake").artifact(run)

  expect(result).toEqual(site)
  expect(calls.filter((url) => url.includes("/artifacts?"))).toHaveLength(2)
})

test.each(["extra", "symlink", "large"])(
  "ZIP の余分な entry / 非通常ファイル / 展開容量超過を拒否する: %s",
  async (kind) => {
    fakeArtifacts([[artifact]], archive(kind))

    await expect(createGitHub("fake").artifact(run)).rejects.toThrow()
  },
)

test("download 本文が上限を超えた場合は ZIP 解析前に拒否する", async () => {
  fakeArtifacts([[artifact]], new Uint8Array(30 * 1024 * 1024 + 1))

  await expect(createGitHub("fake").artifact(run)).rejects.toThrow("download limit")
})
