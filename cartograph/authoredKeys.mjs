// authoredKeys.mjs — WHAT THE OPERATOR'S AUTHORING IS KEYED BY, AND WHETHER A NEW SKELETON KEEPS EVERY KEY (2026-10-28,
// BRIEF-the-bake-re-skeletons-a-stale-town §3.2). One home for both readers: the Bake's re-skeleton (reskeleton.mjs) refuses
// by name on any key this finds re-keyed, and checks/claims-authored-skelids-keep-their-ways.mjs reports the same rows.
//
// THE KEYS (Layer 0 q3: the authoring is the product, and it is stored under skeleton identities):
//   · overlay.streets[skelId] (clean/overlay.json) — and its capStart / capEnd, which name a chain END
//   · design.blockCustoms[skelId][side][segOrd] — segOrd is TOPOLOGY (tileGround.js#mintSegOrdAt): the count of the chain's
//     interior crossings before the block, so a crossing gained or lost re-keys every slot after it
//   · design.cornerRadiusOverrides["x,z"] — a junction's point
//   · design.cornerCornerRadiusOverrides["x,z|skelId:side|skelId:side"] — a point and two legs; a side is relative to the
//     chain's direction, so a chain that turns round re-keys it
// THE VERDICTS, per key (any but SAME refuses, except a highway's, which r-highway-no-authoring already refuses in the pour):
//   SAME · MOVED (the id names other OSM ways) · GONE (the id is no longer a chain) · DANGLING (named no chain before either) ·
//   ENDS (a capped or cornered chain's start or end moved: split, turned round) · SEGORD (an authored street's crossings
//   changed at or before an authored slot) · CORNER (a corner's point is no longer a vertex of a chain it names)
// ⚠️ Read at the SKELETON, by its control points: the mint's own crossings also come from chain joins (chainJoins.mjs, which
// refuses its own re-keys) and the disc. A crossing gained outside the drawn disc refuses here though the mint would not re-key:
// the loud direction.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { resolveChainSegmentation, IX_EPS } from '../src/lib/chainSegmentation.js'

const REPO_ROOT = join(import.meta.dirname, '..')

// ⭐ THE RULE OF WHAT A NEW OR LOST CROSSING RE-KEYS, ONE HOME: segOrd counts a street's interior crossings
// (tileGround.js#mintSegOrdAt), so a crossing gained or lost at block s0 shifts every block after it, and the cut block's own slot
// stops covering what it covered: every authored slot of that street at or after s0 (one street's `blockCustoms[skelId]`) is
// re-keyed → ['left|3', …]. Asked by the chain join (chainJoins.mjs#refuseAuthoredReKey) and by the re-skeleton (below).
export function slotsReKeyedFrom(streetCustoms, s0) {
  return ['left', 'right'].flatMap(sd => Object.keys(streetCustoms?.[sd] || {}).filter(o => Number(o) >= s0).map(o => `${sd}|${o}`))
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// The design fields keyed in a scene's frame, read from the one place that declares them (serve.js; it starts a server, so it
// is read, not imported). ⛔ Up to the line that closes the array: its comments carry brackets ("[skelId][side][segOrd]").
export function sceneKeyedDesignFields(root = REPO_ROOT) {
  const m = readFileSync(join(root, 'cartograph/serve.js'), 'utf8').match(/const SCENE_KEYED_DESIGN_FIELDS = \[([\s\S]*?)\n\]/)
  if (!m) throw new Error('[authoredKeys] ⛔ SCENE_KEYED_DESIGN_FIELDS not found in cartograph/serve.js — the authored keys cannot be read')
  return [...m[1].matchAll(/^\s*'([A-Za-z]+)'/gm)].map(x => x[1])
}
// How each declared field is keyed. ⛔ A declared field missing here REFUSES (authoringOf): a new scene-keyed field must say
// how a re-skeleton reaches it before a re-skeleton may run.
const FIELD_KEYS = {
  blockCustoms: 'skelId',                  // [skelId][side][segOrd]
  cornerRadiusOverrides: 'point',          // "x,z", a junction
  cornerCornerRadiusOverrides: 'corner',   // "x,z|skelId:side|skelId:side"
  blockLandUse: 'block',                   // a block ring's bbox centre (buildBlockGeometryV2.js#blockKeyFromRing): the mint's, not the skeleton's
  browseFrame: 'place',                    // {center, altitude}: a place in the frame, which never moves
}

// The highway classes, read from skeleton.js (never restated): a highway takes no authoring (r-highway-no-authoring)
export function highwayClasses(root = REPO_ROOT) {
  const la = readFileSync(join(root, 'cartograph/skeleton.js'), 'utf8').match(/const LIMITED_ACCESS = new Set\(\[([^\]]+)\]\)/)
  if (!la) throw new Error('[authoredKeys] ⛔ LIMITED_ACCESS not found in cartograph/skeleton.js')
  return new Set([...la[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
}

const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const POINT = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/

/** Every key the scene's authoring names: the overlay and every Look of the scene (looks/index.json). */
export function authoringOf(scene, root = REPO_ROOT) {
  const ids = new Map(), caps = new Map(), slots = new Map(), corners = [], notJudged = []
  const add = (id, where) => { if (!ids.has(id)) ids.set(id, []); ids.get(id).push(where) }
  const ov = join(root, 'cartograph/data', scene, 'clean/overlay.json')
  if (existsSync(ov)) for (const [k, v] of Object.entries(readJson(ov).streets || {})) {
    add(k, `overlay.streets(source:${v?.measure?.source ?? 'none'})`)
    for (const end of ['start', 'end']) { const c = v?.[end === 'start' ? 'capStart' : 'capEnd']; if (c) (caps.get(k) || caps.set(k, []).get(k)).push(`overlay cap${end === 'start' ? 'Start' : 'End'}=${c}`) } }
  const fields = sceneKeyedDesignFields(root)
  const unknown = fields.filter(f => !FIELD_KEYS[f])
  if (unknown.length) throw new Error(`[authoredKeys] ⛔ scene-keyed design field(s) ${unknown.join(', ')} have no key format here (authoredKeys.mjs FIELD_KEYS): a re-skeleton cannot tell whether it re-keys them. Refusing.`)
  for (const look of readJson(join(root, 'public/looks/index.json')).looks.filter(l => l.scene === scene)) {
    const dp = join(root, 'public/looks', look.id, 'design.json')
    if (!existsSync(dp)) continue
    const d = readJson(dp)
    for (const f of fields) {
      const v = d[f], where = `${look.id}/design.${f}`
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) continue
      const kind = FIELD_KEYS[f]
      if (kind === 'place') continue
      // ⛔ NOT JUDGED ANYWHERE (unbuilt): a block key is a ring's bbox centre, which the skeleton does not know, and the pour's own
      // key check (claims-an-authored-key-names-the-same-frontage-after-a-re-pour) reports it NOT JUDGED too. Printed, never silent.
      if (kind === 'block') { notJudged.push(`${where}: ${Object.keys(v).length} block key(s) — not judged (a block ring's centre; no judge for these keys is built)`); continue }
      for (const k of Object.keys(v)) {
        if (kind === 'skelId') { add(k, where); (slots.get(k) || slots.set(k, []).get(k)).push({ where, customs: v[k] }); continue }
        const [pt, ...legs] = k.split('|'), pm = POINT.exec(pt)
        if (!pm) throw new Error(`[authoredKeys] ⛔ ${where} key "${k}" does not start with a point "x,z" — not a key this guard can read. Refusing.`)
        const named = legs.map(l => ({ id: l.replace(/:[^:]*$/, ''), side: l.match(/:([^:]*)$/)?.[1] ?? null })).filter(l => ID_SHAPE.test(l.id))
        if (kind === 'corner' && named.length !== legs.length) throw new Error(`[authoredKeys] ⛔ ${where} key "${k}": a leg names no chain. Refusing.`)
        for (const l of named) add(l.id, where)
        corners.push({ where, key: k, point: [+pm[1], +pm[2]], ids: [...new Set(named.map(l => l.id))] })
      } } }
  return { ids, caps, slots, corners, notJudged }
}

// ── the skeleton side ──
const xz = (p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= IX_EPS
// id → sorted OSM way ids, over streets[] and paths[] (a path id is positional too)
export function waysById(skel) {
  const m = new Map()
  for (const s of skel.streets || []) m.set(s.id, [...(s.osmIds || s.sources || [])].map(String).sort())
  for (const p of skel.paths || []) m.set(p.id, [String(p.osmId)])
  return m
}
// id → the chain's interior crossings, in order, as the mint counts them (mintSegOrdAt's filter: the at-grade streets only, a
// point shared by ≥ 2 chains, not an end), by the skeleton's control points
function crossingsById(skel) {
  const sts = (skel.streets || []).filter(s => !s.gradeSeparated).map(s => ({ id: s.id, points: (s.points || []).map(xz) }))
  const seg = resolveChainSegmentation(sts), out = new Map()
  for (const s of sts) out.set(s.id, [...(seg.get(s) || [])].filter(i => i > 0 && i < s.points.length - 1).sort((a, b) => a - b).map(i => s.points[i]))
  return out
}

/**
 * Compare the skeleton the operator authored against (`before`) with a new one (`after`) for every key in `A` (authoringOf).
 * → { rows: [{ id, status, where, detail }], tally, hits: [the refusing rows' lines], highway: [rows on a highway] }. Pure.
 */
export function authoringReKeys(before, after, A, HIGHWAY) {
  const wb = waysById(before), wa = waysById(after)
  const chainB = new Map((before.streets || []).map(s => [s.id, s])), chainA = new Map((after.streets || []).map(s => [s.id, s]))
  const hwy = new Set([...before.streets || [], ...after.streets || []].filter(s => HIGHWAY.has(s.highway)).map(s => s.id))
  const xB = crossingsById(before), xA = crossingsById(after)
  const rows = []
  const row = (id, status, where, detail) => rows.push({ id, status, where, detail })
  for (const [id, where] of [...A.ids].sort((a, b) => a[0].localeCompare(b[0]))) {
    const b = wb.get(id), a = wa.get(id)
    if (!b) { row(id, 'DANGLING', where, 'names no chain in the skeleton it was authored against'); continue }
    if (!a) { row(id, 'GONE', where, `ways ${b.join(',')} → none`); continue }
    if (b.join(',') !== a.join(',')) { row(id, 'MOVED', where, `ways ${b.join(',')} → ${a.join(',')}`); continue }
    // the ends: a capped chain, or one a corner names by side, must keep its start and its end
    const cb = chainB.get(id), ca = chainA.get(id), endWhere = [...(A.caps.get(id) || []), ...A.corners.filter(c => c.ids.includes(id)).map(c => c.where)]
    if (cb && ca && endWhere.length) {
      const P = (cb.points || []).map(xz), Q = (ca.points || []).map(xz)
      const bad = [['start', P[0], Q[0]], ['end', P[P.length - 1], Q[Q.length - 1]]].filter(([, p, q]) => !p || !q || !near(p, q))
      if (bad.length) { row(id, 'ENDS', [...new Set(endWhere)], bad.map(([e, p, q]) => `${e} (${p?.map(v => v.toFixed(2))}) → (${q?.map(v => v.toFixed(2))})`).join(' · ')); continue }
    }
    // segOrd: the first crossing that differs (gained, lost or moved) re-keys every authored slot at or after it
    const S = A.slots.get(id)
    if (S && cb) {
      const B = xB.get(id) || [], C = xA.get(id) || []
      let s0 = 0; while (s0 < B.length && s0 < C.length && near(B[s0], C[s0])) s0++
      if (s0 < B.length || s0 < C.length) {
        const hit = S.flatMap(s => slotsReKeyedFrom(s.customs, s0).map(k => `${s.where} ${k}`))
        if (hit.length) { row(id, 'SEGORD', S.map(s => s.where), `crossings ${B.length} → ${C.length}, first change at segOrd ${s0}: re-keys ${hit.join(' · ')}`); continue }
      }
    }
    row(id, 'SAME', where, '')
  }
  // a corner's point must stay a vertex of each chain it names (a junction moved is a key on no junction)
  for (const c of A.corners) for (const id of c.ids) {
    const pb = (chainB.get(id)?.points || []).map(xz), pa = (chainA.get(id)?.points || []).map(xz)
    if (!pb.some(p => near(p, c.point))) continue   // not a skeleton vertex before (a point the mint made): the mint's to judge
    if (!pa.some(p => near(p, c.point))) row(id, 'CORNER', [c.where], `"${c.key}": (${c.point.join(', ')}) is no longer a vertex of ${id}`)
  }
  const highway = rows.filter(r => r.status !== 'SAME' && r.status !== 'DANGLING' && hwy.has(r.id))
  const refusing = rows.filter(r => r.status !== 'SAME' && !highway.includes(r))
  const tally = {}; for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1
  return { rows, tally, highway, hits: refusing.map(r => `${r.status} ${r.id} [${[].concat(r.where).join(', ')}] ${r.detail}`.trim()) }
}
