/**
 * anchorGate.js — DOES A TOWN'S TREES' AND LAMPS' GROUND ANCHORS BELONG TO THIS SLAB? One verdict, read by the player
 * (InstancedTrees, BakedLamps: the backstop) and by Publish (cartograph/anchorGate.mjs: the guard, so a slab whose anchors
 * do not match it never ships). Boz ruled (b), 2026-10-29: a town whose anchors fail is REFUSED by name, its trees (or
 * lamps) not drawn, the scene up. ⛔ There is no field fallback: an object seated on the smooth field instead of the drawn
 * ground is a plausible-looking wrong map, which the kit never draws (Layer 0). ▶ node checks/claims-anchors-know-their-terrain.mjs
 */
import { Refusal } from './refusal.js'

/** FNV-1a over the placements' coordinates, in order: what bake-tree-anchors stamps as `placementKey`. */
export function placementKeyOf(instances) {
  let h = 2166136261 >>> 0
  for (const t of instances) {
    const k = `${t.x.toFixed(3)},${t.z.toFixed(3)}`
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The tree anchors' verdict. `doc` is tree-anchors.json (or null), `instances` trees.json's, `terrainId` the slab's
 * heightfield identity (terrainCommon.js#terrainIdentity). → { ok: true } or { ok: false, why }.
 * Refused: no file · no placementKey (baked before 2026-09-03: it cannot prove it belongs to these placements) · another
 * placementKey (a re-pour reordered them) · no terrain identity · another heightfield · another length · a non-number anchor.
 */
export function treeAnchorsVerdict({ doc, instances, terrainId }) {
  const a = doc?.anchors
  if (!Array.isArray(a)) return { ok: false, why: 'no tree-anchors.json' }
  if (!doc.placementKey) return { ok: false, why: 'tree-anchors.json has no placementKey (baked before 2026-09-03), so it cannot prove it belongs to these placements' }
  const key = placementKeyOf(instances)
  if (doc.placementKey !== key) return { ok: false, why: `tree-anchors.json belongs to other placements (placementKey ${doc.placementKey} ≠ ${key})` }
  if (!doc.terrain?.key) return { ok: false, why: 'tree-anchors.json carries no terrain identity (baked before the guard)' }
  if (doc.terrain.key !== terrainId) return { ok: false, why: `tree-anchors.json was sampled from another heightfield (terrain ${doc.terrain.key}, this slab's ${terrainId})` }
  if (a.length !== instances.length) return { ok: false, why: `tree-anchors.json has ${a.length} anchors for ${instances.length} placements` }
  const bad = a.findIndex(v => typeof v !== 'number' || !Number.isFinite(v))
  if (bad >= 0) return { ok: false, why: `tree anchor ${bad} is not a number (${a[bad]})` }
  return { ok: true }
}

/** The lamp anchors' verdict, off lamps.json itself (each lamp carries its own groundRaw). → { ok: true } or { ok: false, why }. */
export function lampAnchorsVerdict({ doc, terrainId }) {
  const lamps = doc?.lamps
  if (!Array.isArray(lamps)) return { ok: false, why: 'no lamps.json' }
  if (!lamps.length) return { ok: true }
  if (!doc.terrain?.key) return { ok: false, why: 'lamps.json carries no terrain identity (baked before the guard)' }
  if (doc.terrain.key !== terrainId) return { ok: false, why: `lamps.json was anchored on another heightfield (terrain ${doc.terrain.key}, this slab's ${terrainId})` }
  const bad = lamps.findIndex(l => typeof l.groundRaw !== 'number' || !Number.isFinite(l.groundRaw))
  if (bad >= 0) return { ok: false, why: `lamp ${bad} has no baked groundRaw` }
  return { ok: true }
}

/** An anchored object's raw ground height. ⛔ Never looked up: an object without one is a bug past the gate, loud. */
export function anchoredRaw(o, kind) {
  if (typeof o?.groundRaw === 'number') return o.groundRaw
  throw new Refusal(`[${kind}] ⛔ an object at (${o?.x}, ${o?.z}) has no baked groundRaw, past the anchor gate (src/lib/anchorGate.js) — it is never seated on the field`)
}
