#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// A03 ACCEPTANCE — the curb refactor must be BYTE-IDENTICAL.
//
// A03 changes WHERE and WHEN the curb is computed, never HOW it is drawn
// (HANDOFF §3). So the gate is identity, not quality: hash the frozen shape
// artifact + the rendered geometry, with the scene's AUTHORED state loaded
// (CLAUDE.md Layer 0 q3 — a bare-defaults measurement measures the wrong map).
//
//   node scratch/a03-curb-identity.mjs --save baseline
//   ...refactor...
//   node scratch/a03-curb-identity.mjs --against baseline
// ───────────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const args = process.argv.slice(2)
const save = args.includes('--save') ? args[args.indexOf('--save') + 1] : null
const against = args.includes('--against') ? args[args.indexOf('--against') + 1] : null
const SCENE = 'lafayette-square', LOOK = 'lafayette-square'

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, `public/looks/${LOOK}/design.json`), 'utf8'))

// Both states matter: the AUTHORED map is what ships; bare defaults is what a
// fresh pour of an uninspected town gets. A refactor must be identical on both.
const STATES = [
  ['authored', design.blockCustoms || {}],
  ['defaults', null],
]
const round = (v) => (typeof v === 'number' ? +v.toFixed(6) : v)
const canon = (o) => JSON.stringify(o, (k, v) => round(v))
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

// ── DECLARED ARTIFACT ADDITIONS ─────────────────────────────────────────────
// This gate's contract is IDENTITY: no curb may move. But when a change's whole
// DELIVERABLE is a new key in the frozen artifact, `artifact` cannot not move —
// and a gate that reads correct work as failure trains people to wave it through,
// which is worse than no gate. So the `artifact` hash is taken with DECLARED new
// keys stripped, exactly A07's precedent (it did this for producer/producerReason).
//
// ⛔ DECLARED, never "ignore unknown keys". An undeclared key still moves the hash
// and still fails — that is the point. Adding a line here is a deliberate act with
// a commit behind it, not a silent tolerance that grows forever.
//
// ⭐ AND THE LIST CANNOT ROT: every entry must actually be PRESENT in the current
// artifact or this gate FAILS. A strip list that outlives its key is a permanent
// blind spot — it would silently forgive a future key that happened to reuse the
// name. (Same declare-or-refuse pattern as claims-look-seed-scene-clean.mjs.)
const ARTIFACT_NEW_KEYS = [
  { key: 'iaEdge',       since: '52008afa', why: 'A10 ③ — per-iA-vertex source ring-edge index' },
  { key: 'iaEdgeReason', since: '52008afa', why: 'A10 ③ — why a tile is unstamped; always one of the pair' },
]
const STRIP = new Set(ARTIFACT_NEW_KEYS.map(d => d.key))
const stripDeclared = (t) => {
  if (!t || typeof t !== 'object') return t
  const o = {}
  for (const k of Object.keys(t)) if (!STRIP.has(k)) o[k] = t[k]
  return o
}

const out = {}
for (const [label, blockCustoms] of STATES) {
  const pr = buildTileGround(ribbons, {
    stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
    cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
    blockCustoms, emitArtifact: true,
  })
  const tiles = pr._shapeArtifact || []
  // per-tile iA hash — so a diff names the TILE, not just "something moved"
  const perTile = tiles.map((t, i) => ({ i, iA: h(canon(t?.iA ?? null)), ring: h(canon(t?.ring ?? null)) }))
  // declare-or-refuse: a declared key that is no longer emitted means this list
  // has rotted into a blind spot. Fail here, not silently three months from now.
  for (const d of ARTIFACT_NEW_KEYS) {
    if (!tiles.some(t => t && Object.prototype.hasOwnProperty.call(t, d.key))) {
      console.error(`⛔ ARTIFACT_NEW_KEYS declares "${d.key}" (${d.since}) but NO tile carries it in state "${label}".`)
      console.error(`   The strip list has rotted — it is now forgiving a key that does not exist. Remove the entry or fix the emitter.`)
      process.exit(2)
    }
  }
  out[label] = {
    tileCount: tiles.length,
    iAAll: h(canon(tiles.map(t => t?.iA ?? null))),
    artifact: h(canon(tiles.map(stripDeclared))),   // ⭐ GATED — declared keys stripped
    artifactRaw: h(canon(tiles)),                   // informational: moves whenever a declared key changes
    block: h(canon(pr.block)), curb: h(canon(pr.curb)), asphalt: h(canon(pr.asphalt)),
    sidewalk: h(canon(pr.sidewalk)), fillets: h(canon(pr.cornerFillets)),
    perTile,
  }
}

if (save) {
  fs.writeFileSync(path.join(ROOT, `scratch/.a03-${save}.json`), JSON.stringify(out))
  console.log(`saved baseline "${save}"`)
  for (const [l, v] of Object.entries(out)) console.log(`  ${l}: ${v.tileCount} tiles  iA=${v.iAAll}  artifact=${v.artifact}`)
  process.exit(0)
}
if (!against) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

const base = JSON.parse(fs.readFileSync(path.join(ROOT, `scratch/.a03-${against}.json`), 'utf8'))
let bad = 0
for (const label of Object.keys(out)) {
  const a = base[label], b = out[label]
  console.log(`\n── ${label} ──`)
  for (const k of ['tileCount', 'iAAll', 'artifact', 'block', 'curb', 'asphalt', 'sidewalk', 'fillets']) {
    const same = JSON.stringify(a?.[k]) === JSON.stringify(b[k])
    if (!same) bad++
    console.log(`  ${same ? '✅' : '❌'} ${k.padEnd(10)} ${same ? 'identical' : `${a?.[k]} → ${b[k]}`}`)
  }
  // Informational, NOT gated: the whole-artifact hash including declared new keys.
  // It SHOULD move when a declared key lands — that is the deliverable, not a
  // regression. Printed so the addition stays visible instead of invisible.
  if (a?.artifactRaw !== undefined || b.artifactRaw !== undefined) {
    const rawSame = a?.artifactRaw === b.artifactRaw
    console.log(`  ${rawSame ? '·' : 'ℹ'}  ${'artifactRaw'.padEnd(10)} ${rawSame ? 'identical' : `${a?.artifactRaw ?? '(pre-strip baseline)'} → ${b.artifactRaw}`}  — not gated; declared keys: ${ARTIFACT_NEW_KEYS.map(d => d.key).join(', ')}`)
  }
  const moved = (b.perTile || []).filter((t, i) => a?.perTile?.[i]?.iA !== t.iA)
  if (moved.length) console.log(`  ❌ ${moved.length} tile(s) whose iA changed: ${moved.slice(0, 20).map(t => t.i).join(', ')}${moved.length > 20 ? ' …' : ''}`)
}
console.log(bad ? `\n❌ NOT byte-identical — ${bad} hash(es) moved. A03's contract is identity; investigate before proceeding.`
                : `\n✅ BYTE-IDENTICAL on both authored and bare-defaults state.`)
process.exit(bad ? 1 : 0)
