import { mkdir, writeFile } from "node:fs/promises"

import { packAssets } from "./assets.mjs"

const payload = await packAssets("dist")
await mkdir("deploy-artifact", { recursive: true })
await writeFile("deploy-artifact/site.json", JSON.stringify(payload))
