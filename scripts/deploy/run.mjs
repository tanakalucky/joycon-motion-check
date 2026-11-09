import { readFile } from "node:fs/promises"

import { createCloudflare, createGitHub } from "./adapters.mjs"
import { reconcile } from "./lifecycle.mjs"
import { target } from "./target.mjs"

if (process.env.GITHUB_REPOSITORY !== target.repository) throw new Error("Unexpected repository")
if (process.env.DEPLOY_ENABLED !== "true")
  throw new Error("Deployment is disabled; complete documented setup")
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))
const github = createGitHub(process.env.GH_TOKEN)
let number
let runId
if (process.env.GITHUB_EVENT_NAME === "workflow_run") {
  runId = event.workflow_run.id
  number = await github.resolveNumber(runId)
} else if (process.env.GITHUB_EVENT_NAME === "pull_request_target" && event.action === "closed") {
  number = event.pull_request.number
} else if (
  process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
  process.env.GITHUB_REF === "refs/heads/main"
) {
  number = Number(event.inputs.pr)
} else throw new Error("Unsupported deployment event")
const result = await reconcile({
  github,
  cloudflare: createCloudflare(process.env.CLOUDFLARE_API_TOKEN),
  number,
  runId,
})
console.log(JSON.stringify({ result, target: number ? `pr-${number}` : "production" }))
