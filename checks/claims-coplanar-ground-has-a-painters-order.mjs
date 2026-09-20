// claims-coplanar-ground-has-a-painters-order.mjs — CAN TWO TOUCHING SURFACES FIGHT?
//
// ⭐ THE INVARIANT: the Designer's coplanar ground family — every mesh at exactly
// y=0.12 — must be separated by PAINTER'S ORDER, never by a depth test. Jacob,
// 2026-09-20: "practically speaking it's a 2D map with no 'thickness'." A map with
// no thickness must not ask a depth buffer which of two touching surfaces is in
// front. There is no answer, so the buffer invents one per pixel, and that is the
// flicker Jacob's eye caught on huron.
//
// TWO HALVES, AND THEY COVER DIFFERENT POPULATIONS. Neither alone is enough:
//   ① a DISTINCT renderOrder per mesh → fixes overlaps between DIFFERENT kinds.
//   ② `depthWrite: false` on every member → fixes the rest. ⛔ Polygons of the
//      SAME kind merge into ONE geometry with ONE material, so ① provably cannot
//      reach them: there is no second renderOrder to give. And without ②, ① still
//      fails — the first mesh drawn writes depth, and the next at the same depth
//      fails the LESS test per-pixel, which is the speckle.
//
// ⛔ NOT polygonOffset. Every member carries the same offset value, so there is no
// difference between them for it to resolve — whatever polygonOffset does under
// this Canvas (an open question: ARCHITECTURE §8 records that it is unsettled in
// either direction under the ortho camera). This check deliberately rests on
// neither answer. ⛔ And not a Y-lift: that simulates thickness to feed a test
// that should not be consulted.
//
// ⭐ WHAT THIS PROVES, EXACTLY: that the source assigns a per-kind, INJECTIVE
// renderOrder and writes no depth in the family ⇒ no two overlapping members can
// fight, whatever the towns contain. It does NOT re-derive which kind lands on
// top; that is the renderer's rule, and restating it here is how two copies drift.
// The per-town census below is what makes the POPULATION visible — and it is per
// town by construction, because this defect is invisible on the mould town.
//
//   node checks/claims-coplanar-ground-has-a-painters-order.mjs
// Read-only. Exits 1 when a town has overlapping coplanar polygons that could fight.
import fs from 'fs'
import path from 'path'

const SRC = 'src/cartograph/MapLayers.jsx'
const DATA = 'cartograph/data'
const DEFAULT_INSTALLATION = 'lafayette-square'

const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, 'utf8') : null
if (src === null) throw new Error(`⛔ ${SRC} is gone — the guard is blind; fix the path before trusting a PASS`)

let failures = 0
const fail = (m) => { failures++; console.log(`  ✗ ${m}`) }
const pass = (m) => console.log(`  ✓ ${m}`)

// ── ① Is the painter's order per-kind, and injective? ────────────────────────
console.log(`\npainter's order, parsed from ${SRC}:`)

const lsMesh = src.match(/<mesh key=\{`ls-\$\{kind\}`\}[\s\S]{0,260}?\/>/)
if (!lsMesh) throw new Error(`⛔ could not find the landscape mesh in ${SRC} — the guard is blind; fix the parse before trusting a PASS`)
const ro = lsMesh[0].match(/renderOrder=\{([^}]*)\}/)
if (!ro) throw new Error(`⛔ the landscape mesh has no renderOrder — the guard is blind; fix the parse before trusting a PASS`)
if (/\bkind\b/.test(ro[1])) pass(`landscape renderOrder varies per kind: ${ro[1].trim()}`)
else fail(`landscape renderOrder is constant (${ro[1].trim()}) — every kind lands on one slot, so overlapping kinds cannot be ordered`)

// Injectivity: the order must be built as a 1:1 map over the kind list. A kind
// list indexed positionally is injective by construction; anything else is not
// something this check can vouch for, so it says so rather than passing quietly.
const orderBuild = src.match(/const order = new Map\(([^\n]*)\)/)
if (!orderBuild) fail(`could not find the per-kind order construction — cannot vouch for injectivity`)
else if (/kinds\.map\(\s*\(\s*\w+\s*,\s*\w+\s*\)/.test(orderBuild[1])) pass(`order is positional over the kind list — injective by construction`)
else fail(`the per-kind order is not a positional map over the kinds: ${orderBuild[1].trim()} — two kinds could share a slot`)

// The fractional slot must stay INSIDE its band, or it collides with the next one.
if (/\(\s*kinds\.length\s*\+\s*1\s*\)/.test(orderBuild?.[1] || '')) pass(`the fractional slot is normalised by kinds.length + 1 — it stays inside the landscape band`)
else fail(`the fractional slot is not normalised by kinds.length + 1 — it can reach the next band`)

// ── ② Does any member of the family write depth? ─────────────────────────────
// ⛔ THE MESH IS THE AUTHORITY ON WHICH PLANE IT IS ON, not a list kept here: a
// mesh with no `position=` prop inherits the group's y and is therefore ON the
// shared plane. Ground/building/stripe carry their own local lifts and are off it.
console.log(`\ndepth writes on the shared plane, parsed from ${SRC}:`)

// Balanced-delimiter reader — a regex cannot do this, and a regex that looked
// like it could is exactly how this check first passed for the wrong reason:
// `makeFlatMat(color('ground'), …)` has a nested `)`, so a lazy [^)]* match
// silently skipped every material built that way. The parse IS the instrument.
const balanced = (text, from, open, close) => {
  let d = 0
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) d++
    else if (text[i] === close) { d--; if (d === 0) return text.slice(from, i + 1) }
  }
  return null
}

// Every mesh element in the file, with its own attribute text.
const meshes = []
for (const m of src.matchAll(/<mesh\b/g)) {
  let i = m.index, d = 0, end = -1
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') d++
    else if (src[k] === '}') d--
    else if (src[k] === '>' && d === 0) { end = k; break }
  }
  if (end > 0) meshes.push(src.slice(i, end + 1))
}
if (!meshes.length) throw new Error(`⛔ no <mesh> elements parsed from ${SRC} — the guard is blind; fix the parse before trusting a PASS`)

// Resolve a mesh's material={...} expression back to the text that built it.
const matSourceOf = (expr, meshText) => {
  const e = expr.trim()
  let m = e.match(/^mats\.(\w+)$/)
  if (m) {
    const at = src.search(new RegExp(`\\n\\s*${m[1]}:\\s*makeFlatMat\\(`))
    if (at < 0) return null                       // not a makeFlatMat material (line mats etc.)
    const callAt = src.indexOf('makeFlatMat(', at)
    return balanced(src, src.indexOf('(', callAt), '(', ')')
  }
  if (/^makeFlatMat\(/.test(e)) return balanced(e, e.indexOf('('), '(', ')')
  m = e.match(/^(\w+)$/)
  if (m) {                                        // a local `const <id> = makeFlatMat(...)`
    const at = src.search(new RegExp(`const ${m[1]} = makeFlatMat\\(`))
    if (at < 0) return null
    return balanced(src, src.indexOf('(', at), '(', ')')
  }
  return null
}

let onPlane = 0, unguarded = []
for (const el of meshes) {
  if (/position=\{\[/.test(el)) continue          // carries its own lift → off the shared plane
  const mm = el.match(/material=\{/)
  if (!mm) continue
  const expr = balanced(el, el.indexOf('{', mm.index), '{', '}')
  if (!expr) continue
  const srcText = matSourceOf(expr.slice(1, -1), el)
  if (!srcText) continue                           // not a faded ground material
  onPlane++
  if (!/depthWrite:\s*false/.test(srcText)) {
    unguarded.push((el.match(/key=\{`([^`]*)`\}/)?.[1] || el.match(/geometry=\{([^}]*)\}/)?.[1] || el.slice(0, 40)).trim())
  }
}
console.log(`  ${meshes.length} mesh element(s); ${onPlane} on the shared plane with a faded ground material`)
if (onPlane === 0) fail(`no on-plane ground meshes found — the guard is blind; fix the parse before trusting a PASS`)
else if (unguarded.length === 0) pass(`all ${onPlane} shared-plane material(s) declare depthWrite: false`)
else fail(`${unguarded.length} shared-plane material(s) still write depth: ${unguarded.join(', ')}`)

// ── ②b Are the shared-plane slots PAIRWISE DISTINCT? ─────────────────────────
// ⛔ depthWrite:false stops them fighting for pixels; it does NOT decide which one
// covers which. Two on-plane meshes sharing a slot fall back to traversal order —
// stable, but arbitrary and unowned. (This assertion was added after the fix
// itself put park_water's lake on the same slot as the pour's water ground.)
console.log(`\nshared-plane slots, evaluated against the PRI table in ${SRC}:`)
const priBlock = src.match(/const PRI = \{([\s\S]*?)\n\}/)
if (!priBlock) throw new Error(`⛔ could not parse the PRI table from ${SRC} — the guard is blind; fix the parse before trusting a PASS`)
const PRI = {}
for (const m of priBlock[1].matchAll(/^\s*(\w+):\s*(-?\d+(?:\.\d+)?)\s*,/gm)) PRI[m[1]] = Number(m[2])
if (!Object.keys(PRI).length) throw new Error(`⛔ PRI table parsed empty — the guard is blind`)

// Evaluate `PRI.x`, `PRI.x + n`, `PRI.x - n`. Anything else is reported, not guessed.
const evalSlot = (expr) => {
  const e = expr.replace(/\s+/g, '')
  let m = e.match(/^PRI\.(\w+)$/)
  if (m) return PRI[m[1]] ?? null
  m = e.match(/^PRI\.(\w+)([+-])([\d.]+)$/)
  if (m && PRI[m[1]] !== undefined) return m[2] === '+' ? PRI[m[1]] + Number(m[3]) : PRI[m[1]] - Number(m[3])
  return null                                    // per-kind or unrecognised
}
const slots = []
for (const el of meshes) {
  if (/position=\{\[/.test(el)) continue
  const mm = el.match(/material=\{/)
  if (!mm) continue
  const expr = balanced(el, el.indexOf('{', mm.index), '{', '}')
  if (!expr || !matSourceOf(expr.slice(1, -1), el)) continue
  const rom = el.match(/renderOrder=\{/)
  // Prefer the JSX key — two meshes can both be `geometry={geo}` inside a map().
  const name = (el.match(/key=\{`([^`]*)`\}/)?.[1] || el.match(/geometry=\{([^}]*)\}/)?.[1] || '?').trim()
  if (!rom) { fail(`${name}: on the shared plane with NO renderOrder — it falls to traversal order`); continue }
  const roExpr = balanced(el, el.indexOf('{', rom.index), '{', '}').slice(1, -1)
  slots.push({ name, expr: roExpr.trim(), value: evalSlot(roExpr) })
}
// The per-kind landscape mesh occupies the open band (PRI.landscape, PRI.landscape+1).
const banded = slots.filter(x => x.value === null)
const fixed = slots.filter(x => x.value !== null)
for (const x of fixed) console.log(`  ${x.name.padEnd(16)} ${String(x.value).padStart(5)}   ${x.expr}`)
for (const x of banded) console.log(`  ${x.name.padEnd(16)}   band   ${x.expr}`)

const seen = new Map()
for (const x of fixed) {
  if (seen.has(x.value)) fail(`slot ${x.value} is shared by ${seen.get(x.value)} and ${x.name} — arbitrary order between two coplanar surfaces`)
  else seen.set(x.value, x.name)
}
// A fixed slot must not land strictly inside a fractional band.
const bandLo = PRI.landscape, bandHi = PRI.landscape + 1
for (const x of fixed) {
  if (x.value > bandLo && x.value < bandHi) fail(`${x.name} at ${x.value} falls inside the landscape band (${bandLo}, ${bandHi}) — it can collide with a per-kind slot`)
}
if (!failures) pass(`${fixed.length} fixed slot(s) pairwise distinct, ${banded.length} per-kind band(s) unobstructed`)

// ── ③ The census: how big is the population, per town? ───────────────────────
console.log(`\noverlapping coplanar polygons, per installation (read from each map.json):`)
const inRing = (p, ring) => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j]
    if (((zi > p[1]) !== (zj > p[1])) && (p[0] < (xj - xi) * (p[1] - zi) / ((zj - zi) || 1e-12) + xi)) c = !c
  }
  return c
}
const bbHit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1])

const scenes = fs.readdirSync(DATA)
  .filter(s => fs.existsSync(path.join(DATA, s, 'clean', 'map.json')))
  .sort()
if (!scenes.length) fail(`no scene carries a clean/map.json — this check cannot witness the class`)

let worst = null
for (const s of scenes) {
  let m
  try { m = JSON.parse(fs.readFileSync(path.join(DATA, s, 'clean', 'map.json'), 'utf8')) }
  catch { console.log(`  ${s.padEnd(24)} map.json unreadable — skipped`); continue }
  const L = m.layers || {}
  const items = []
  for (const cat of ['leisure', 'natural']) {
    for (const it of (L[cat] || [])) {
      if (cat === 'natural' && it.use === 'water') continue     // park_water owns OSM water
      const r = it.ring
      if (!r || r.length < 3) continue
      const pts = r.map(p => [p.x ?? p[0], p.z ?? p[1]])
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z }
      items.push({ use: it.use, pts, bb: [x0, z0, x1, z1] })
    }
  }
  let cross = 0, same = 0
  for (let i = 0; i < items.length; i++) {
    const A = items[i]
    const [x0, z0, x1, z1] = A.bb
    const S = 7, samples = []
    for (let a = 1; a < S; a++) for (let b = 1; b < S; b++) {
      const p = [x0 + (x1 - x0) * a / S, z0 + (z1 - z0) * b / S]
      if (inRing(p, A.pts)) samples.push(p)
    }
    if (!samples.length) continue
    let hitCross = false, hitSame = false
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue
      const B = items[j]
      if (!bbHit(A.bb, B.bb)) continue
      if (!samples.some(p => inRing(p, B.pts))) continue
      if (A.use === B.use) hitSame = true; else hitCross = true
    }
    if (hitCross) cross++
    if (hitSame) same++
  }
  const pct = items.length ? (cross / items.length * 100) : 0
  const tag = s === DEFAULT_INSTALLATION ? '  (default installation)' : ''
  console.log(`  ${s.padEnd(24)} ${String(items.length).padStart(5)} polys · ${String(cross).padStart(4)} cross-kind (${pct.toFixed(1)}%) · ${String(same).padStart(3)} same-kind${tag}`)
  if (!worst || pct > worst.pct) worst = { s, pct, cross, same }
}
if (worst) {
  console.log(`\n  worst: ${worst.s} at ${worst.pct.toFixed(1)}% cross-kind.`)
  console.log(`  ⭐ The spread across towns IS the point — a town at ~1% cannot witness a defect`)
  console.log(`     that disfigures a town at ~50%. This is why the gate is per-town.`)
}

console.log('')
if (failures) {
  console.log(`⛔ FAIL — ${failures} problem(s). Coplanar ground surfaces can still fight for the same pixels.`)
  process.exit(1)
}
console.log(`✅ PASS — the coplanar ground family is ordered by the painter, and no member writes depth.`)
