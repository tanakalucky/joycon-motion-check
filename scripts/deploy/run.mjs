import { createCloudflare, createGitHub } from "./adapters.mjs"
import { reconcile } from "./lifecycle.mjs"
import { target } from "./target.mjs"

if (process.env.GITHUB_REPOSITORY !== target.repository) throw new Error("Unexpected repository")
if (process.env.DEPLOY_ENABLED !== "true")
  throw new Error("Deployment is disabled; complete documented setup")
const github = createGitHub(process.env.GH_TOKEN)
const number = Number(process.env.TARGET_PR)
if (!/^(0|[1-9]\d*)$/.test(process.env.TARGET_PR ?? "") || !Number.isSafeInteger(number)) {
  throw new Error("Invalid resolved target")
}
const result = await reconcile({
  github,
  cloudflare: createCloudflare(process.env.CLOUDFLARE_API_TOKEN),
  number,
})
console.log(JSON.stringify({ result, target: number ? `pr-${number}` : "production" }))
