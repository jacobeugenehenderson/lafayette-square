/**
 * stage.js — WHERE THE LAB STANDS, READ OFF THE SLAB.
 *
 * ⛔ No coordinate in this file. A stage is named by WHAT it is (a land-use class,
 * the revetment), and the point is found in the town's own baked artifacts, so the
 * same stage name works on a town nobody has looked at. A stage that cannot be
 * found THROWS with the reason — it never falls back to the origin, which would put
 * the camera over whatever happens to be at (0, 0) and look like a result.
 *
 *   class:<id>  — a point well inside that ground group: the centroid of its
 *                 LARGEST triangle. Big triangles sit in the interiors of big faces
 *                 (the edges are where the mesh is dense), so this lands mid-field,
 *                 mid-park, never on a curb.
 *   revetment   — the tallest armoured station of the baked revetment: the only
 *                 place the wall is worth judging (the harness's own rule).
 *   steepest    — the steepest heightfield sample inside the disc's opaque core, read at
 *                 the grid's own step: where relief shading is judged.
 */
import { ASSET_BASE } from '../../lib/bakedUrl.js'
import { currentTerrain } from '../../utils/terrainShader.js'

async function getJSON(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return r.json()
}

/** Every stage this town can offer, from its ground manifest + revetment. */
export async function listStages(lookId, bust) {
  const t = bust ? `?t=${bust}` : ''
  const m = await getJSON(`${ASSET_BASE}baked/${lookId}/ground.json${t}`)
  const out = m.groups.map(g => ({ id: `class:${g.id}`, kind: g.kind, tris: g.indexCount / 3 }))
  out.unshift({ id: 'steepest', kind: 'terrain' })
  // ⛔ `r.ok` IS NOT PRESENCE IN DEV: vite answers a missing file with its HTML
  // fallback and a 200. Presence is "the body parses as the artifact".
  const rv = await fetch(`${ASSET_BASE}baked/${lookId}/revetment.json${t}`)
  const doc = rv.ok ? await rv.json().catch(() => null) : null
  if (doc?.arcs) out.unshift({ id: 'revetment', kind: 'revetment' })
  return { stages: out, manifest: m }
}

/** Resolve a stage name to a world XZ point (and a facing, for the eye camera). */
export async function resolveStage(lookId, stageId, bust) {
  const t = bust ? `?t=${bust}` : ''
  if (stageId === 'revetment') {
    const doc = await getJSON(`${ASSET_BASE}baked/${lookId}/revetment.json${t}`)
    let best = null, bestArc = null, bi = -1
    for (const arc of doc.arcs || []) {
      const st = arc.stations || []
      for (let i = 0; i < st.length; i++) {
        if (st[i].armour && (!best || st[i].crest > best.crest)) { best = st[i]; bestArc = st; bi = i }
      }
    }
    if (!best) throw new Error(`⛔ stage "revetment" on ${lookId}: revetment.json has NO armoured station`)
    // Facing along the arc's normal, so the eye camera looks AT the wall, not along it.
    const a = bestArc[Math.max(0, bi - 1)], b = bestArc[Math.min(bestArc.length - 1, bi + 1)]
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1
    return { x: best.x, z: best.z, normal: [(b.z - a.z) / L, -(b.x - a.x) / L], why: `tallest armoured station, crest ${best.crest.toFixed(2)} m` }
  }
  if (stageId === 'steepest') {
    const m = await getJSON(`${ASSET_BASE}baked/${lookId}/ground.json${t}`)
    const st = m.stencil
    // ⭐ Inside the fade's INNER edge: past it the ground dissolves, and a slope judged
    // through a half-transparent rim is not a slope judged. ⛔ No fade band ⇒ refuse.
    if (!(st?.fade?.inner > 0)) throw new Error(`⛔ stage "steepest" on ${lookId}: ground.json's stencil has no fade band — the opaque disc to search is unknown`)
    const T = currentTerrain()
    if (T.width <= 2) throw new Error(`⛔ stage "steepest" on ${lookId}: no baked terrain (the terrain module is rendering flat)`)
    const sx = (T.bounds.maxX - T.bounds.minX) / (T.width - 1), sz = (T.bounds.maxZ - T.bounds.minZ) / (T.height - 1)
    let best = -1, bx = 0, bz = 0, gx0 = 0, gz0 = 0
    for (let j = 1; j < T.height - 1; j++) for (let i = 1; i < T.width - 1; i++) {
      const x = T.bounds.minX + i * sx, z = T.bounds.minZ + j * sz
      if (Math.hypot(x - st.center[0], z - st.center[1]) > st.fade.inner) continue
      const gx = (T.data[j * T.width + i + 1] - T.data[j * T.width + i - 1]) / (2 * sx)
      const gz = (T.data[(j + 1) * T.width + i] - T.data[(j - 1) * T.width + i]) / (2 * sz)
      const g = Math.hypot(gx, gz)
      if (g > best) { best = g; bx = x; bz = z; gx0 = gx; gz0 = gz }
    }
    // Face the slope from its downhill side, so the eye camera looks UP it.
    const L = Math.hypot(gx0, gz0) || 1
    return { x: bx, z: bz, normal: [-gx0 / L, -gz0 / L], why: `steepest sample in the disc: ${(Math.atan(best) * 180 / Math.PI).toFixed(1)}° at the ${sx.toFixed(1)} m grid step` }
  }
  if (!stageId.startsWith('class:')) throw new Error(`⛔ unknown stage "${stageId}" — expected class:<id> or revetment`)
  const id = stageId.slice(6)
  const m = await getJSON(`${ASSET_BASE}baked/${lookId}/ground.json${t}`)
  const g = m.groups.find(q => q.id === id)
  if (!g) throw new Error(`⛔ stage "${stageId}": ${lookId}'s ground has no group "${id}" (has: ${m.groups.map(q => q.id).join(', ')})`)
  const bin = await fetch(`${ASSET_BASE}baked/${lookId}/${m.bin}${t}`).then(r => r.arrayBuffer())
  const P = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3)
  const I = new Uint32Array(bin, g.indexByteOffset, g.indexCount)
  let best = -1, bestA = 0
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3
    const A = Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) / 2
    if (A > bestA) { bestA = A; best = k }
  }
  if (best < 0) throw new Error(`⛔ stage "${stageId}": group has no triangles`)
  const a = I[best] * 3, b = I[best + 1] * 3, c = I[best + 2] * 3
  return {
    x: (P[a] + P[b] + P[c]) / 3, z: (P[a + 2] + P[b + 2] + P[c + 2]) / 3, normal: [1, 0],
    why: `centroid of the largest triangle in "${id}" (${bestA.toFixed(0)} m²)`,
  }
}
