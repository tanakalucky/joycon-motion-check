import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { prepareOutput } from "./assets.mjs"
import { validatePull, validateRun } from "./lifecycle.mjs"
import { previewName, target } from "./target.mjs"

export function createGitHub(token) {
  const prefix = `/repos/${target.repository}`
  const api = async (path, options = {}) => {
    const response = await fetch(`https://api.github.com${prefix}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    })
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`)
    return response.json()
  }
  const pull = (number) => {
    previewName(number)
    return api(`/pulls/${number}`)
  }
  return {
    pull,
    main: async () => (await api("/git/ref/heads/main")).object.sha,
    async resolveNumber(runId) {
      const run = await api(`/actions/runs/${integer(runId)}`)
      if (run.event === "push") {
        validateRun({ ...run, conclusion: "success" })
        return 0
      }
      const candidates = await api(`/commits/${run.head_sha}/pulls?per_page=100`)
      const matches = candidates.filter(
        (pr) => pr.head.sha === run.head_sha && pr.base.ref === "main",
      )
      if (matches.length !== 1)
        throw new Error("Cannot identify exactly one PR; use manual reconciliation")
      validateRun({ ...run, conclusion: "success" }, matches[0])
      return matches[0].number
    },
    async successfulRun(pr, runId, head) {
      const sha = pr?.head.sha ?? head
      if (runId) {
        const run = await api(`/actions/runs/${integer(runId)}`)
        if (run.head_sha !== sha || run.conclusion !== "success") return undefined
        validateRun(run, pr)
        return run
      }
      const event = pr ? "pull_request" : "push"
      const runs = await api(
        `/actions/workflows/ci.yml/runs?head_sha=${sha}&event=${event}&status=success&per_page=100`,
      )
      for (const run of runs.workflow_runs) {
        try {
          validateRun(run, pr)
          return run
        } catch {
          /* A different source is not an eligible build. */
        }
      }
      return undefined
    },
    async artifact(run) {
      const artifacts = []
      for (let page = 1; ; page++) {
        const result = await api(`/actions/runs/${run.id}/artifacts?per_page=100&page=${page}`)
        artifacts.push(...result.artifacts)
        if (result.artifacts.length < 100) break
      }
      const matches = artifacts.filter((item) => item.name === "static-site" && !item.expired)
      if (matches.length !== 1) throw new Error("Expected exactly one static-site artifact")
      const artifact = matches[0]
      if (
        artifact.workflow_run?.id !== run.id ||
        artifact.workflow_run?.head_sha !== run.head_sha ||
        artifact.workflow_run?.repository_id !== run.repository.id ||
        artifact.size_in_bytes > 30 * 1024 * 1024
      ) {
        throw new Error("Artifact provenance or size mismatch")
      }
      const redirect = await fetch(
        `https://api.github.com${prefix}/actions/artifacts/${integer(artifact.id)}/zip`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "manual",
        },
      )
      if (redirect.status !== 302) throw new Error("Artifact download did not redirect")
      const location = new URL(redirect.headers.get("location"))
      if (location.protocol !== "https:") throw new Error("Invalid artifact download URL")
      const response = await fetch(location)
      if (!response.ok) throw new Error("Artifact download failed")
      const archive = await boundedBody(response, 30 * 1024 * 1024)
      const payload = execFileSync("python3", [resolve("scripts/deploy/read-artifact.py")], {
        input: archive,
        maxBuffer: 30 * 1024 * 1024,
      })
      return JSON.parse(payload.toString())
    },
    async comment(number, body, sha) {
      const current = await pull(number)
      validatePull(current, number)
      if (sha && (current.state !== "open" || current.head.sha !== sha))
        throw new Error("PR changed before comment")
      if (!sha && body.includes("削除済み") && current.state !== "closed")
        throw new Error("PR reopened before cleanup comment")
      const find = async () => {
        const matches = []
        for (let page = 1; ; page++) {
          const comments = await api(`/issues/${number}/comments?per_page=100&page=${page}`)
          matches.push(
            ...comments.filter(
              (comment) =>
                comment.user?.id === target.botId &&
                comment.user?.type === "Bot" &&
                comment.body.startsWith(target.marker),
            ),
          )
          if (comments.length < 100) break
        }
        if (matches.length > 1)
          throw new Error("Duplicate owned comments require manual reconciliation")
        return matches[0]
      }
      const existing = await find()
      if (existing?.body === body) return
      const beforeWrite = await pull(number)
      if (beforeWrite.state !== current.state || beforeWrite.head.sha !== current.head.sha) {
        throw new Error("PR changed while listing comments; reconcile again")
      }
      try {
        await api(existing ? `/issues/comments/${existing.id}` : `/issues/${number}/comments`, {
          method: existing ? "PATCH" : "POST",
          body: JSON.stringify({ body }),
        })
      } catch (error) {
        // A lost response can hide a successful write. Never repeat an unknown POST.
        const saved = await find()
        if (saved?.body !== body) throw error
      }
    },
  }
}

export function createCloudflare(token) {
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not configured")
  const cli = resolve("node_modules/cf/bin/cf")
  const environment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CI: "true",
    CF_SEND_TELEMETRY: "false",
    CLOUDFLARE_ACCOUNT_ID: target.accountId,
    CLOUDFLARE_API_TOKEN: token,
  }
  return {
    async deploy(payload, name, sha) {
      const directory = await mkdtemp(join(tmpdir(), "joycon-deploy-"))
      try {
        await prepareOutput(directory, payload, Boolean(name))
        const args = name
          ? ["previews", "deploy", name, "--prebuilt", "--mode", "production"]
          : ["deploy", "--prebuilt", "--mode", "production", "--message", sha]
        const result = execFileSync(process.execPath, [cli, ...args], {
          cwd: directory,
          env: environment,
          maxBuffer: 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        })
        return JSON.parse(result.toString())
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
    async remove(name) {
      if (!/^pr-[1-9]\d*$/.test(name)) throw new Error("Invalid preview target")
      const url = `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/workers/${target.worker}/previews/${name}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (response.status === 404) return
      if (!response.ok) throw new Error(`Cloudflare preview lookup failed: ${response.status}`)
      const existing = await response.json()
      if (!existing.success || existing.result?.name !== name)
        throw new Error("Preview ownership mismatch")
      const directory = await mkdtemp(join(tmpdir(), "joycon-cleanup-"))
      try {
        execFileSync(
          process.execPath,
          [cli, "previews", "delete", name, "--worker", target.worker, "--force"],
          {
            cwd: directory,
            env: environment,
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 1024 * 1024,
          },
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

function integer(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Expected a positive integer")
  return number
}

async function boundedBody(response, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new Error("Artifact exceeds download limit")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
