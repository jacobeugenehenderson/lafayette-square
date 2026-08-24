/**
 * hero-band.mjs — WHO KEEPS GEOMETRY IN THE HERO SHOT, decided at BAKE.
 *
 * ⭐ THE PROBLEM THIS REPLACES. The runtime picked mesh-vs-impostor by trunk
 * diameter: `dbh < heroDbhCut` → impostor, else mesh. Two things are wrong with
 * that, and both are measured, not asserted:
 *
 *   1. dbh does not predict COST. In Lafayette Square `linden_american` has 48%
 *      of `maple_red`'s placements and 169% of its triangles. Selecting on trunk
 *      size optimises a variable uncorrelated with what the GPU pays.
 *   2. dbh does not predict VISIBILITY. A fat tree 900 m behind the camera is
 *      billed at full geometry for ~30 screen pixels, while a slim one the pan
 *      passes at 40 m is billed the same.
 *
 * ⭐ THE AXIS THAT DOES PREDICT BOTH is distance to the camera PATH. The hero
 * pan is AUTHORED — `scene.json#heroKeyframes` — so the whole path is known at
 * bake time. Sort placements by how close the camera ever gets, and spend a
 * TRIANGLE budget down that list. Nearest trees, which own the most pixels and
 * the most overdraw, buy geometry first.
 *
 * ⭐⭐ THE BUDGET IS TRIANGLES, NOT A COUNT. `LEDGER-exorcism-wren §E1` on the
 * left-column bar: "It also measures the wrong cost: atlas inclusion is already
 * near-free per species (tiles dedupe by sha1). **Wire it to geometry weight, or
 * remove it.**" This is that wiring. A count-based budget lets one heavy species
 * silently eat the frame; a triangle budget cannot.
 *
 * ⛔ ROLE-AT-BAKE IS PRESERVED. Nothing here swaps by live camera distance — the
 * retired GeoTierDriver did that and served cut-trunk lod2 to telephoto framings
 * ("floating, cut-off trunks", InstancedTrees.jsx:655). The role is frozen into
 * the slab; the runtime only reads it. That also means NO POP: the decision
 * cannot change mid-pan.
 *
 * ⛔ NO FALLBACK. No authored hero pan → this returns null and the caller emits
 * NOTHING, loudly. A silently-guessed band would look like a working budget and
 * quietly misplace every tree in a town nobody has inspected.
 *
 * Kit-generic: reads the scene's own camera path and its own placements. No
 * scene names, no thresholds tuned against one town.
 */
import { readFileSync } from 'node:fs'

/** Dense XZ samples along the authored pan polyline (the camera's actual track). */
export function sampleCameraPath(keyframes, perLeg = 240) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return []
  const pos = keyframes.map(k => (Array.isArray(k) ? k : k.position)).filter(Boolean)
  if (pos.length === 1) return [[pos[0][0], pos[0][2]]]
  const out = []
  for (let s = 0; s < pos.length - 1; s++) {
    const a = pos[s], b = pos[s + 1]
    for (let u = 0; u <= perLeg; u++) {
      const f = u / perLeg
      out.push([a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f])
    }
  }
  return out
}

/**
 * Triangle count of a .glb, read from its JSON chunk only (no buffer decode).
 * Returns null when unreadable — the caller must treat that as a LOUD gap, never
 * as zero, or a species with an unreadable mesh would look free and win budget.
 */
export function glbTriangleCount(file) {
  try {
    const fd = readFileSync(file)
    const jsonLen = fd.readUInt32LE(12)
    const json = JSON.parse(fd.subarray(20, 20 + jsonLen).toString('utf8'))
    let tris = 0
    for (const m of json.meshes || []) {
      for (const pr of m.primitives || []) {
        if (pr.indices != null) tris += Math.floor(json.accessors[pr.indices].count / 3)
      }
    }
    return tris
  } catch {
    return null
  }
}

/** Squared XZ distance from a point to the nearest sample on the path. */
function minDistToPath(x, z, path) {
  let best = Infinity
  for (let i = 0; i < path.length; i++) {
    const dx = x - path[i][0], dz = z - path[i][1]
    const d = dx * dx + dz * dz
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/**
 * Assign the hero geometry role by pan-distance, spending a triangle budget.
 *
 * @param {object[]} instances   placements (need x, z, species, variantId)
 * @param {object}   heroPan     { keyframes } from scene.json
 * @param {object}   opts
 *   triangleBudget  hard ceiling of vertex-shaded triangles for the shot
 *   trisFor         (inst) => triangle count for THIS placement's mesh, or null
 *   bandMaxM        never promote beyond this distance, even with budget left
 * @returns {{ roles: string[], dists: number[], meta: object } | null}
 */
export function assignHeroBand(instances, heroPan, opts = {}) {
  const path = sampleCameraPath(heroPan?.keyframes)
  if (!path.length) return null

  const { triangleBudget = 15e6, trisFor = () => null, bandMaxM = Infinity } = opts

  const dists = new Array(instances.length)
  const order = new Array(instances.length)
  for (let i = 0; i < instances.length; i++) {
    dists[i] = minDistToPath(instances[i].x, instances[i].z, path)
    order[i] = i
  }
  order.sort((a, b) => dists[a] - dists[b])

  const roles = new Array(instances.length).fill('impostor')
  let spent = 0, mesh = 0, cutoffM = 0
  const unknownTris = new Map()   // species -> count, reported LOUDLY by the caller

  for (const i of order) {
    if (dists[i] > bandMaxM) break
    const t = trisFor(instances[i])
    if (t == null) {
      // ⛔ Never treat an unmeasurable mesh as free — it would win budget it has
      // not paid for. Leave it an impostor and make the caller say so.
      const sp = instances[i].species || '(unknown)'
      unknownTris.set(sp, (unknownTris.get(sp) || 0) + 1)
      continue
    }
    if (spent + t > triangleBudget) break
    roles[i] = 'mesh'
    spent += t
    mesh++
    cutoffM = dists[i]
  }

  return {
    roles,
    dists,
    meta: {
      triangleBudget,
      trianglesSpent: spent,
      mesh,
      impostor: instances.length - mesh,
      bandCutoffM: Math.round(cutoffM * 10) / 10,
      bandMaxM: bandMaxM === Infinity ? null : bandMaxM,
      pathSamples: path.length,
      unmeasurableBySpecies: Object.fromEntries(unknownTris),
    },
  }
}
