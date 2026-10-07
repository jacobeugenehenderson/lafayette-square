/**
 * roofTop — each building's ROOF PEAK: the highest vertex of its own roof range (local Y, before the terrain lift
 * `centroidY × exaggeration + groundY`, src/lib/buildingLift.js), read from the roof group it was baked into (buildings.json groups are keyed kind:material).
 * What `<TownPoint building>` seats on. One home: SlabBuildings reads it at load, the census check reads it off disk.
 *
 * A building with no roof range has no roof top (null), for one of two reasons the census tells apart:
 *   · `setPiece`   — no slab geometry at all: its 3D is the town's set piece (the building bake keeps the record, builds
 *                    no box — cartograph/bake-buildings.js). Seating on it needs the set piece's own top.
 *   · `noRoof`     — walls or a foundation but no roof: a building the bake left open.
 * ▶ node checks/claims-every-building-has-a-roof-to-seat-on.mjs
 */
export function roofTops(manifest, bin) {
  const roofPos = new Map(manifest.groups.filter((g) => g.kind === 'roof')
    .map((g) => [g.id, new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3)]))
  return manifest.buildings.map((b) => {
    const pos = b.ranges?.roof && roofPos.get(b.roofMaterial)
    if (!pos) return null
    const [start, count] = b.ranges.roof
    let top = -Infinity
    for (let v = start; v < start + count; v++) top = Math.max(top, pos[v * 3 + 1])
    return Number.isFinite(top) ? top : null
  })
}

/** Why a building has no roof top: 'setPiece' (no slab geometry) or 'noRoof' (walls/foundation, no roof). */
export const rooflessWhy = (b) => (Object.keys(b.ranges || {}).length ? 'noRoof' : 'setPiece')
