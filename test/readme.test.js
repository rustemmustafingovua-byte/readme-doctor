import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSections, audit, suggestions } from "../src/index.js"
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function repo(readme, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rd-"))
  writeFileSync(join(dir, "README.md"), readme)
  for (const [name, body] of Object.entries(extra)) {
    mkdirSync(join(dir, "docs"), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

test("splits sections", () => {
  const s = parseSections("# A\nx\n## B\ny")
  assert.equal(s.length, 2)
  assert.equal(s[1].title, "B")
})

test("a good README scores high", () => {
  const dir = repo(
    "# Thing\n\nA tiny thing that does X for you.\n\n## Install\n\n```bash\nnpm i thing\n```\n\n## Usage\n\n```js\nthing()\n```\n\n![badge](https://img.shields.io/x)\n\nSee [issues](https://github.com/a/b/issues) and contributing.\n",
    { LICENSE: "MIT" },
  )
  const r = audit(dir)
  assert.ok(r.score > 70, "score was " + r.score)
})

test("a missing install command is an error", () => {
  const dir = repo("# Thing\n\nDoes things.\n")
  const r = audit(dir)
  assert.ok(r.findings.some((f) => f.id === "HAS_INSTALL" && f.severity === "error"))
})

test("broken relative links are reported", () => {
  const dir = repo("# Thing\n\n```bash\nnpm i x\n```\n\n[missing](./nope.md)\n")
  const r = audit(dir)
  assert.ok(r.findings.some((f) => f.id === "LINKS_OK"))
})

test("suggestions are actionable", () => {
  const s = suggestions([{ id: "HAS_INSTALL" }])
  assert.match(s[0], /npm i/)
})

import { rewrite } from "../src/index.js"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const BIN = join(fileURLToPath(new URL("..", import.meta.url)), "bin/readme-doctor.js")

test("rewrite proposes a short, specific one-liner from title and install line", () => {
  const md = "# readme-doctor\n\n## Install\n\n```bash\nnpm i -g readme-doctor\n```\n"
  const line = rewrite(md)
  assert.match(line, /readme-doctor/)
  assert.match(line, /`npm i -g readme-doctor`/)
  assert.ok(line.length < 120, "suggestion should be short: " + line)
})

test("--rewrite CLI flag prints the proposed one-liner", () => {
  const dir = repo(
    "# fast-cli\n\n## Install\n\n```bash\nnpm i -g fast-cli\n```\n\n## Usage\n\n```bash\nfast-cli .\n```\n",
    { LICENSE: "MIT" },
  )
  const out = execFileSync("node", [BIN, dir, "--rewrite"], { encoding: "utf8" })
  assert.match(out, /suggested first paragraph:/)
  assert.match(out, /fast-cli — command-line tool\. Install with `npm i -g fast-cli`\./)
})
