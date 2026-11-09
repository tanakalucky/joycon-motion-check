import { appendFile, readFile } from "node:fs/promises"

import { createGitHub } from "./adapters.mjs"
import { previewName, target } from "./target.mjs"

export async function resolveTarget(eventName, event, ref, github) {
  let number
  if (eventName === "workflow_run") number = await github.resolveNumber(event.workflow_run.id)
  else if (eventName === "pull_request_target" && event.action === "closed")
    number = event.pull_request.number
  else if (
    eventName === "workflow_dispatch" &&
    ref === "refs/heads/main" &&
    /^(0|[1-9]\d*)$/.test(event.inputs.pr)
  )
    number = Number(event.inputs.pr)
  else throw new Error("Unsupported deployment event")
  const key = number === 0 ? "production" : previewName(number)
  return { number, key }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.GITHUB_REPOSITORY !== target.repository) throw new Error("Unexpected repository")
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))
  const { number, key } = await resolveTarget(
    process.env.GITHUB_EVENT_NAME,
    event,
    process.env.GITHUB_REF,
    createGitHub(process.env.GH_TOKEN),
  )
  await appendFile(process.env.GITHUB_OUTPUT, `number=${number}\nkey=${key}\n`)
}
