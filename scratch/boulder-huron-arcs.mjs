/**
 * boulder-huron-arcs.mjs — WHAT A REAL SHORELINE DOES TO THE BOULDER GEOMETRY.
 * ▶ node scratch/boulder-huron-arcs.mjs
 *
 * ⛔ Reads artifacts only. Nothing bakes, nothing writes.
 * ⭐ A CHECK, not a screenshot: every failure below is named and counted, because
 * the visual channel misled this probe repeatedly and a program log does not.
 *
 * It answers, per arc: does the drape build · does it self-intersect on tight
 * bends · do the chunk seams stay exact · what does the armour predicate say ·
 * and do stones from two different arcs land inside each other where arcs touch.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadHuronShore, profileArc, crestFn, bandFolds, arcFaces } from '../src/harness/boulders/huron.js'
import { revetmentDrape } from '../src/lib/revetmentDrape.js'
import { shoreContext, chunkStones, verifySeams, CHUNK_M } from '../src/harness/boulders/chunked.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const local = (url) => path.join(ROOT, url.startsWith('/baked') ? 'public' + url : url.replace(/^\//, ''))
const fetcher = {
  json: async (url) => JSON.parse(fs.readFileSync(local(url), 'utf8')),
  bin: async (url) => { const b = fs.readFileSync(local(url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
}

const { arcs, elevAt, armourAt } = await loadHuronShore({ fetcher })
console.log(`\n${arcs.length} unique __water__ arcs · ${(arcs.reduce((s, a) => s + a.len, 0) / 1000).toFixed(2)} km total\n`)

const hdr = ['arc', 'verts', 'len m', 'side', 'flip?', 'crest p50', 'p90', 'max', 'armoured m', 'drape', 'tris', 'seams']
console.log(hdr.map((h, i) => h.padStart([4, 6, 8, 6, 6, 10, 6, 6, 13, 14, 8, 7][i])).join(''))

const results = []
for (const arc of arcs) {
  const prof = profileArc(arc, elevAt, armourAt)
  const crest = crestFn(prof)
  const sorted = [...prof.crest].sort((a, b) => a - b)
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const armoured = prof.armour.reduce((s, v) => s + v, 0)
  // ⭐ ARMOURED **LENGTH**, not vertex share. ⛔ A per-vertex percentage measures the
  // SAMPLING as much as the shore — it moved from 48% to 26% on arc #13 purely
  // because the arc was resampled — so it is not comparable across any change to the
  // polyline. Length is sampling-independent and is the only honest denominator.
  const poly0 = arcFaces(arc)[0]
  let armLen = 0, totLen = 0
  for (let i = 1; i < poly0.length; i++) {
    const d = Math.hypot(poly0[i].x - poly0[i - 1].x, poly0[i].z - poly0[i - 1].z)
    totLen += d
    if (prof.armour[i] && prof.armour[i - 1]) armLen += d
    else if (prof.armour[i] || prof.armour[i - 1]) armLen += d / 2
  }
  const armPct = totLen ? (100 * armLen) / totLen : 0

  let drape = 'ok', tris = 0, selfInt = 0
  try {
    const d = revetmentDrape({ poly: arc.flip ? [...arc.poly].reverse() : arc.poly, crestAt: crest, octaves: 3 })
    tris = d.stats.tris
    if (tris === 0) drape = 'EMPTY'
    else selfInt = d.stats.downwardPct > 12 ? 1 : 0
    // A ribbon that folds through itself on a tight inside bend shows up as a
    // spike in downward-facing area — the band overlapping its own toe.
    if (selfInt) drape = `FOLDED ${d.stats.downwardPct.toFixed(0)}% down`
  } catch (e) { drape = 'THREW: ' + e.message.slice(0, 28) }

  let seams = '—'
  if (arc.len > CHUNK_M * 3 && armoured > 2) {
    const ctx = shoreContext({ poly: arc.flip ? [...arc.poly].reverse() : arc.poly, crestAt: crest, oversample: 10 })
    const v = verifySeams(ctx, 2)
    seams = v.checked === 0 ? 'n/a' : (v.missing + v.moved === 0 ? 'exact' : `${v.missing + v.moved} BAD`)
  }

  results.push({ arc, prof, crest, armPct, tris })
  console.log([
    '#' + arc.id, arc.verts, arc.len.toFixed(0), arc.twoFaced ? 'BOTH' : arc.sides.join('/'), arc.flip ? 'yes' : 'no',
    q(0.5).toFixed(2), q(0.9).toFixed(2), sorted[sorted.length - 1].toFixed(2),
`${armLen.toFixed(0)}m ${armPct.toFixed(0)}%`, drape, tris, seams,
  ].map((v, i) => String(v).padStart([4, 6, 8, 6, 6, 10, 6, 6, 13, 14, 8, 7][i])).join(''))
}

// ⭐ DOES THE BAND FOLD? ▶ `bandFolds` — local feature size vs offset distance, in
// metres. The old min-turn-radius test reported the raw trace's jitter; see the
// corrected note at that symbol for why, and for what NOT to generalise from it.
console.log('\nBAND SELF-OVERLAP — the fold test, in metres (sample-independent)')
const TAN35 = Math.tan(35 * Math.PI / 180)
let folding = 0, live = 0
for (const { arc, prof } of results) {
  if (arc.refused || arc.poly.length < 3) continue
  live++
  const poly = arc.flip ? [...arc.poly].reverse() : arc.poly
  const band = (i) => (prof.armour[i] ? prof.crest[i] / TAN35 : 0)
  const f = bandFolds(poly, band)
  let maxBand = 0
  for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i]) maxBand = Math.max(maxBand, prof.crest[i] / TAN35)
  if (f.folds) folding++
  console.log(`  arc #${String(arc.id).padStart(2)}  widest band ${maxBand.toFixed(1).padStart(5)} m   ` +
    (f.folds ? `⛔ FOLDS — ${f.pairs} overlapping pairs, worst ${f.worst.toFixed(1)} m deep` : 'clear'))
}
console.log(`  ⇒ ${folding} / ${live} ruled arcs fold`)

// ⭐ DO ARCS COLLIDE? Where two arcs nearly touch (a river mouth, a harbour throat)
// both will place stone and the two heaps can occupy the same metre.
console.log('\nINTER-ARC PROXIMITY — where two arcs run within one armour stone of each other')
const STONE = 1.5
let pairs = 0
for (let i = 0; i < arcs.length; i++) for (let j = i + 1; j < arcs.length; j++) {
  let near = 0
  for (const p of arcs[i].poly) {
    for (const qq of arcs[j].poly) {
      if (Math.abs(p.x - qq.x) < STONE && Math.abs(p.z - qq.z) < STONE) { near++; break }
    }
  }
  if (near) { console.log(`  arc #${i} × arc #${j}: ${near} vertices within ${STONE} m`); pairs++ }
}
if (!pairs) console.log('  none')
console.log('')
