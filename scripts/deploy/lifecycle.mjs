import { previewName, target } from "./target.mjs"

export async function reconcile({ github, cloudflare, number }) {
  if (number === 0) return deployProduction(github, cloudflare)
  const name = previewName(number)
  for (let attempt = 0; attempt < 3; attempt++) {
    const pr = await github.pull(number)
    validatePull(pr, number)
    if (pr.state === "closed") {
      try {
        await cloudflare.remove(name)
      } catch (error) {
        await github
          .comment(number, `${target.marker}\nPreview 削除の確認待ちです。`, undefined, "closed")
          .catch(() => {})
        throw error
      }
      const latest = await github.pull(number)
      if (latest.state !== "closed") continue
      await github.comment(
        number,
        `${target.marker}\nPreview は削除済みです。`,
        undefined,
        "closed",
      )
      return "removed"
    }
    const run = await github.successfulRun(pr)
    if (!run) {
      await github.comment(number, `${target.marker}\n最新コミットの CI / Preview 更新待ちです。`)
      return "waiting"
    }
    validateRun(run, pr)
    const payload = await github.artifact(run)
    const before = await github.pull(number)
    if (before.state !== "open" || before.head.sha !== run.head_sha) {
      continue
    }
    let result
    try {
      result = await cloudflare.deploy(payload, name, run.head_sha)
    } catch (error) {
      await github
        .comment(number, `${target.marker}\nPreview 更新に失敗しました。再照合が必要です。`)
        .catch(() => {})
      throw error
    }
    const after = await github.pull(number)
    if (after.state !== "open" || after.head.sha !== run.head_sha) {
      continue
    }
    const url = validatePreviewResult(result, name)
    await github.comment(
      number,
      `${target.marker}\nPreview: ${url}\n\nSHA: ${run.head_sha}`,
      run.head_sha,
    )
    return "deployed"
  }
  throw new Error("PR changed repeatedly; run manual reconciliation")
}

async function deployProduction(github, cloudflare) {
  const head = await github.main()
  const run = await github.successfulRun(undefined, head)
  if (!run) throw new Error("No successful CI for current main")
  validateRun(run)
  if (run.head_sha !== head) throw new Error("Stale production CI")
  const payload = await github.artifact(run)
  if ((await github.main()) !== head) return "stale"
  await cloudflare.deploy(payload, undefined, head)
  if ((await github.main()) !== head)
    throw new Error("main changed during deploy; reconcile current main")
  return "deployed"
}

export function validateRun(run, pr) {
  if (
    run.repository?.full_name !== target.repository ||
    run.path !== target.workflowPath ||
    run.name !== "CI" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !Number.isSafeInteger(run.id) ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  ) {
    throw new Error("Unverified CI run")
  }
  if (pr) {
    validatePull(pr, pr.number)
    if (
      run.event !== "pull_request" ||
      run.head_sha !== pr.head.sha ||
      run.head_repository?.id !== pr.head.repo?.id ||
      run.head_branch !== pr.head.ref
    ) {
      throw new Error("CI does not match PR head")
    }
  } else if (
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.head_repository?.full_name !== target.repository
  ) {
    throw new Error("Production requires main push CI")
  }
}

export function validatePull(pr, number) {
  previewName(number)
  if (
    pr.number !== number ||
    pr.base?.repo?.full_name !== target.repository ||
    pr.base.ref !== "main" ||
    !["open", "closed"].includes(pr.state)
  )
    throw new Error("Unexpected PR target")
}

export function validatePreviewResult(result, name) {
  if (
    result.preview_name !== name ||
    !Array.isArray(result.preview_urls) ||
    !result.preview_urls.length
  ) {
    throw new Error("Unverified preview deployment result")
  }
  const url = new URL(result.preview_urls[0])
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev") ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw new Error("Unexpected preview URL")
  return url.href
}
