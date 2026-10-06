#!/usr/bin/env node
// claims-the-pour-reads-the-towns-norm.mjs — DOES A TOWN'S AUTHORED NORM REACH ITS MAP?
//
// ⭐ THE INVARIANT: a norm a town writes in `cartograph/data/<scene>/norms.json` is the norm the pour freezes. The
// instance (2026-10-06, `BRIEF-corner-ramps-and-kerb §3` step 0): `resolveRampNorm` resolved its data root against the
// CALLER's working directory; the pour runs derive.js from cartograph/, found no file, and froze 'none (kit)' for LS
// without a word — while every check, run from the repo root, read diagonal. So this check resolves the way the POUR
// does: in a child process whose cwd is cartograph/, exactly as serve.js spawns it.
//
// ⛔ FAILS when:
//   (a) a scene's norms.json sets `ramps` / `crosswalks` and the pour-side resolver does not return it from rung 'scene'
//   (b) a scene with no data directory resolves at all (it must THROW — a wrong name is never "no norm")
//   (c) a town's FROZEN `rampNorm` (public/baked/<town>/shape.json) differs from what the resolver gives now —
//       STALE: the town is owed a re-pour. True state, printed red with its cure.
// The norms are READ from each norms.json, never restated here.
//
//   node checks/claims-the-pour-reads-the-towns-norm.mjs
// Read-only.
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARTO = join(ROOT, 'cartograph')
const DATA = join(CARTO, 'data')
const scenes = readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()

// one child, cwd = cartograph/, importing the resolver the way derive.js does (state from sources.js#readSources)
const probe = `
  import { resolveRampNorm } from './ramp-norm.mjs'
  import { readSources } from './sources.js'
  const out = {}
  for (const s of ${JSON.stringify(scenes)}) {
    try { const src = readSources(s); out[s] = { norm: resolveRampNorm(s, src.declared ? src.state : null) } }
    catch (e) { out[s] = { error: e.message } }
  }
  try { resolveRampNorm('__no_such_scene__', null); out.__missing = { threw: false } } catch { out.__missing = { threw: true } }
  console.log('@@' + JSON.stringify(out))
`
const raw = execFileSync(process.execPath, ['--input-type=module', '-e', probe],
  { cwd: CARTO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const got = JSON.parse(raw.split('\n').find(l => l.startsWith('@@')).slice(2))

let bad = 0, stale = 0
const fail = (m) => { bad++; console.log(`  ⛔ ${m}`) }

console.log('(a) an authored norm reaches the pour-side resolver (cwd = cartograph/)')
for (const s of scenes) {
  const p = join(DATA, s, 'norms.json')
  if (!existsSync(p)) continue
  const j = JSON.parse(readFileSync(p, 'utf8'))
  const r = got[s]
  if (r.error) { fail(`${s}: resolver threw — ${r.error}`); continue }
  for (const [kind, n] of [['ramps', r.norm], ['crosswalks', r.norm.crosswalks]]) {
    if (!j[kind]) continue
    if (n.source !== 'scene' || n.style !== j[kind].style) fail(`${s}: norms.json ${kind} = ${j[kind].style}, the pour reads ${n.style} from ${n.source}`)
    else console.log(`  ✅ ${s}: ${kind} ${n.style} from scene`)
  }
}

console.log('(b) a scene with no data directory throws')
if (got.__missing.threw) console.log('  ✅ __no_such_scene__ threw')
else fail('__no_such_scene__ resolved silently — a wrong name reads as "no norm"')

console.log('(c) the frozen norm is the norm the resolver gives now')
const strip = (n) => JSON.stringify(n, Object.keys(n ?? {}).sort())
for (const s of scenes) {
  const f = join(ROOT, 'public', 'baked', s, 'shape.json')
  if (!existsSync(f) || got[s].error) { if (got[s].error) fail(`${s}: resolver threw — ${got[s].error}`); continue }
  const sh = JSON.parse(readFileSync(f, 'utf8'))
  const tiles = Array.isArray(sh.tiles ?? sh) ? (sh.tiles ?? sh) : Object.values(sh.tiles ?? sh)
  const frozen = tiles.find(t => t?.rampNorm)?.rampNorm ?? null
  const now = got[s].norm
  if (!frozen) { stale++; console.log(`  🟥 ${s}: no frozen rampNorm — poured before the norm was frozen. STALE: re-pour owed`); continue }
  const same = strip(frozen) === strip(now) && strip(frozen.crosswalks) === strip(now.crosswalks)
  if (same) console.log(`  ✅ ${s}: ${frozen.style} (${frozen.source})`)
  else { stale++; console.log(`  🟥 ${s}: frozen ${frozen.style} (${frozen.source}), resolver now ${now.style} (${now.source}). STALE: re-pour owed`) }
}

if (bad) console.log(`⛔ ${bad} wrong — a town's norm does not reach its pour`)
else if (stale) console.log(`🟥 the resolver is sound; ${stale} town(s) owe a re-pour to freeze it`)
else console.log('✅ every town\'s authored norm reaches its pour, and every frozen norm is current')
process.exit(bad || stale ? 1 : 0)
