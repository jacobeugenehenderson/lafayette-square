#!/usr/bin/env node
/**
 * "DOES EVERY BAKE READ ITS DESIGN THROUGH THE ONE READER — AND DOES THAT READER REFUSE?"
 *
 * WHY (Phase 2 C rows 3–4, 2026-10-04). A dozen bake files each opened `public/looks/<x>/design.json` themselves, each
 * with its own fallback: `{}` ("every consumer degrades to its default"), kit label style, default exaggeration, "no
 * roster". A town whose design was missing or broken baked from kit defaults with nothing said. And they disagreed on
 * WHOSE design: some the baked Look's, some the town's home Look's — the same file only while look id = map id.
 * `cartograph/lookDesign.mjs` is now the one reader: it refuses a missing or unreadable file, and it declares which
 * fields are the town's (`TOWN_DESIGN_FIELDS`).
 *
 * Asserts:
 *   1. no file in the bake's import closure builds a design.json path except lookDesign.mjs — or a line that declares
 *      itself `@design-writer: <why>` (an authoring write, not a bake read; printed, so the exemptions stay visible);
 *   2. the reader REFUSES a missing Look, an unparseable file and a non-object, and a Look that authors a town field
 *      differently from its home Look (run against fixtures — ⛔ never against a live town's files);
 *   3. the detector itself fires on a planted read (so a pass is not vacuous).
 *
 * ⭐ READS THE SOURCE: the bake's entry scripts are lifted out of cartograph/serve.js (`join(here, '<step>.js')` and
 * `join(REPO_ROOT, 'arborist', …)`), and their closure is walked with the bake's own `importClosure` (pour-code.mjs).
 * A new bake step is covered the day it is added.
 *
 *   node checks/claims-a-bake-reads-design-through-one-reader.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const rel = (f) => path.relative(ROOT, f)
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)
console.log('\nA bake reads its design through one reader, and it refuses')

// ── 1: the bake's closure ─────────────────────────────────────────────────────
const { importClosure } = await import(path.join(ROOT, 'cartograph/pour-code.mjs'))
const serve = readFileSync(path.join(ROOT, 'cartograph/serve.js'), 'utf8')
const entries = new Set()
for (const m of serve.matchAll(/join\(here, '([\w.-]+\.m?js)'\)/g)) entries.add(path.join(ROOT, 'cartograph', m[1]))
for (const m of serve.matchAll(/join\(REPO_ROOT, 'arborist', '([\w.-]+\.m?js)'\)/g)) entries.add(path.join(ROOT, 'arborist', m[1]))
const READER = path.join(ROOT, 'cartograph/lookDesign.mjs')
const closure = importClosure([...entries])
if (entries.size < 10) bad(`only ${entries.size} bake entry scripts found in serve.js — the lift is broken, this asserts nothing`)
if (!closure.includes(READER)) bad(`the bake's closure (${closure.length} files) does not reach cartograph/lookDesign.mjs — nothing reads design through it`)

// A design path BUILT: the literal 'design.json' as a whole string, or a template/path ending in looks/…/design.json.
const BUILDS = /(['"`])design\.json\1|looks\/[^'"`\s]*design\.json['"`]/
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l)
const scan = (src) => src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => !isComment(l) && BUILDS.test(l))

// ── 3: the detector fires on a planted read (before trusting its silence) ──
const planted = "  const p = join(ROOT, 'public', 'looks', look, 'design.json')\n  const d = existsSync(p) ? JSON.parse(readFileSync(p)) : {}"
if (scan(planted).length !== 1) bad('the detector does not fire on a planted `join(…, \'design.json\')` — its silence below means nothing')
else ok('the detector fires on a planted design.json read')

const writers = []
let scanned = 0
for (const f of closure) {
  if (f === READER) continue
  let src; try { src = readFileSync(f, 'utf8') } catch { continue }
  scanned++
  for (const [n, l] of scan(src)) {
    const w = l.match(/@design-writer:\s*(.+)$/)
    if (w) writers.push(`${rel(f)}:${n} — ${w[1].trim()}`)
    else bad(`${rel(f)}:${n} reads a design.json itself — go through cartograph/lookDesign.mjs (readLookDesign / readTownDesign / readBakeDesign):\n       ${l.trim().slice(0, 140)}`)
  }
}
if (!failed) ok(`${entries.size} bake steps, ${scanned} files in their closure: no design.json read outside lookDesign.mjs`)
for (const w of writers) console.log(`  · declared writer (not a read): ${w}`)

// ── 2: the reader refuses — on fixtures, never a live town ───────────────────
const LD = await import(READER)
const refuses = (label, fn) => { try { fn(); bad(`${label}: did NOT refuse`) } catch (e) { ok(`${label}: refuses — ${e.message.split('\n')[0].slice(0, 90)}`) } }
const NO_LOOK = '__no-such-look-claims-check__'
refuses('a Look with no design.json', () => LD.readLookDesign(NO_LOOK, 'check'))
refuses('an unparseable design.json', () => LD.parseDesign('{ "terrainExag": 1.5,', 'fixture', 'check'))
refuses('a design.json that is not an object', () => LD.parseDesign('[1,2]', 'fixture', 'check'))
refuses('a second Look authoring a town field differently', () =>
  LD.townAuthoritySplit({ terrainExag: 2, palette: 'x' }, { terrainExag: 1.5 }, 'fixture-winter', 'fixture', 'check'))
try { LD.townAuthoritySplit({ terrainExag: 1.5, palette: 'x' }, { terrainExag: 1.5 }, 'fixture-winter', 'fixture', 'check'); ok('an equal copy of a town field passes (Stage\'s autosave writes them into every Look)') }
catch (e) { bad(`an equal copy of a town field was refused: ${e.message}`) }

console.log(failed ? `\n⛔ ${failed} failed\n` : '\nall held\n')
process.exit(failed ? 1 : 0)
