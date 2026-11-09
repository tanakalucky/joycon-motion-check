import { defineConfig } from "cf/config"

import { target } from "./scripts/deploy/target.mjs"

export default defineConfig({
  accountId: target.accountId,
  worker: {
    name: target.worker,
    compatibilityDate: target.compatibilityDate,
    workersDev: true,
    previewUrls: true,
    assets: { notFoundHandling: "none" },
  },
})
