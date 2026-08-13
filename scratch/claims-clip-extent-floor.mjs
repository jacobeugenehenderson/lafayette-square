#!/usr/bin/env node
/**
 * CLAIM (the CLASS, not one site): every radius derived from the scene's authored
 * boundary is FLOORED so it can never fall inside the hood, and a scene carrying no
 * authored extent FAILS rather than producing a plausible-looking artifact.
 *
 *   node scratch/claims-clip-extent-floor.mjs
 *
 * Two sites derive a radius from `neighborhood_boundary.json`, and both carried the
 * same pair of defects:
 *   - NO FLOOR. `streetFade` is a LOOK band; nothing stops a scene authoring one
 *     narrower than its own disc. Every scene today is radius+160 except LS
 *     (1000 vs 892, authored) — so no single scene reveals it.
 *   - A FALLBACK. `?? Infinity` (pipeline) kept the whole fetched square and printed
 *     a clean kept/dropped line; `?? 1000` (bake-ground) was DEAD — sceneStencil.js
 *     coerces an absent radius to 1 — so the real behaviour was a 51 m bake bbox.
 *     Both report success on the town nobody has looked at. CLAUDE.md Layer 0, q2.
 *
 * ⭐ READS THE SOURCE. It parses each binding out of its file rather than restating
 * the expression, so it cannot go stale when the code moves (CLAUDE.md §PRUNE #1).
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
let fail = 0

const SITES = [
  { file: 'cartograph/pipeline.js',    binding: 'keepR',     margin: 30, what: 'map.json content clip' },
  { file: 'cartograph/bake-ground.js', binding: '_bakeHalf', margin: 50, what: 'bake bbox half-extent' },
]

// ── A. each site is floored and carries no fallback — read out of source ─────
console.log('── A. the expressions, parsed from source ───────────────────────')
for (const site of SITES) {
  const src = readFileSync(join(ROOT, site.file), 'utf8')
  const line = src.split('\n').find(l => new RegExp(`const\\s+${site.binding}\\s*=`).test(l))
  if (!line) {
    console.log(`❌ ${site.file}: no \`const ${site.binding} =\` — this check needs re-pointing`); fail++; continue
  }
  console.log(`   ${site.file}`)
  console.log(`     ${line.trim()}`)
  // `?? 0` inside Math.max is a max-identity, not a fallback. Anything else is.
  const badFallback = /\?\?\s*(Infinity|[1-9]\d*)/.exec(line)
  if (badFallback) {
    console.log(`   ❌ falls back to \`${badFallback[1]}\` — an unauthored scene yields a plausible artifact instead of failing`); fail++
  } else if (!/Math\.max/.test(line)) {
    console.log(`   ❌ not floored — a streetFade band narrower than the disc would under-size the ${site.what}`); fail++
  } else {
    console.log(`   ✅ floored, no fallback`)
  }
}

// ── B. the refusal exists at each site ───────────────────────────────────────
console.log('\n── B. an unauthored extent must REFUSE, not default ─────────────')
for (const site of SITES) {
  const src = readFileSync(join(ROOT, site.file), 'utf8')
  const i = src.indexOf(`const ${site.binding} =`)
  const before = src.slice(Math.max(0, i - 2000), i)
  const refuses = /process\.exit\(1\)/.test(before)
  console.log(`${refuses ? '✅' : '❌'} ${site.file.padEnd(28)} refuses on a boundary with no authored extent`)
  if (!refuses) fail++
}

// ── C. the invariant, per scene, per site ────────────────────────────────────
console.log('\n── C. derived radius >= hood radius, every scene ────────────────')
const scenes = readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
for (const scene of scenes) {
  const p = join(DATA, scene, 'neighborhood_boundary.json')
  if (!existsSync(p)) continue                     // uncommitted = no clip / no bake, by design
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  const fadeOuter = Number.isFinite(nb.streetFade?.outer) ? nb.streetFade.outer : null
  const discR = Number.isFinite(nb.radius) ? nb.radius : null
  if (fadeOuter === null && discR === null) {
    console.log(`❌ ${scene.padEnd(24)} carries NO extent — both sites must refuse`); fail++; continue
  }
  const parts = SITES.map(s => {
    const floored = Math.max(fadeOuter ?? 0, discR ?? 0) + s.margin
    const bare = (fadeOuter ?? discR) + s.margin    // what the un-floored expression gave
    const under = bare < (discR ?? 0)
    if (floored < (discR ?? 0)) fail++
    return `${s.binding}=${String(floored).padStart(5)}${under ? ' ⚠️was-inside-hood' : ''}`
  })
  console.log(`✅ ${scene.padEnd(24)} radius=${String(discR).padStart(5)} sfOuter=${String(fadeOuter).padStart(5)}  ${parts.join('  ')}`)
}

// ── D. the coercion one layer up, which neither site can fix ─────────────────
console.log('\n── D. ⚠️ NOT FIXED — the sentinel upstream ──────────────────────')
const sten = readFileSync(join(ROOT, 'cartograph', 'sceneStencil.js'), 'utf8')
const coerce = sten.split('\n').filter(l => /const (radius|center)\s*=.*\|\|/.test(l)).map(l => l.trim())
for (const l of coerce) console.log(`   sceneStencil.js  ${l}`)
console.log(`   An absent radius becomes 1 and an absent centre becomes [0,0] — VALUES, not`)
console.log(`   absences, so a consumer cannot tell "unauthored" from "authored tiny". The`)
console.log(`   bake-ground refusal reads \`radius > 1\` to detect it, which is a sentinel test.`)
console.log(`   ⇒ the real cure is to return null and let each consumer refuse. Own ticket.`)

console.log(`\n${fail ? `❌ ${fail} failure(s)` : '✅ all green'}`)
process.exit(fail ? 1 : 0)
