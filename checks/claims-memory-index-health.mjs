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
 *   node scratch/claims-memory-index-health.mjs
 *   MEMORY_DIR=/some/other/memory node scratch/claims-memory-index-health.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

console.log(failed
  ? '⛔ FAIL — fix before banking anything else into memory.'
  : '✅ PASS — the read-in loads in full.')
process.exit(failed ? 1 : 0)
