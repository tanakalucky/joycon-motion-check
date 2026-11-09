import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { target } from "./target.mjs"

const maxBytes = 20 * 1024 * 1024
const allowed =
  /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:html|js|css|svg|png|jpg|jpeg|webp|ico|woff2|json|txt)$/

export function validateAssets(payload) {
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 500) {
    throw new Error("Invalid asset list")
  }
  const names = new Set()
  let total = 0
  const files = payload.map(({ path, content }) => {
    if (
      typeof path !== "string" ||
      path.length > 240 ||
      !allowed.test(path) ||
      path.split("/").includes("_worker.js") ||
      names.has(path)
    ) {
      throw new Error("Invalid or duplicate asset path")
    }
    if (typeof content !== "string" || content.length > maxBytes * 2)
      throw new Error("Invalid asset content")
    const bytes = Buffer.from(content, "base64")
    if (bytes.toString("base64") !== content) throw new Error("Invalid base64")
    total += bytes.length
    if (total > maxBytes) throw new Error("Assets exceed size limit")
    names.add(path)
    return { path, bytes }
  })
  if (!names.has("index.html")) throw new Error("Missing index.html")
  return files
}

export async function packAssets(directory) {
  const payload = []
  await visit("")
  validateAssets(payload)
  return payload

  async function visit(relative) {
    for (const name of await readdir(join(directory, relative))) {
      const path = relative ? `${relative}/${name}` : name
      const stat = await lstat(join(directory, path))
      if (stat.isDirectory()) await visit(path)
      else if (stat.isFile())
        payload.push({ path, content: (await readFile(join(directory, path))).toString("base64") })
      else throw new Error("Only regular files and directories are allowed")
    }
  }
}

export async function prepareOutput(directory, payload, isPreview) {
  const files = validateAssets(payload)
  const output = join(directory, ".cloudflare/output/v0")
  const worker = join(output, "workers/default")
  await mkdir(join(worker, "assets"), { recursive: true })
  await writeFile(
    join(output, "config.json"),
    JSON.stringify({
      accountId: target.accountId,
      buildContext: { isPreview, mode: "production" },
    }),
  )
  await writeFile(
    join(worker, "worker.config.json"),
    JSON.stringify({
      name: target.worker,
      compatibilityDate: target.compatibilityDate,
      workersDev: true,
      previewUrls: false,
      assets: { notFoundHandling: "none" },
    }),
  )
  for (const { path, bytes } of files) {
    const destination = join(worker, "assets", path)
    await mkdir(join(destination, ".."), { recursive: true })
    await writeFile(destination, bytes, { flag: "wx" })
  }
}
