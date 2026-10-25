#!/usr/bin/env node
// claims-a-cap-carries-one-section.mjs — DOES A DEAD-END CAP CARRY ITS OWNER'S WALK ALL THE WAY ROUND?
//
// ⭐ THE CLAIM (SECTION §6.3, the dead-end cap is an end COUPLER, LANDED 2026-07-22): "the bulb has NO halves. It is one
// continuous semicircle carrying ONE cross-section — the cap's own … When the legs disagree the bulb goes whole to the cap
// owner." So wherever the cap owner's ladder has a walk, every cap edge (`iaCap`) strikes one: its walk from `walkFrom` to
// `walkTo` has width. ⛔ A cap edge struck with NO walk (walkTo at the curb, `cw`) is the regression this check was written
// for (Lath, 2026-10-18): the ① painter resolved each frontage from `iaStamp`, which is null on every cap edge, so a cap
// edge outside a padded arc read THE OPEN FIELD (`stripLadder({})`) and its walk went to zero.
// ⭐ Reads the frozen tile (shape.json: `iaCap`, `caps`, `runs`) and strikes it with the painter itself
// (`sectionPassProtoTile`, pieces on, so the struck depths come back as `bandEdgeDepths[si][e]`, as struck, never recomputed).
// The cap owner's ladder: `caps[c]` with the `baseMeasure` of a run of the same `skelId` on the tile (or the town's ribbons),
// through `stripLadder` — its walk exists iff walkTo > walkFrom.
// ⭐ MUTANT (--mutants): one judged cap edge's struck walkTo set to `cw` → must go RED.
//   node checks/claims-a-cap-carries-one-section.mjs [--town=a,b] (default: every town with a baked shape.json) [--shape=<shape.json> --town=<one>] [--mutants] [--show=n]
// Read-only. Exits 1 on any cap edge with no walk where its owner has one, or a cap that cannot be judged.
import { readFileSync, existsSync } from 'fs'
import { resolveCurbWidth } from '../src/cartograph/streetProfiles.js'
import { scenes, ribbonsPath } from './_scenes.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const { sectionPassProtoTile, stripLadder, resolvePedDepths } = await import('../src/lib/tileGround.js')
// every town with a baked shape, unless --town names some (no default town: claims-no-town-name-gates-the-kit, Rule B)
const towns = arg('town') ? arg('town').split(',') : scenes('public/baked/<scene>/shape.json'), SHOW = +(arg('show') || 6)
let bad = 0
for (const town of towns) {
  const shp = arg('shape') || `public/baked/${town}/shape.json`, dp = `public/looks/${town}/design.json`
  if (!existsSync(shp) || !existsSync(dp)) { console.log(`⛔ ${town}: REFUSED — ${existsSync(shp) ? dp : shp} is missing`); bad++; continue }
  const tiles = JSON.parse(readFileSync(shp, 'utf8')).tiles, design = JSON.parse(readFileSync(dp, 'utf8'))
  if (!tiles.some(t => t.iaCap)) { console.log(`⛔ ${town}: REFUSED — ${shp} carries no iaCap (poured before caps were frozen); re-pour it, or pass a scratch slab's --shape=`); bad++; continue }
  const cw = resolveCurbWidth(design).value, BC = design.blockCustoms || null, CO = design.cornerCornerRadiusOverrides || null
  const rib = [ribbonsPath(town)].find(existsSync)   // the town's declared ribbons (cartograph/scene.js#ribbonsPathOf), never a test of its name
  const measOf = new Map((rib ? JSON.parse(readFileSync(rib, 'utf8')).streets || [] : []).map(s => [s.skelId, s.measure]))
  let caps = 0, edges = 0, noWalkOwner = 0, unjudged = 0, dip = 0; const ex = [], judged = []
  // a rim piece repeats its block's UNCUT contour (`iaFull`, by design — the disc cut): that contour's caps are judged once,
  // on the first tile carrying it, and the repeats are counted
  const seenContour = new Set(), nContour = new Map(); let repeats = 0
  for (const t of tiles) { const k = JSON.stringify(t.iaFull); nContour.set(k, (nContour.get(k) || 0) + 1) }
  for (const [ti, st] of tiles.entries()) { if (!(st.iaCap || []).some(r => (r || []).some(c => c != null))) continue
    const ck = JSON.stringify(st.iaFull); if (seenContour.has(ck)) { repeats++; continue }
    const R = sectionPassProtoTile(st, cw, { outer: 'LU', inner: 'SW' }, BC, CO, { pieces: true }), ED = R.bandEdgeDepths
    // a rim piece that strikes nothing (a sliver of its block) defers to a twin carrying the same contour; alone, it cannot be judged
    if (!ED) { if (nContour.get(ck) > 1) { nContour.set(ck, nContour.get(ck) - 1); repeats++; continue } console.log(`⛔ ${town} tile ${ti}: the painter returned no bandEdgeDepths — cannot judge`); bad++; continue }
    seenContour.add(ck)
    const seen = new Set()
    st.iaCap.forEach((row, si) => (row || []).forEach((c, e) => { if (c == null) return
      if (!seen.has(c)) { seen.add(c); caps++ }
      const cap = st.caps?.[c], base = (st.runs || []).find(r => r.skelId === cap?.skelId)?.baseMeasure ?? measOf.get(cap?.skelId)
      if (!cap || !base) { unjudged++; if (ex.length < SHOW) ex.push(`tile ${ti} cap ${c}: ⛔ no owner measure (${cap ? cap.skelId : 'no caps[] entry'})`); return }
      const custom = BC?.[cap.skelId]?.[cap.side]?.[cap.segOrd] || null, d = resolvePedDepths(base, cap.side, custom)
      const m = { treelawn: d.tl, sidewalk: d.sw, matOuter: custom?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW'), matInner: custom?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU') }
      const L = stripLadder(m, (d.tl || 0) + (d.sw || 0))
      if (!(L.walkTo > L.walkFrom)) { noWalkOwner++; return }
      edges++
      judged.push({ ti, si, e, c, cap, walk: L.walkTo - L.walkFrom, ED }) })) }
  // the judge: a judged cap edge with no struck walk (walkTo at the curb, or none)
  const wtOf = (j) => { const rec = j.ED[j.si]?.[j.e]; return rec?.walkTo?.length ? Math.min(...rec.walkTo.map(x => x[1])) : null }
  const dips = () => judged.filter(j => { const wt = wtOf(j); return wt == null || wt <= cw + 1e-6 })
  const D = dips(); dip = D.length
  for (const j of D.slice(0, SHOW)) { const wt = wtOf(j); ex.push(`tile ${j.ti} ring ${j.si} edge ${j.e} cap ${j.c} (${j.cap.skelId}|${j.cap.side}|${j.cap.segOrd}): walkTo ${wt == null ? 'none' : wt.toFixed(3)} at the curb (cw ${cw}) — the owner's walk is ${j.walk.toFixed(2)} m`) }
  const fail = dip > 0 || unjudged > 0; if (fail) bad++
  console.log(`${fail ? '⛔' : '✅'} ${town}: ${caps} cap(s) · ${edges} cap edge(s) judged (owner has a walk) · ${noWalkOwner} edge(s) whose owner has none (not judged) · cap edges with NO WALK ${dip} · unjudgeable ${unjudged} · rim pieces repeating a judged contour ${repeats}`)
  for (const x of ex) console.log(`      ${x}`)
  if (process.argv.includes('--mutants')) { const ok = judged.find(j => { const wt = wtOf(j); return wt != null && wt > cw + 1e-6 })
    if (!ok) { console.log('   mutant · not run — no cap edge with a walk to mutate'); continue }
    const rec = ok.ED[ok.si][ok.e], was = rec.walkTo; rec.walkTo = was.map(([t]) => [t, cw]); const n2 = dips().length; rec.walkTo = was
    const red = n2 > dip; if (!red) bad++
    console.log(`   mutant · a cap edge's walkTo set to cw: ${red ? 'RED, as it must be' : '⛔ still GREEN'}`) }
}
console.log(bad ? '\n⛔ RED — a cap edge strikes no walk where its owner has one, or a cap cannot be judged' : '\n✅ GREEN — every cap carries its owner\'s walk all the way round')
process.exit(bad ? 1 : 0)
