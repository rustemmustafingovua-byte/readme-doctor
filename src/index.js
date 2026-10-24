/**
 * readme-doctor — why nobody is using your repository.
 *
 * A README is the product page. These are the checks that separate a README
 * that converts from one that gets scrolled past: a working install line, a
 * visible demo, a license, working links, and a first paragraph that says what
 * the thing does in one sentence.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export const CHECKS = {
  HAS_TITLE: "has a title",
  HAS_ONE_LINER: "explains what it does in one line",
  HAS_INSTALL: "has an install command",
  HAS_USAGE: "has a usage example",
  HAS_LICENSE: "has a license",
  HAS_BADGES: "has badges",
  HAS_CONTRIBUTING: "points to contributing",
  HAS_ISSUES: "links to issues",
  LINKS_OK: "relative links resolve",
  NO_TODO_PLACEHOLDER: "no placeholder text left",
  HAS_SOCIAL: "has a social preview image",
  CODE_BLOCKS_CLOSED: "code fences are closed",
}

const PLACEHOLDERS = [/\[your[- ]?(name|project|api[- ]?key|token)\]/i, /TODO/, /FIXME/, /lorem ipsum/i, /\bXXX\b/]
const INSTALL_LINE_RE =
  /^\s*(?:\$\s*)?((?:npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|bun\s+add|pip\s+install|brew\s+install|go\s+install|cargo\s+install|docker\s+run|uv\s+add)\b[^\n`]*)/im

/** Split a README into sections by heading. */
export function parseSections(md) {
  const lines = String(md || "").split("\n")
  const sections = []
  let current = null
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      current = { title: h[2].trim(), level: h[1].length, body: "" }
      sections.push(current)
      continue
    }
    if (current) current.body += line + "\n"
  }
  return sections
}

/** Propose a short, specific one-liner first paragraph from the title and the install line. */
export function rewrite(dirOrMd) {
  let md = String(dirOrMd || "")
  if (md && !md.includes("\n") && existsSync(md)) {
    try {
      if (statSync(md).isDirectory()) {
        const p = ["README.md", "readme.md", "README.MD", "Readme.md"]
          .map((f) => join(md, f))
          .find((f) => existsSync(f))
        md = p ? readFileSync(p, "utf8") : ""
      } else {
        md = readFileSync(md, "utf8")
      }
    } catch {}
  }

  const sections = parseSections(md)
  const rawTitle = (sections[0]?.title || "project").replace(/[`*_~]/g, "").trim()
  const [namePart, taglinePart] = rawTitle.split(/\s+[—–-]\s+/, 2)
  const title = (namePart || rawTitle || "project").trim()

  const installMatch = md.match(INSTALL_LINE_RE)
  const installCmd = installMatch ? installMatch[1].trim().replace(/\s+#.*$/, "").trim() : null

  let pkg = null
  if (installCmd) {
    const tokens = installCmd
      .replace(/^(?:npm\s+(?:i|install)|pnpm\s+add|yarn\s+add|bun\s+add|pip\s+install|brew\s+install|go\s+install|cargo\s+install|docker\s+run|uv\s+add)\s+/i, "")
      .split(/\s+/)
      .filter((t) => t && !t.startsWith("-"))
    pkg = tokens[tokens.length - 1] || null
  }

  const isGlobalCli = installCmd ? /(?:^|\s)-(?:g|-global)\b|\b(?:brew|cargo|go)\s+install\b|\bdocker\s+run\b/i.test(installCmd) : false
  const kind = isGlobalCli
    ? "command-line tool"
    : installCmd && /\b(?:pip|uv)\b/i.test(installCmd)
      ? "Python package"
      : "package"

  const what = taglinePart
    ? taglinePart.trim().replace(/\.$/, "")
    : pkg && pkg !== title && !pkg.startsWith("http")
      ? `${kind} (${pkg})`
      : kind

  if (installCmd) {
    return `${title} — ${what}. Install with \`${installCmd}\`.`
  }
  return `${title} — ${what} that does one job well.`
}

/** Check a repository directory. */
export function audit(dir) {
  const readmePath = ["README.md", "readme.md", "README.MD", "Readme.md"]
    .map((f) => join(dir, f))
    .find((p) => existsSync(p))
  const findings = []
  const add = (id, severity, message) => findings.push({ id, severity, message: message || CHECKS[id] || id })

  if (!readmePath) {
    add("NO_README", "error", "no README found")
    return { ok: false, findings, score: 0, readme: null, rewrite: null }
  }
  const md = readFileSync(readmePath, "utf8")
  const sections = parseSections(md)
  const text = md.toLowerCase()

  if (!sections.length) add("HAS_TITLE", "error", "no title heading")
  if (!/^\s*[>#].{10,120}\n\s*\n?\s*\S/m.test(md)) add("HAS_ONE_LINER", "warn", "no obvious one-line description")
  if (!/\b(npm i|npm install|pnpm add|yarn add|bun add|pip install|brew install|go install|cargo install|docker run|uv add)\b/.test(text))
    add("HAS_INSTALL", "error", "no install command found")
  if (!/```/.test(md)) add("HAS_USAGE", "error", "no code example")
  if (!existsSync(join(dir, "LICENSE"))) add("HAS_LASORY", "warn", "no LICENSE file")
  if (!/!\[.*\]\(https?:\/\/[^)]+\)/.test(md)) add("HAS_BADGES", "info", "no badges")
  if (!/contributing/i.test(text)) add("HAS_CONTRIBUTING", "info", "no contributing guide")
  if (!/issues/i.test(text)) add("HAS_ISSUES", "info", "no link to issues")
  if (!/social-preview|og:image|<img/i.test(md)) add("HAS_SOCIAL", "info", "no social preview image")
  if (PLACEHOLDERS.some((r) => r.test(md))) add("NO_TODO_PLACEHOLDER", "warn", "placeholder text left in the README")

  // relative links
  for (const m of md.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const link = m[1]
    if (/^(https?:|mailto:|#)/i.test(link)) continue
    const target = resolve(dirname(readmePath), link)
    if (!existsSync(target)) add("LINKS_OK", "warn", `broken relative link: ${link}`)
  }

  // code fences balanced
  const fences = (md.match(/^```/gm) || []).length
  if (fences % 2 !== 0) add("CODE_BLOCKS_CLOSED", "error", "unclosed code fence")

  const errors = findings.filter((f) => f.severity === "error").length
  const warns = findings.filter((f) => f.severity === "warn").length
  const infos = findings.filter((f) => f.severity === "info").length
  return {
    ok: errors === 0,
    readme: readmePath,
    bytes: statSync(readmePath).size,
    lines: md.split("\n").length,
    sections: sections.length,
    findings,
    rewrite: rewrite(md),
    score: Math.max(0, Math.round(100 - errors * 18 - warns * 8 - infos * 3)),
  }
}

/** Concrete suggestions for the worst findings. */
export function suggestions(findings) {
  const map = {
    HAS_INSTALL: "add a one-line install: `npm i <pkg>`",
    HAS_USAGE: "add a 5-line usage example with real output",
    HAS_LICENSE: "add a LICENSE file (MIT is fine)",
    HAS_BADGES: "add CI / npm / license badges",
    HAS_ONE_LINER: "first line after the title must say what it does",
    NO_TODO_PLACEHOLDER: "replace the placeholder with the real value",
    LINKS_OK: "fix or remove the broken link",
    HAS_SOCIAL: "add docs/social-preview.png and reference it at the top",
    CODE_BLOCKS_CLOSED: "close the unterminated code fence",
  }
  return findings.map((f) => map[f.id] || f.message)
}
