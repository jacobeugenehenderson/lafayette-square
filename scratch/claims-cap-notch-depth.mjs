#!/usr/bin/env node
/**
 * READ-ONLY. ONE NUMBER PER CAP: how far does the frozen block (iA) stand off the
 * chain TIP?
 *
 * ⛔⛔ THE EXPECTATION DEPENDS ON THE AUTHORED CAP STYLE (Layer 0 q3). The operator's
 * cap-selector writes `capEnds` (overlay-first, `derive.js:2606`) and it WINS over the
 * derived `caps[k].cap` — `tileGround.js:2966`. A BLUNT cap ends flat AT the tip, so a
 * standoff of 0 is CORRECT there and reporting it is reporting the operator's authoring
 * as damage. This check reproduces that precedence exactly.
 *
 * If the tip coupler built a ROUND cap, that distance is the cap radius (hwL+hwR)/2 — the
 * road wraps around the tip and the block is pushed back by it (`bbf4adf6`).
 * If it did not, the block still comes to a POINT at the chain tip: the zero-width
 * slit `RIBBONS §1` describes ("extractFaces walks a dead-end spur out and back over
 * the same vertices") surviving all the way into iA.
 *
 * ⭐ Portable to town #2: the expectation is the chain's OWN authored half-widths, so
 * an asymmetric or narrow spur PASSES. No constant, no street knowledge, no skip list.
 * ⛔ Fails LOUDLY: a cap with no notch is reported by name, not skipped.
 *
 *   node scratch/claims-cap-notch-depth.mjs [scene ...]
 */
import fs from 'fs'
const scenes = process.argv.slice(2).length ? process.argv.slice(2)
  : ['lafayette-square', 'lafayette-square-staging', 'hipointe-demun']
const o = console.log
const dEdge = (p, rings) => { let b = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length], ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1; let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u)); b = Math.min(b, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u))) } return b }

for (const scene of scenes) {
  const SHAPE = `public/baked/${scene}/shape.json`
  const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
  if (!fs.existsSync(SHAPE) || !fs.existsSync(RIB)) { o(`\n${scene}: missing artifact — SKIPPED LOUDLY (${!fs.existsSync(SHAPE) ? SHAPE : RIB})`); continue }
  const sh = JSON.parse(fs.readFileSync(SHAPE, 'utf8')), rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
  const stBy = new Map(rb.streets.map(s => [s.skelId || s.name, s]))
  const rows = []
  sh.tiles.forEach((t, ti) => {
    const rings = t.iA || []; if (!rings.length) return
    for (const c of (rb.tiles[ti]?.caps || [])) {
      const st = stBy.get(c.skelId); if (!st) continue
      const tip = (c.capEnd !== 'end') ? st.points[0] : st.points.at(-1)
      // expected = the cap radius the ruling specifies, from the chain's OWN measure
      const L = st.measure?.left?.pavementHW, R = st.measure?.right?.pavementHW
      if (!Number.isFinite(L) || !Number.isFinite(R)) continue
      // reproduce tileGround.js:2966 precedence EXACTLY — authored capEnds wins
      const k = c.capEnd === 'end' ? 'end' : 'start'
      const authored = st.capEnds?.[k] || (k === 'start' ? st.capStart : st.capEnd)
      const style = (authored && authored !== 'none') ? authored : (st.caps?.[k]?.cap || 'round')
      const src = (authored && authored !== 'none') ? 'AUTHORED' : 'derived'
      const round = style === 'round'
      const want = round ? (L + R) / 2 : 0
      const got = dEdge(tip, rings)
      rows.push({ id: c.skelId, ti, prod: t.producer || '?', style, src, round, want, got,
                  ratio: round ? (want > 0 ? got / want : 0) : (got < 0.25 ? 1 : 0) })
    }
  })
  const blunt = rows.filter(r => !r.round)
  const rnd = rows.filter(r => r.round)
  const NONE = rnd.filter(r => r.ratio < 0.10)           // block comes to a POINT at the tip
  const PART = rnd.filter(r => r.ratio >= 0.10 && r.ratio < 0.80)
  const OK = rnd.filter(r => r.ratio >= 0.80)
  // a BLUNT cap ends flat AT the tip: the expectation is 0, and a standoff is the
  // OPPOSITE failure from "no notch" — never fold the two together.
  const BLUNT_OFF = blunt.filter(r => r.got >= 0.25)
  o(`\n${scene}: caps ${rows.length}   (round ${rows.length - blunt.length}, BLUNT ${blunt.length} — blunt expects 0 standoff and PASSES at 0)`)
  if (blunt.length) o(`   blunt caps: ${blunt.map(r => `${r.id}[${r.src}] ${r.got.toFixed(2)} m`).join(', ')}`)
  o(`   ROUND caps — NOTCHED (standoff >= 80% of the cap radius) : ${OK.length}/${rnd.length}`)
  o(`   ROUND caps — PARTIAL (10-80%)                            : ${PART.length}`)
  o(`   ⛔ ROUND caps — NO NOTCH (<10%, block comes to a POINT at the tip) : ${NONE.length}`)
  o(`   ⛔ BLUNT caps STANDING OFF (expected 0, the opposite failure)      : ${BLUNT_OFF.length}` +
    (BLUNT_OFF.length ? `  — ${BLUNT_OFF.map(r => `${r.id} ${r.got.toFixed(2)} m`).join(', ')}` : ''))
  for (const r of [...NONE, ...PART].sort((a, b) => a.ratio - b.ratio))
    o(`      ${r.ratio < 0.10 ? '⛔' : '⚠️ '} ${r.id.padEnd(24)} tile#${String(r.ti).padStart(3)} producer=${r.prod.padEnd(6)} want ${r.want.toFixed(2)} m  got ${r.got.toFixed(2)} m  (${(r.ratio * 100).toFixed(0)}%)`)
}
