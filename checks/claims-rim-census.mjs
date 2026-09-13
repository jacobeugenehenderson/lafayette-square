#!/usr/bin/env node
/**
 * THE RIM CENSUS — what `pipeline.js`'s boundary clip costs, per scene. READ-ONLY.
 *
 *   node checks/claims-rim-census.mjs [scene ...]
 *
 * Every number here is re-derived from data on disk. Nothing is quoted from a doc.
 * The script READS `cartograph/pipeline.js` and `src/lib/tileGround.js` for the
 * expressions it depends on and REFUSES LOUDLY if they have drifted, so it cannot
 * go stale silently.
 *
 * ⛔ NO FALLBACK: a scene missing an input is named and skipped, never defaulted.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const J = p => JSON.parse(R(p))
const has = p => fs.existsSync(path.join(ROOT, p))
const o = console.log
const f1 = n => n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const MB = b => (b / 1048576).toFixed(1) + ' MB'

const args = process.argv.slice(2)
const SCENES = args.filter(a => !a.startsWith('--'))
const TARGETS = SCENES.length ? SCENES : ['lafayette-square', 'hipointe-demun', 'altadena']

// ─────────────────────────────────────────────────────────────────────────────
// 0. SOURCE GUARDS — read the expressions this census reproduces. Drift = refuse.
// ─────────────────────────────────────────────────────────────────────────────
const PIPE = R('cartograph/pipeline.js')
const TILE = R('src/lib/tileGround.js')
const guards = []
const guard = (name, re, src, note) => {
  const m = src.match(re)
  guards.push({ name, ok: !!m, text: m ? m[0].trim() : null, note })
  return m
}
const gKeep = guard('keepR formula', /const keepR = .*$/m, PIPE, 'P4: the clip radius')
guard('clipRun keeps ONE piece', /return pieces\.reduce\(.*\)$/m, PIPE, 'P2: longest-run keep')
guard('clip gate is a bare existsSync', /if \(existsSync\(nbPath\)\) \{/, PIPE, 'P1')
guard('clip runs after deriveLayers', /const layers = deriveLayers\(/, PIPE, 'P1')
guard('map.json write after the clip', /writeIfChanged\(join\(CLEAN_DIR, 'map\.json'\)/, PIPE, 'P1')
guard('cap default is round', /\(caps\?\.\[k\]\?\.cap \|\| 'round'\)/, TILE, 'P3')
guard('dead-end degree is geometric', /const nodeDeg = new Map\(\)/, TILE, 'P3')

o('══ SOURCE GUARDS ' + '═'.repeat(60))
let fatal = false
for (const g of guards) {
  o(`  ${g.ok ? '✅' : '⛔ DRIFTED'}  ${g.name}  [${g.note}]`)
  if (g.text) o(`        ${g.text}`)
  if (!g.ok) fatal = true
}
// P1 ordering, from the source line numbers themselves.
const lineOf = (src, re) => src.slice(0, src.search(re)).split('\n').length
const L_derive = lineOf(PIPE, /const layers = deriveLayers\(/)
const L_gate = lineOf(PIPE, /if \(existsSync\(nbPath\)\) \{/)
const L_write = lineOf(PIPE, /writeIfChanged\(join\(CLEAN_DIR, 'map\.json'\)/)
o(`  P1 ORDER (pipeline.js): deriveLayers :${L_derive}  <  clip gate :${L_gate}  <  map.json write :${L_write}` +
  `  ⇒ ${L_derive < L_gate && L_gate < L_write ? 'HOLDS' : '⛔ DOES NOT HOLD'}`)
if (fatal) { o('\n⛔ A guarded expression has drifted. The census below would be measuring something else. STOP.'); process.exit(1) }

// The keepR formula, re-derived from the matched source text rather than restated.
const KEEP_MARGIN = Number((gKeep[0].match(/\+\s*(\d+(?:\.\d+)?)\s*$/) || [])[1])
if (!Number.isFinite(KEEP_MARGIN)) { o('⛔ could not read the keepR margin out of the source line.'); process.exit(1) }

// ─────────────────────────────────────────────────────────────────────────────
// geometry
// ─────────────────────────────────────────────────────────────────────────────
const XZ = p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]
const len = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L }

/** pipeline.js clipRun, verbatim in behaviour, but returning EVERY piece
 *  (inside runs) and ALSO the outside runs, so the discard can be counted. */
function runs(pts, cx, cz, R2) {
  const inC = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= R2
  const inside = [], outside = []
  let cur = null, curIn = null
  const close = () => { if (cur && cur.length >= 2) (curIn ? inside : outside).push(cur); cur = null; curIn = null }
  const push = (p, isIn) => {
    if (cur && curIn !== isIn) close()
    if (!cur) { cur = [p]; curIn = isIn; return }
    const l = cur[cur.length - 1]; if (l[0] !== p[0] || l[1] !== p[1]) cur.push(p)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], A = dx * dx + dz * dz
    const ts = []
    if (A > 1e-12) {
      const fx = a[0] - cx, fz = a[1] - cz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R2, disc = B * B - 4 * A * C
      if (disc > 0) { const sq = Math.sqrt(disc); for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (t > 1e-9 && t < 1 - 1e-9) ts.push(t) }
    }
    ts.sort((x, y) => x - y)
    const stops = [0, ...ts, 1]
    for (let s = 0; s < stops.length - 1; s++) {
      const t0 = stops[s], t1 = stops[s + 1]; if (t1 - t0 < 1e-9) continue
      const mt = (t0 + t1) / 2
      const isIn = inC(a[0] + dx * mt, a[1] + dz * mt)
      push([a[0] + dx * t0, a[1] + dz * t0], isIn); push([a[0] + dx * t1, a[1] + dz * t1], isIn)
    }
  }
  close()
  return { inside, outside }
}

/** Classify one chain against one radius. */
function classify(pts, cx, cz, keepR) {
  const R2 = keepR * keepR
  const { inside, outside } = runs(pts, cx, cz, R2)
  const total = len(pts)
  if (!inside.length) return { cls: 'dropped', inside, outside, total, kept: 0, discarded: total }
  // pipeline keeps the piece with the most VERTICES (`q.length > p.length`).
  const byVerts = inside.reduce((p, q) => (q.length > p.length ? q : p))
  const byMetres = inside.reduce((p, q) => (len(q) > len(p) ? q : p))
  const kept = len(byVerts)
  const insideTotal = inside.reduce((s, r) => s + len(r), 0)
  const cls = (inside.length === 1 && Math.abs(kept - total) < 1e-6) ? 'whole' : 'clipped'
  return {
    cls, inside, outside, total, kept, insideTotal,
    discardedRuns: inside.length - 1,
    discardedInsideLen: insideTotal - kept,
    discardedOutsideLen: total - insideTotal,
    vertsPickDiffers: byVerts !== byMetres,
    vertsPickLoss: len(byMetres) - kept,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
for (const scene of TARGETS) {
  o('\n' + '═'.repeat(78) + `\n══ ${scene}\n` + '═'.repeat(78))

  const nbP = `cartograph/data/${scene}/neighborhood_boundary.json`
  const skP = `cartograph/data/${scene}/clean/skeleton.json`
  const mpP = `cartograph/data/${scene}/clean/map.json`
  const rawP = `cartograph/data/${scene}/raw/osm.json`
  const missing = [nbP, skP, mpP].filter(p => !has(p))
  if (missing.length) { o(`⛔ ${scene}: MISSING INPUT — ${missing.join(' · ')}\n   SKIPPED LOUDLY. No default is substituted.`); continue }

  const nb = J(nbP)
  const cx = nb.center?.[0] ?? 0, cz = nb.center?.[1] ?? 0
  const fadeOuter = Number.isFinite(nb.streetFade?.outer) ? nb.streetFade.outer : null
  const discR = Number.isFinite(nb.radius) ? nb.radius : null
  if (fadeOuter === null && discR === null) { o(`⛔ ${scene}: boundary carries neither streetFade.outer nor radius — the pipeline exits(1) here. SKIPPED LOUDLY.`); continue }
  const keepR = Math.max(fadeOuter ?? 0, discR ?? 0) + KEEP_MARGIN

  const sk = J(skP)
  const chains = (sk.streets || []).filter(s => Array.isArray(s.points) && s.points.length >= 2)
    .map(s => ({ id: s.id, name: s.name, gs: !!s.gradeSeparated, pts: s.points.map(XZ) }))

  // ── Q1 POPULATION ──────────────────────────────────────────────────────────
  const C = chains.map(c => ({ ...c, ...classify(c.pts, cx, cz, keepR) }))
  const whole = C.filter(c => c.cls === 'whole'), clipped = C.filter(c => c.cls === 'clipped'), dropped = C.filter(c => c.cls === 'dropped')
  const discRuns = C.reduce((s, c) => s + (c.discardedRuns || 0), 0)
  const discInside = C.reduce((s, c) => s + (c.discardedInsideLen || 0), 0)
  const discOutside = C.reduce((s, c) => s + (c.discardedOutsideLen || 0), 0)
  const droppedLen = dropped.reduce((s, c) => s + c.total, 0)
  const totalLen = C.reduce((s, c) => s + c.total, 0)
  const keptLen = C.reduce((s, c) => s + (c.kept || 0), 0)
  o(`\n【1】 POPULATION — pre-clip chains from clean/skeleton.json, clipped at keepR = ${f1(keepR)} m about (${cx}, ${cz})`)
  o(`     chains in the bb        ${C.length}   (of which gradeSeparated ${C.filter(c => c.gs).length})`)
  o(`     survive WHOLE           ${whole.length}`)
  o(`     survive CLIPPED         ${clipped.length}`)
  o(`     DROPPED entirely        ${dropped.length}   (${f1(droppedLen)} m)`)
  o(`     chain length            ${f1(totalLen)} m total → ${f1(keptLen)} m kept  (${(100 * keptLen / totalLen).toFixed(1)}%)`)
  o(`     ⛔ DISCARDED INSIDE RUNS ${discRuns}  totalling ${f1(discInside)} m  — inside the hood and thrown away silently`)
  o(`     outside-the-rim length trimmed ${f1(discOutside)} m`)
  const vd = C.filter(c => c.vertsPickDiffers)
  o(`     ⚠️ clipRun picks the run with the most VERTICES, not the most METRES: differs on ${vd.length} chain(s)` +
    (vd.length ? `, worst loss ${f1(Math.max(...vd.map(c => c.vertsPickLoss)))} m (${vd[0].name ?? vd[0].id})` : ''))

  // ── Q2 FRAGMENTS ───────────────────────────────────────────────────────────
  const frag = C.filter(c => (c.inside?.length || 0) >= 2)
  const gaps = []
  for (const c of frag) for (const r of c.outside) { const L = len(r); const a = r[0], b = r[r.length - 1]
    // an interior gap is an outside run whose BOTH ends sit on the circle
    const on = p => Math.abs(Math.hypot(p[0] - cx, p[1] - cz) - keepR) < 0.5
    if (on(a) && on(b)) gaps.push({ L, name: c.name ?? c.id }) }
  gaps.sort((a, b) => b.L - a.L)
  o(`\n【2】 FRAGMENTS — a SKELETON defect to be welded, not a risk of restoring`)
  o(`     chains with ≥2 inside runs   ${frag.length}`)
  o(`     interior gaps (both ends on the circle)  ${gaps.length}` +
    (gaps.length ? `  lengths ${gaps.slice(0, 8).map(g => f1(g.L) + ' m').join(' · ')}${gaps.length > 8 ? ' …' : ''}` : ''))
  if (frag.length) o(`     fragmented chains: ${frag.slice(0, 10).map(c => `${c.name ?? c.id}(${c.inside.length})`).join(' · ')}${frag.length > 10 ? ' …' : ''}`)

  // ── Q3 THE FADE COUPLING ───────────────────────────────────────────────────
  const kFade = (fadeOuter ?? 0) + KEEP_MARGIN, kDisc = (discR ?? 0) + KEEP_MARGIN
  const dom = kFade > kDisc ? 'fadeOuter' : kDisc > kFade ? 'discR' : 'tie'
  const Cd = chains.map(c => classify(c.pts, cx, cz, kDisc))
  let fateDiff = 0, lenDiff = 0
  for (let i = 0; i < C.length; i++) { if (C[i].cls !== Cd[i].cls) fateDiff++; lenDiff += Math.abs((C[i].kept || 0) - (Cd[i].kept || 0)) }
  o(`\n【3】 THE FADE COUPLING — is the render knob deciding content extent, or is it latent?`)
  o(`     streetFade.outer ${fadeOuter}  ·  radius ${discR}  ·  keepR ${f1(keepR)} m`)
  o(`     DOMINATES: ${dom}   (fade+${KEEP_MARGIN} = ${f1(kFade)} m vs disc+${KEEP_MARGIN} = ${f1(kDisc)} m; margin ${f1(Math.abs(kFade - kDisc))} m)`)
  o(`     ⇒ ${dom === 'fadeOuter' ? 'LIVE — a shader knob decides what is drawn at all' : 'LATENT — the disc floors it'}`)
  o(`     chains whose FATE changes between the two radii  ${fateDiff}`)
  o(`     chain length that changes hands                  ${f1(lenDiff)} m`)

  // ── P3 / P5 — measured on the artifact the clip actually wrote ─────────────
  const map = J(mpP)
  const rb = map.layers?.ribbons
  if (!rb) { o(`\n⛔ ${scene}: clean/map.json carries no layers.ribbons — P3/P5 NOT MEASURED for this scene.`) }
  else {
    const st = (rb.streets || []).filter(s => Array.isArray(s.points) && s.points.length >= 2)
    const tipKey = p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`
    const deg = new Map()
    for (const s of st) for (let i = 0; i < s.points.length; i++) {
      const k = tipKey(s.points[i]); deg.set(k, (deg.get(k) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
    }
    let tips = 0, atRim = 0, atRimRound = 0
    for (const s of st) for (const [k, idx] of [['start', 0], ['end', s.points.length - 1]]) {
      const p = s.points[idx]
      if (deg.get(tipKey(p)) !== 1) continue
      tips++
      if (Math.abs(Math.hypot(p[0] - cx, p[1] - cz) - keepR) > 0.5) continue
      atRim++
      const authored = s.capEnds?.[k] || (k === 'start' ? s.capStart : s.capEnd)
      const cap = (authored && authored !== 'none') ? authored : (s.caps?.[k]?.cap || 'round')
      if (cap === 'round') atRimRound++
    }
    o(`\n【P3】 post-clip artifact: ${tips} geometric deg-1 tips · ${atRim} within 0.5 m of keepR · ${atRimRound} of those resolve to a ROUND cap`)

    const tiles = rb.tiles || []
    let tilesBeyondKeepR = 0, maxTileR = 0
    for (const t of tiles) { let touches = false; for (const p of (t.ring || [])) { const r = Math.hypot(p[0] - cx, p[1] - cz); if (r > maxTileR) maxTileR = r; if (r <= keepR) touches = true } if (!touches) tilesBeyondKeepR++ }
    o(`【P5】 frozen tiles ${tiles.length} · max ring radius ${f1(maxTileR)} m vs keepR ${f1(keepR)} m vs disc ${discR} m · tiles dropped by the whole-feature clip: ${tilesBeyondKeepR}`)
    o(`      ⇒ the Gate-A STENCIL (union of tile rings) ${tilesBeyondKeepR === 0 && maxTileR <= keepR + 0.5 ? 'is NOT trimmed by the clip' : 'IS trimmed by the clip'}; the Gate-A GROUT is built from rb.streets, which ARE post-clipRun.`)
  }

  // ── Q4 THE SHIPPING BILL ───────────────────────────────────────────────────
  o(`\n【4】 THE SHIPPING BILL — what the clip is buying`)
  if (!has(rawP)) o(`     ⛔ ${rawP} MISSING — the pre-clip fetch population cannot be counted. NOT MEASURED.`)
  else {
    const raw = J(rawP)
    const hw = raw.ground?.highway
    if (!Array.isArray(hw)) o(`     ⛔ raw/osm.json has no ground.highway[] — NOT MEASURED.`)
    else {
      const R2 = keepR * keepR
      let inW = 0, inB = 0, outB = 0
      for (const w of hw) {
        const cs = w.coords || []
        let t = false
        for (const p of cs) { const x = p.x, z = p.z; if (typeof x === 'number' && (x - cx) ** 2 + (z - cz) ** 2 <= R2) { t = true; break } }
        const b = Buffer.byteLength(JSON.stringify(w))
        if (t) { inW++; inB += b } else outB += b
      }
      o(`     raw fetched highway ways   ${hw.length} → ${inW} touching keepR   (whole-feature drop: ${hw.length - inW})`)
      o(`     their serialized bytes     ${MB(inB + outB)} → ${MB(inB)}  (${(100 * inB / (inB + outB)).toFixed(0)}% kept)`)
    }
  }
  const sz = p => has(p) ? MB(fs.statSync(path.join(ROOT, p)).size) : 'absent'
  o(`     ON DISK TODAY (post-clip): map.json ${sz(mpP)} · ribbons.json ${sz(`cartograph/data/${scene}/clean/ribbons.json`)} · post-clip ribbons.streets ${rb?.streets?.length ?? '—'}`)
  o(`     ⛔ PREBAKE §2.5's "map.json 180 → 52 MB, ribbons 22 → 8 MB, streets 2117 → 300" is UNREPRODUCIBLE read-only:`)
  o(`        the 180 MB figure requires re-running pipeline.js with the clip disabled on a wide fetch, which writes clean/map.json.`)
  o(`        The line above is the measurable surrogate, computed from raw/osm.json — the same array pipeline.js:${L_derive} feeds deriveLayers.`)
}

o('\n' + '═'.repeat(78))
o('Re-run: node checks/claims-rim-census.mjs [scene ...]')
