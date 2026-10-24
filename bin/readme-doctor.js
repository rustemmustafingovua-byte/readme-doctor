#!/usr/bin/env node
/**
 * readme-doctor — audit a repository's README.
 *
 *   readme-doctor .
 *   readme-doctor . --rewrite
 *   readme-doctor . --json
 */
import { audit, rewrite, suggestions } from "../src/index.js"

// --- CLI shell: --help / --version -------------------------------------------
const HELP = "readme-doctor — Why nobody is using your repository — checked in one command.\n\nUSAGE\n  readme-doctor .\n  readme-doctor . --rewrite\n  readme-doctor . --json\n\nCOMMANDS / OPTIONS\n  --rewrite  propose a one-liner first paragraph from the title and install line\n  --json     machine-readable output\n\nExit code 1 when the README has an error-level finding.\n\nMIT · https://github.com/rustemmustafingovua-byte"
const VERSION = "0.1.0"
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP)
  process.exit(0)
}
if (process.argv.includes("--version") || process.argv.includes("-V")) {
  console.log(VERSION)
  process.exit(0)
}


const argv = process.argv.slice(2)
const dir = argv.find((a) => !a.startsWith("--")) || "."
const wantRewrite = argv.includes("--rewrite")
const report = audit(dir)

if (argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}
if (wantRewrite && !report.findings.length && argv.length === 1) {
  console.log(report.rewrite || rewrite(dir))
  process.exit(0)
}
console.log(`\n${report.readme || "(no README)"}  ·  ${report.lines || 0} lines  ·  score ${report.score}/100`)
if (!report.findings.length) {
  console.log("\n  nothing to fix — this README is in good shape\n")
} else {
  console.log("")
  for (const f of report.findings) {
    const mark = f.severity === "error" ? "✗" : f.severity === "warn" ? "!" : "·"
    console.log(`  ${mark} ${f.message}`)
  }
  console.log("\n  what to do:")
  for (const s of suggestions(report.findings)) console.log(`    - ${s}`)
  console.log("")
}
if (wantRewrite && report.rewrite) {
  console.log("  suggested first paragraph:")
  console.log(`    ${report.rewrite}\n`)
}
process.exit(report.ok ? 0 : 1)
