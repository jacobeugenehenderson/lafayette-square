// claims-parcels-vote-by-area.mjs
//
// ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "yes to underived grass and the rest"): a face no OSM land use
// covers takes the class its assessor parcels cover MOST OF, weighed by the area each shares with the
// face — never by how many parcels there are. A parcel whose code cannot be read abstains. A genuine tie
// is reported and painted `underived`, never broken by list order.
//
// ⛔⛔ WHY. The rung COUNTED parcels. Huron's tile 21 is 133.1 ha of farm parcels (8 of them) against
// 4.3 ha of house lots (8): the count tied, LIST ORDER broke it, and 129 ha of farmland painted
// `residential`. ▶ the case below is that tile's shape, reduced.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. weigh each parcel 1 instead of its area (the count restored)        → the farm case
//   2. let an unreadable parcel vote `underived`                            → the abstain case
//   3. break a tie by taking the first of the ranked classes                → the tie case
//
//   node checks/claims-parcels-vote-by-area.mjs
// Read-only, hermetic — no town needed, so it cannot pass vacuously.
import { parcelWinnerByArea } from '../cartograph/derive.js'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
const parcel = (use, ring) => ({ use, rings: [ring] })
const classify = (p) => p.use                         // the test parcels carry their reading directly
const face = box(0, 0, 1000, 1000)

// ── the tile-21 shape: few large farm parcels vs many small lots, EQUAL in number ──
{
  const ps = []
  for (let i = 0; i < 4; i++) ps.push(parcel('agricultural', box(i * 250, 0, i * 250 + 250, 900)))   // 4 × 22.5 ha
  for (let i = 0; i < 4; i++) ps.push(parcel('residential', box(i * 50, 950, i * 50 + 40, 990)))     // 4 × 0.16 ha
  const v = parcelWinnerByArea(face, ps, classify)
  say(v.use === 'agricultural', `4 farm parcels (90 ha) beat 4 house lots (0.64 ha) though they are equal in NUMBER — got ${v.use}`)
}
// ── the area counts only where the parcel overlaps the face ──
{
  const big = parcel('commercial', box(900, 0, 5000, 1000))      // 410 ha parcel, only 10 ha inside
  const mid = parcel('residential', box(0, 0, 500, 1000))         // 50 ha, all inside
  const v = parcelWinnerByArea(face, [big, mid], classify)
  say(v.use === 'residential', `a parcel votes only the ground it shares with the face (10 ha of a 410 ha parcel vs 50 ha) — got ${v.use}`)
}
// ── an unreadable parcel abstains ──
{
  const v = parcelWinnerByArea(face, [parcel('underived', box(0, 0, 900, 1000)), parcel('residential', box(900, 0, 1000, 1000))], classify)
  say(v.use === 'residential', `a 90 ha parcel nobody can read abstains; the 10 ha readable one decides — got ${v.use}`)
  const none = parcelWinnerByArea(face, [parcel('underived', box(0, 0, 1000, 1000))], classify)
  say(none.use === null && !none.tie, `a face covered only by unreadable parcels has no parcel answer (⇒ underived downstream) — got ${none.use}`)
}
// ── a genuine tie is reported, never broken by order ──
{
  const a = parcelWinnerByArea(face, [parcel('residential', box(0, 0, 500, 1000)), parcel('commercial', box(500, 0, 1000, 1000))], classify)
  const b = parcelWinnerByArea(face, [parcel('commercial', box(500, 0, 1000, 1000)), parcel('residential', box(0, 0, 500, 1000))], classify)
  say(a.use === null && a.tie?.join() === 'commercial,residential', `an exact 50/50 tie is RETURNED as a tie — got use ${a.use}, tie ${a.tie}`)
  say(b.use === a.use && b.tie?.join() === a.tie?.join(), `and the answer does not depend on the parcels' order — got ${b.use} / ${b.tie}`)
}

console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — parcels vote by area, unreadable ones abstain, and a tie is said.'}`)
process.exit(failed ? 1 : 0)
