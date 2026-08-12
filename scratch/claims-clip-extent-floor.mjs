#!/usr/bin/env node
/**
 * CLAIM: the boundary clip's keepR is a CONTENT extent that can never reach inside
 * the hood, and a scene that carries no extent at all FAILS rather than clipping
 * nothing and reporting success.
 *
 *   node scratch/claims-clip-extent-floor.mjs
 *
 * ⭐ READS THE SOURCE — it parses keepR out of pipeline.js rather than restating it,
 * so it cannot go stale when the expression moves (CLAUDE.md §PRUNE rule 1).
 *
 * Two assertions:
 *   A. pipeline.js carries no `?? Infinity` fallback on the clip extent.
 *   B. for every scene carrying a neighborhood_boundary.json, keepR >= radius —
 *      i.e. the clip cannot cut the neighborhood's own streets.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
let fail = 0

// ── A. no silent fallback, read out of the source ─────────────────────────────
const src = readFileSync(join(ROOT, 'cartograph', 'pipeline.js'), 'utf8')
const keepRLine = src.split('\n').find(l => /const keepR\s*=/.test(l))
if (!keepRLine) { console.log('❌ A. no `const keepR =` found in pipeline.js — this check needs re-pointing'); fail++ }
else {
  console.log(`   pipeline.js keepR := ${keepRLine.trim()}`)
  if (/Infinity/.test(keepRLine)) { console.log('❌ A. keepR falls back to Infinity — a scene with no extent clips nothing and reports success'); fail++ }
  else if (!/Math\.max/.test(keepRLine)) { console.log('❌ A. keepR is not floored — a streetFade band narrower than the disc would clip inside the hood'); fail++ }
  else console.log('✅ A. keepR is floored and carries no Infinity fallback')
}

// ── B. the invariant, per scene ───────────────────────────────────────────────
console.log('')
const scenes = readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
for (const scene of scenes) {
  const p = join(DATA, scene, 'neighborhood_boundary.json')
  if (!existsSync(p)) continue                     // uncommitted = no clip, by design
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  const fadeOuter = Number.isFinite(nb.streetFade?.outer) ? nb.streetFade.outer : null
  const discR = Number.isFinite(nb.radius) ? nb.radius : null
  if (fadeOuter === null && discR === null) {
    console.log(`❌ ${scene.padEnd(24)} carries NO extent (no streetFade.outer, no radius) — the pour must refuse`)
    fail++; continue
  }
  const keepR = Math.max(fadeOuter ?? 0, discR ?? 0) + 30
  const ok = discR === null || keepR >= discR
  const bare = (fadeOuter ?? discR) + 30           // what the un-floored expression gave
  const note = bare < (discR ?? 0) ? `  ⚠️ un-floored keepR ${bare} would have cut INSIDE the hood` : ''
  console.log(`${ok ? '✅' : '❌'} ${scene.padEnd(24)} radius=${String(discR).padStart(5)} streetFade.outer=${String(fadeOuter).padStart(5)} keepR=${String(keepR).padStart(5)}${note}`)
  if (!ok) fail++
}

console.log(`\n${fail ? `❌ ${fail} failure(s)` : '✅ all green'}`)
process.exit(fail ? 1 : 0)
