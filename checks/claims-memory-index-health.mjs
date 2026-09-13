#!/usr/bin/env node
/**
 * "WILL THE READ-IN STILL LOAD?" — the standing guard on the coordinator memory index.
 *
 * WHY THIS EXISTS (2026-08-07). `MEMORY.md` is the first thing loaded every
 * session and the spine of Boz's read-in (`BOZ.md §5`). It is also the file
 * every session APPENDS to. On 2026-08-07 it reached 20 KB against a 24.4 KB
 * read limit — one more session from **silently truncating its own tail**,
 * which is the exact failure mode the read-in exists to prevent: the index
 * would still load, still look complete, and quietly stop carrying its last
 * entries. A plausible-looking partial read is worse than a refusal
 * (`CLAUDE.md` Layer 0 q2), and it is worst in the file that teaches that rule.
 *
 * ⭐ The growth is structural, not a one-off: the index only grows, because
 *    every session banks something. So this is a BUDGET, checked, not a tidy-up.
 *
 * WHAT IT CHECKS
 *   1. SIZE — MEMORY.md against the compaction budget. Over ⇒ FAIL, with the
 *      fix named: one line per entry, detail into the topic file, farms into an
 *      `index_*.md` (the `index_trees_arborist` / `index_render_slab` pattern).
 *   2. DEAD LINKS — every `[label](file.md)` target exists, and every `[[slug]]`
 *      resolves to a memory's frontmatter `name:` (NOT its filename — `[[boz]]`
 *      lives in `boz-the-continuous-coordinator.md`). A dead pointer is the one
 *      unforgivable doc error (`BOZ.md §4`).
 *   3. UNREACHABLE MEMORIES — files no index line points at. A memory nobody can
 *      reach is as absent as one that was never written. Reported, not fatal:
 *      index files legitimately hold the pointers for their own topic.
 *
 * ⛔ Read-only. Writes nothing.
 *
 * Usage:
 *   node checks/claims-memory-index-health.mjs
 *   MEMORY_DIR=/some/other/memory node checks/claims-memory-index-health.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve as resolvePath, dirname, basename } from 'path'
import { homedir } from 'os'
import { execSync } from 'node:child_process'

// The harness compacts at ~17.1 KB and refuses to read past ~24.4 KB. Budget at
// the compaction point, so the failure lands while there is still headroom to
// fix it calmly rather than mid-truncation.
const BUDGET = 17_100
const HARD_READ_LIMIT = 24_400

// Claude's per-project memory dir: the project path with `/` and `.` → `-`.
const resolveMemoryDir = () => {
  if (process.env.MEMORY_DIR) return process.env.MEMORY_DIR
  const slug = process.cwd().replace(/[/.]/g, '-')
  return join(homedir(), '.claude', 'projects', slug, 'memory')
}

const DIR = resolveMemoryDir()
const INDEX = join(DIR, 'MEMORY.md')

// ⛔ No vacuous pass: a missing dir/index is a FAILURE to check, never a ✅.
if (!existsSync(DIR)) {
  console.error(`⛔ memory dir not found: ${DIR}`)
  console.error('   Set MEMORY_DIR if the project path changed. NOT CHECKED — this is not a pass.')
  process.exit(2)
}
if (!existsSync(INDEX)) {
  console.error(`⛔ MEMORY.md not found in ${DIR} — the read-in has no index. NOT CHECKED.`)
  process.exit(2)
}

const src = readFileSync(INDEX, 'utf8')
const bytes = statSync(INDEX).size
const files = readdirSync(DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')

// slug → file, read from each memory's frontmatter `name:` (never guessed from the filename)
const slugOf = new Map()
for (const f of files) {
  const m = readFileSync(join(DIR, f), 'utf8').match(/^---[\s\S]*?\bname:\s*(.+?)\s*$/m)
  if (m) slugOf.set(m[1].replace(/^['"]|['"]$/g, ''), f)
}

const pointersIn = (text) => {
  const md = [...text.matchAll(/\]\(([A-Za-z0-9_\-.]+\.md)\)/g)].map(m => m[1])
  const wiki = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim())
  return { md, wiki }
}

const top = pointersIn(src)
const mdTargets = [...new Set(top.md)]
const wikiSlugs = [...new Set(top.wiki)]

const deadMd = mdTargets.filter(t => !existsSync(join(DIR, t)))
const deadWiki = wikiSlugs.filter(s => !slugOf.has(s) && !existsSync(join(DIR, `${s}.md`)))

// Reachability follows ONE hop through `index_*.md`, because that is exactly the
// compaction this check recommends — a farm moved into an index is still
// reachable, and counting it as orphaned would penalise taking the advice.
const resolve = (p) => (p.endsWith('.md') ? p : (slugOf.get(p) || `${p}.md`))
const referenced = new Set([...mdTargets, ...wikiSlugs].map(resolve))
for (const f of [...referenced]) {
  if (!f.startsWith('index_') || !existsSync(join(DIR, f))) continue
  const hop = pointersIn(readFileSync(join(DIR, f), 'utf8'))
  for (const p of [...hop.md, ...hop.wiki]) referenced.add(resolve(p))
}
const unreachable = files.filter(f => !referenced.has(f))

// ── report ─────────────────────────────────────────────────────────────────
const pct = Math.round((bytes / BUDGET) * 100)
console.log('MEMORY INDEX HEALTH — can the read-in still load in full?\n')
console.log(`  index      ${INDEX.replace(homedir(), '~')}`)
console.log(`  size       ${bytes.toLocaleString()} B  (${pct}% of the ${BUDGET.toLocaleString()} B budget;`
  + ` hard read limit ${HARD_READ_LIMIT.toLocaleString()} B)`)
console.log(`  memories   ${files.length} files, ${referenced.size} reachable from the index\n`)

let failed = false

if (bytes > BUDGET) {
  failed = true
  console.log(`⛔ OVER BUDGET by ${(bytes - BUDGET).toLocaleString()} B.`)
  console.log('   The index is the read-in; past the hard limit it truncates SILENTLY and still looks whole.')
  console.log('   Compact it now — in this order, it is the cheapest first:')
  console.log('     1. one line per entry; the detail belongs in the topic file, which already has it')
  console.log('     2. drop the previous PICK UP tail — it is git history, not context')
  console.log('     3. move a whole topic farm into an `index_*.md` and leave a one-line pointer')
  console.log('        (the `index_trees_arborist` / `index_render_slab` pattern)\n')
} else if (bytes > BUDGET * 0.95) {
  // Passing with no room is a warning, not a clean bill: the index only grows,
  // so "just under" means the NEXT session is the one that breaks the read-in.
  console.log(`⚠️  size OK but TIGHT — only ${(BUDGET - bytes).toLocaleString()} B of headroom.`)
  console.log('    The index only ever grows. Compact on this session, not the next one.\n')
} else {
  console.log(`✅ size OK — ${(BUDGET - bytes).toLocaleString()} B of headroom.\n`)
}

if (deadMd.length || deadWiki.length) {
  failed = true
  console.log('⛔ DEAD POINTERS — a dead pointer is the one unforgivable doc error (BOZ.md §4):')
  for (const t of deadMd) console.log(`     [](${t})  → no such file`)
  for (const s of deadWiki) console.log(`     [[${s}]]  → no memory declares name: ${s}`)
  console.log()
} else {
  console.log('✅ every pointer in the index resolves.\n')
}

if (unreachable.length) {
  console.log(`⚠️  ${unreachable.length} memory file(s) not referenced by the index — reachable only if`)
  console.log('    an index_* file carries them. Confirm, or they are effectively unwritten:')
  for (const f of unreachable.slice(0, 15)) console.log(`     ${f}`)
  if (unreachable.length > 15) console.log(`     … and ${unreachable.length - 15} more`)
  console.log()
}

// ── THE PRUNING PROGRAM (added 2026-08-12, Jacob: "a pruning program built in
// from here on out"). The size check above catches the SYMPTOM — this catches the
// three MECHANISMS that produce it, each of which grew this file past budget once:
//   1. §C never evicts        — a finding stays after it is written into canon
//   2. clause accretion       — an incident bolts a sentence onto an existing line
//   3. duplicate routing      — several lines pointing at the same index_*
// ⛔ These are WARNINGS, not failures: a real arc can legitimately run 6 live lines.
//    They exist so the drift is SEEN on the session that causes it, not three later.
{
  const lines = src.split('\n')
  const sectionOf = (i) => {
    for (let j = i; j >= 0; j--) { const m = lines[j].match(/^##\s+§([A-E])/); if (m) return m[1] }
    return null
  }
  const bullets = lines.map((l, i) => ({ l, i })).filter(x => /^\s*-\s+\S/.test(x.l))

  const liveFront = bullets.filter(b => sectionOf(b.i) === 'C')
  const LIVE_CAP = 6
  if (liveFront.length > LIVE_CAP) {
    console.log(`⚠️  §C THE LIVE FRONT has ${liveFront.length} lines (cap ${LIVE_CAP}).`)
    console.log('    ⛔ EVICTION RULE: a finding LEAVES §C the moment it is written into canon.')
    console.log('    Cut the ones whose home doc now carries them; keep the pointer only.\n')
  }

  const FAT = 700
  const fat = bullets.filter(b => b.l.length > FAT)
  if (fat.length) {
    console.log(`⚠️  ${fat.length} line(s) over ${FAT} B — the clause-accretion tell:`)
    for (const b of fat.slice(0, 5)) {
      console.log(`     §${sectionOf(b.i) ?? '?'} ${b.l.length} B — ${b.l.replace(/^\s*-\s*/, '').slice(0, 72)}…`)
    }
    console.log('    ⛔ Do NOT append another clause. Rewrite the line, or move detail to the linked file.\n')
  }

  const idxCount = new Map()
  for (const m of src.matchAll(/\[\[(index_[a-z_]+)\]\]/g)) idxCount.set(m[1], (idxCount.get(m[1]) || 0) + 1)
  const dupes = [...idxCount].filter(([, n]) => n > 1)
  if (dupes.length) {
    console.log('⚠️  duplicate index routing — one pointer line per index_*, no duplicates:')
    for (const [k, n] of dupes) console.log(`     [[${k}]] × ${n}`)
    console.log()
  }

  // ⛔ The all-clear must test WITHIN CAP, not ZERO — an empty §C is not the
  // healthy state, it is an unused section. (This branch read `!liveFront.length`
  // on its first run and printed NOTHING at all: no warning, no all-clear. A check
  // that goes silent is the failure this file exists to prevent.)
  if (liveFront.length <= LIVE_CAP && !fat.length && !dupes.length) {
    console.log(`✅ pruning program: §C ${liveFront.length}/${LIVE_CAP} live · no fat lines · no duplicate index routing.\n`)
  }
}

// ── REPO-PATH CITATIONS (added 2026-09-13) ─────────────────────────────────
// The axis nothing watched. Everything above validates MEMORY.md → memory files.
// It has no opinion about memory files → THE REPO, and that is the axis that
// rotted: 16 dead citations were repaired by hand on 2026-09-13 and nothing
// would have caught any of them, or the next one. A memory that cites a path
// which no longer exists is worse than silent — it is read as recall from a
// high-context seat and acted on (`BOZ.md §0`).
//
// ⛔⛔ NEVER RESOLVE BY BASENAME. `arborist/OPERATIONS.md` does not exist;
//    `meteorologist/OPERATIONS.md` does. A check that "helpfully" found the
//    basename elsewhere would license repointing a citation at the WRONG
//    DOCUMENT — a live pointer to the wrong thing, which is strictly worse than
//    a dead one, because nothing downstream will ever question it. Paths are
//    compared AS WRITTEN. Candidates are printed as CANDIDATES and never as
//    resolutions, and the operator must read both files before repointing.
//
// ⭐ What counts as a repo path is READ FROM THE REPO, never restated: a
//    citation qualifies only if its first segment is a real top-level entry.
//    That is what separates `cartograph/spurOutline.js` (a path) from `lon/lat`,
//    `tan(θ/2`, `/stem/`, `origin/main` and `clean/map.json` (notation, a regex,
//    an HTTP route, a git ref, a scene-relative fragment). Without it the naive
//    parse reports 240 citations dead, ~92% of them false, and a check nobody
//    believes is a check nobody runs.
{
  const REPO = resolvePath(process.env.REPO_ROOT ?? process.cwd())

  // The repo's own top-level names decide what a path looks like.
  const TOP = new Set(readdirSync(REPO).filter(n => !n.startsWith('.')))

  // Tracked set, so a citation that exists only on THIS disk can be told apart
  // from one a clone would also find. One command literal so `checks/tier.mjs`
  // can read it and keep this check in the `safe` tier (see the sibling check).
  const tracked = new Set(
    execSync('git ls-files -z', { cwd: REPO, maxBuffer: 1e9 }).toString().split('\0').filter(Boolean)
  )

  const cites = new Map() // path as written → Set of memory files citing it
  for (const f of files.concat('MEMORY.md')) {
    const body = readFileSync(join(DIR, f), 'utf8')
    const raw = new Set()
    for (const m of body.matchAll(/`([^`\n]+)`/g)) for (const t of m[1].split(/\s+/)) raw.add(t)
    for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) raw.add(m[1])
    for (let t of raw) {
      t = t.replace(/^[(\['"«]+/, '').replace(/[)\],.;:'"»]+$/, '')
      t = t.replace(/[:#].*$/, '')                              // drop :line and #anchor
      if (!t.includes('/')) continue
      if (/[{}*|()?<>…\\]/.test(t)) continue                     // globs, braces, regex, ellipsis
      if (/^https?:|^www\.|\.(com|org|gov|io|pl)\//.test(t)) continue
      if (!TOP.has(t.split('/')[0])) continue                    // ⭐ the repo decides
      if (!cites.has(t)) cites.set(t, new Set())
      cites.get(t).add(f)
    }
  }

  // A citation naming a FILE (an extension) or a DIRECTORY (a trailing slash) is
  // an exact claim and must resolve. One without either — `scripts/15`,
  // `arborist/README` — is the house shorthand for a numbered or extensionless
  // sibling, so it is only reported when nothing on disk begins with it.
  const exact = [], abbrev = []
  for (const [p, srcs] of [...cites].sort()) {
    const onDisk = existsSync(join(REPO, p))
    const isExact = /\.\w+$/.test(p) || p.endsWith('/')
    if (isExact) { if (!onDisk) exact.push([p, srcs]) }
    else if (!onDisk && !readdirSync(join(REPO, dirname(p)), { withFileTypes: true })
      .some(d => d.name.startsWith(basename(p)))) abbrev.push([p, srcs])
  }

  // Present here, absent from a clone. Asserted separately and labelled, because
  // "it works on my disk" is the defect this repo closed for scene inputs today.
  const untracked = [...cites].filter(([p]) =>
    existsSync(join(REPO, p)) && !tracked.has(p) && !p.endsWith('/') &&
    !/\.\w+$/.test(p) === false && !tracked.has(p)).filter(([p]) => /\.\w+$/.test(p))

  console.log(`REPO-PATH CITATIONS — do the memories still point at real files?\n`)
  console.log(`  ${cites.size} citation(s) whose first segment is a real top-level repo entry`)
  console.log(`  asserted against: the working tree (existence on disk), AS WRITTEN\n`)

  if (exact.length) {
    failed = true
    console.log(`⛔ ${exact.length} DEAD REPO CITATION(S) — the path does not exist as written:`)
    for (const [p, srcs] of exact) {
      console.log(`     ${p}`)
      console.log(`        cited by: ${[...srcs].sort().join(', ')}`)
      // ⛔ A CANDIDATE IS NOT A RESOLUTION. Printed to save a search, never to
      //    license a sed: `arborist/OPERATIONS.md` → `meteorologist/OPERATIONS.md`
      //    is a DIFFERENT DOCUMENT about a different subsystem.
      const hits = [...tracked].filter(t => basename(t) === basename(p)).slice(0, 3)
      if (hits.length) console.log(`        ⚠️  same basename elsewhere: ${hits.join(', ')}`)
      console.log(`            ⛔ CANDIDATE ONLY — not a resolution. Read both files before repointing;`)
      console.log(`               a live pointer to the wrong document is worse than a dead one.`)
    }
    console.log('\n   ⛔ DO NOT BULK-FIX. Several of these need a ruling, not a sed.\n')
  } else {
    console.log('✅ every repo-path citation resolves as written.\n')
  }

  if (untracked.length) {
    console.log(`⚠️  ${untracked.length} citation(s) exist HERE but are not tracked in git —`)
    console.log('    a clone would not find them. Not a failure; a disclosure:')
    for (const [p, srcs] of untracked.slice(0, 10)) console.log(`     ${p}  (${[...srcs].sort()[0]})`)
    if (untracked.length > 10) console.log(`     … and ${untracked.length - 10} more`)
    console.log()
  }

  if (abbrev.length) {
    console.log(`⚠️  ${abbrev.length} extensionless citation(s) matching nothing on disk —`)
    console.log('    shorthand that has gone stale, or a path that lost its file:')
    for (const [p, srcs] of abbrev) console.log(`     ${p}  (${[...srcs].sort().join(', ')})`)
    console.log()
  }
}

console.log(failed
  ? '⛔ FAIL — fix before banking anything else into memory.'
  : '✅ PASS — the read-in loads in full.')
process.exit(failed ? 1 : 0)
