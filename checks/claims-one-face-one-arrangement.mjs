#!/usr/bin/env node
// ⭐⭐⭐ "There should be no seams in runs, ever, period." (Jacob, 2026-09-07)
// ▶ node checks/claims-one-face-one-arrangement.mjs [scene ...]
// A RUN is a BLOCK FACE — one road, one side, one block. It carries exactly ONE arrangement.
// ⛔ `SECTION §4` rule 4 is preserved and is a different statement: a road's cross-section varies
// ALONG THE STREET, between blocks, and a block boundary is a CORNER. Within one face, never.
// ⚠️ A far-kerb T cuts the line, so one face can carry two chain spans under two `skelId`s. That is
// why this check exists: the authoring write fans across ONE chain's `segOrd`s and cannot cross
// into the other, so a face split that way was half-authorable and seamed where the cut fell.
import { feed, buildProto } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'
const roadOf = id => String(id ?? '').replace(/-\d+$/, '')
let bad = 0
for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square','hipointe-demun'])) {
  const f = feed(scene); if (!f) { bad++; continue }
  const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
  let faces = 0, multi = 0, splitFaces = 0; const eg = []
  for (const [ti, t] of T.entries()) {
    const byFace = new Map()
    for (const [ri, ring] of (t.iaFull || []).entries()) {
      const stp = t.iaStamp[ri] || []
      for (let q = 0; q < ring.length; q++) {
        const r = stp[q]; if (r == null) continue
        const o = t.runs[r], k = `${roadOf(o.skelId)}|${o.side}`
        const cu = f.blockCustoms?.[o.skelId]?.[o.side]?.[o.segOrd] || null
        const d = resolvePedDepths(o.baseMeasure, o.side, cu)
        const mo = cu?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW')
        const mi = cu?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU')
        if (!byFace.has(k)) byFace.set(k, { arr: new Set(), spans: new Set() })
        byFace.get(k).arr.add(`${mo}${mi}|${d.tl.toFixed(2)}|${d.sw.toFixed(2)}`)
        byFace.get(k).spans.add(o.skelId)
      }
    }
    for (const [k, v] of byFace) {
      faces++
      if (v.spans.size > 1) splitFaces++
      if (v.arr.size > 1) { multi++; if (eg.length < 6) eg.push(`tile ${ti} · ${k} · ${v.arr.size} arrangements across ${v.spans.size} span(s)`) }
    }
  }
  console.log(`\n══ ${scene} ══`)
  console.log(`  block faces ${faces} · faces split across >1 chain span (a far-kerb T cut them) ${splitFaces}`)
  console.log(`  ⛔ faces the SOURCE gives more than one arrangement: ${multi}`)
  for (const e of eg) console.log(`     ${e}`)
  console.log(`  ⭐ the painter resolves ONE per face, so a seam inside a face is unconstructible —`)
  console.log(`     this row measures the AUTHORING KEY still able to describe the illegal state.`)
  if (multi) bad++
}
console.log(bad ? `\n⛔ FAIL — the key can still say two things about one block face.` : `\n✅ PASS — one face, one arrangement, in the source as well as the paint.`)
process.exit(bad ? 1 : 0)
