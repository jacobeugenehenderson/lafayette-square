#!/usr/bin/env node
// ⭐⭐ ONE CORNER WRITE MOVES ONE CORNER — every field (Jacob, 2026-10-07: "every corner should be authorable on its own").
// A corner is authored in ONE entry of `cornerCornerRadiusOverrides`, keyed `ix|skel:side|skel:side` (`tileGround.js`
// `protoCornerKey`): its radius `r` (Survey's dial), its existence `corner` (Survey's ⌥-click), its curb-cut style `cut`
// (Section's popover). This writes each field once, on one corner, and reads what the build drew — every arc that moved
// must carry THAT key, and at least one must move. ⛔ The key it replaced (`ix|skelA|skelB`, no side) was shared by two
// to four corners at a node, so one radius drag wrote them all — the defect this check exists to catch.
//   node checks/claims-one-corner-write-moves-one-corner.mjs [scene]        (default huron)
import { feed, buildProto } from '../scratch/_proto-feed.mjs'

const scene = process.argv.slice(2).find(a => !a.startsWith('--')) || 'huron'
const f = feed(scene); if (!f) process.exit(1)
const base = f.cornerCornerRadiusOverrides || {}
const build = (map, norm) => buildProto({ ...f, cornerCornerRadiusOverrides: map, ...(norm ? { ribbons: { ...f.ribbons, curbCutNorm: norm } } : {}) },
  { quiet: true, protoProducer: true })
const put = (key, patch) => { const cur = base[key], e = cur == null ? {} : typeof cur === 'object' ? { ...cur } : { r: cur }; return { ...base, [key]: { ...e, ...patch } } }
const arcKey = (R, a) => R.protoShapeTiles?.[a.tile]?.iaArcKey?.[a.si]?.[a.arc] ?? null
// ⭐ WHICH CORNER an arc is, independent of the key under test: its two flank runs off the tile's own stamp
// (`iaStamp` → `runs`, the arriving and leaving legs with their sides) — so a key shared by two corners cannot pass
const legsOf = (R, a) => { const t = R.protoShapeTiles?.[a.tile], arc = t?.iaArc?.[a.si], stp = t?.iaStamp?.[a.si] || []; if (!arc) return null
  const n = arc.length; let q = arc.findIndex((u, i) => u === a.arc && arc[(i - 1 + n) % n] !== a.arc); if (q < 0) return null
  let e = q; for (let k = 0; k < n && arc[(e + 1) % n] === a.arc; k++) e = (e + 1) % n
  const leg = (edge) => { const r = stp[edge]; return r == null ? '∅' : `${t.runs[r].skelId}:${t.runs[r].side}` }
  return [leg((q - 1 + n) % n), leg(e)].sort().join('|') }

const B = build(base)
// the subjects, ON THE DRAWING (inside a drawn block — a corner past the rim is cut away and a radius there can clamp):
// a junction corner with a pad and a key, and a bend with a key
const pin = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const drawn = (a) => (B.block || []).some(r => r?.length >= 3 && pin(a.at[0], a.at[1], r)) || (B.curb || []).some(r => r?.length >= 3 && pin(a.at[0], a.at[1], r))
const J = (B.cornerArcs || []).find(a => a.kind === 'junction' && a.pad && a.key && drawn(a))
const D = (B.cornerArcs || []).find(a => a.kind === 'bend' && a.key && drawn(a))
const filletsOf = (R) => new Map((R.cornerSet || []).map(c => [`${c.key}@${[c.legA, c.legB].sort().join('|')}@${c.fillet?.apex?.map(v => v.toFixed(3))}`, c.fillet?.r]))
const padsOf = (R) => new Map((R.cornerArcs || []).map(a => [`${a.tile}|${a.si}|${a.arc}`, a]))

// RADIUS: the achieved fillets that moved — a SMALLER radius than the default, which the ease can always achieve
const Rr = J ? build(put(J.key, { r: 1 })) : null
const fb = filletsOf(B), fr = Rr ? filletsOf(Rr) : new Map()
// each moved corner as `key@legs` — its key, and which legs it actually stands between
const radMoved = [...fr].filter(([k, r]) => fb.has(k) ? Math.abs((fb.get(k) ?? 0) - (r ?? 0)) > 1e-6 : true).map(([k]) => k.split('@').slice(0, 2).join('@'))
const radGone = [...fb.keys()].filter(k => !fr.has(k)).map(k => k.split('@').slice(0, 2).join('@'))
// EXISTENCE: the pads that flipped — a junction made "not a corner", a bend made "a corner here"
const flips = (R) => { const pb = padsOf(B); return [...padsOf(R)].filter(([id, a]) => pb.get(id)?.pad !== a.pad).map(([, a]) => `${a.key}@${legsOf(R, a)}`) }
const Rn = J ? build(put(J.key, { corner: false })) : null, Ry = D ? build(put(D.key, { corner: true })) : null
const notFlips = Rn ? flips(Rn) : [], yesFlips = Ry ? flips(Ry) : []
// CUT STYLE: authored curb cuts, under a norm that draws something else
const style = 'diagonal', norm = { style: 'perpendicular', width: 1.5, warningDepth: 0.6, source: 'trial', crosswalks: { style: 'none', source: 'kit' } }
const Rc = J ? build(put(J.key, { cut: style }), norm) : null, Rc0 = J ? build(base, norm) : null
// what the WRITE added: an authored cut the same build without it does not draw (the town's own authored corners stay out)
const recId = (r) => `${r.tile}|${r.si}|${r.arc}|${r.style}|${r.at.map(v => v.toFixed(3))}`
const before = new Set((Rc0?.curbCutRecs || []).filter(r => r.source === 'authored').map(recId))
const cutAt = (Rc?.curbCutRecs || []).filter(r => r.source === 'authored' && !before.has(recId(r))).map(r => `${arcKey(Rc, r)}@${legsOf(Rc, r)}`)

// one corner: something moved, every moved arc carries the written key, and they all stand between ONE pair of legs
const one = (ks, k) => ks.length > 0 && ks.every(x => x.split('@')[0] === k) && new Set(ks.map(x => x.split('@')[1])).size === 1
const rows = [
  ['a radius written on one corner moves that corner only', !!J && one([...radMoved, ...radGone], J.key)],
  ['"not a corner" on one junction takes that corner\'s pad only', !!J && one(notFlips, J.key)],
  ['"a corner here" on one bend gives that bend a pad only', !!D && one(yesFlips, D.key)],
  ['a curb-cut style on one corner draws there only', !!J && one(cutAt, J.key)],
]
let bad = 0
for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
console.log(`  (${scene}: junction ${J?.key ?? '—'} · bend ${D?.key ?? '—'} · radius moved ${new Set([...radMoved, ...radGone]).size} corner(s) · not-a-corner flipped ${notFlips.length} arc(s) · corner-here flipped ${yesFlips.length} · authored cuts ${cutAt.length})`)
console.log(bad ? `⛔ ${bad} wrong` : '✅ one write, one corner — radius, existence and curb-cut style alike')
process.exit(bad ? 1 : 0)
