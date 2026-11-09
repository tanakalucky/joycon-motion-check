export const target = Object.freeze({
  repository: "tanakalucky/joycon-motion-check",
  accountId: "854f0f3b5b5e432e6e2e87d297965d4f",
  worker: "joycon-motion-check",
  compatibilityDate: "2026-11-09",
  cliVersion: "1.0.0-beta.28",
  workflowPath: ".github/workflows/ci.yml",
  marker: "<!-- joycon-motion-check:preview -->",
  botId: 41898282,
})

export function previewName(number) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Invalid PR number")
  return `pr-${number}`
}
