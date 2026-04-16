/**
 * Cartograph — Step 2c: Polygonize (extract faces from planar graph)
 *
 * Takes noded segments (every crossing is a shared vertex) and extracts
 * minimal enclosed polygons by walking the planar graph.
 *
 * Algorithm:
 *   1. Build a half-edge data structure from segments
 *   2. At each vertex, sort outgoing edges by angle
 *   3. Link each half-edge's "next" to the next CCW edge at its target vertex
 *   4. Walk "next" chains to extract face cycles
 *   5. The unbounded (outer) face is the largest; all others are enclosed polygons
 *
 * This is the standard DCEL / planar subdivision face extraction,
 * equivalent to what PostGIS ST_Polygonize does internally.
 */

// ── Vertex key ────────────────────────────────────────────────────────

function vKey(x, z) {
  // Use fixed precision string as hash key
  return `${x.toFixed(2)},${z.toFixed(2)}`
}

// ── Half-edge structure ───────────────────────────────────────────────

/**
 * Build faces from an array of noded segments.
 * Each segment is [{x, z}, {x, z}].
 *
 * Returns an array of faces, each face = [{x, z}, ...] (CCW winding = solid, CW = hole).
 */
export function polygonize(segments) {
  // Step 1: Build adjacency — each vertex has a sorted list of outgoing edges
  const adj = {} // vKey → [{x, z, angle, target: vKey, heIndex}]

  // Half-edges: each segment produces two (one in each direction)
  const halfEdges = []

  for (const seg of segments) {
    const a = seg[0], b = seg[1]
    const src = seg[2] !== undefined ? seg[2] : -1  // source polyline index
    const ka = vKey(a.x, a.z)
    const kb = vKey(b.x, b.z)
    if (ka === kb) continue // degenerate

    const iAB = halfEdges.length
    const iBA = halfEdges.length + 1

    halfEdges.push({
      origin: ka, target: kb,
      ox: a.x, oz: a.z, tx: b.x, tz: b.z,
      twin: iBA, next: -1, visited: false, source: src,
    })
    halfEdges.push({
      origin: kb, target: ka,
      ox: b.x, oz: b.z, tx: a.x, tz: a.z,
      twin: iAB, next: -1, visited: false, source: src,
    })

    if (!adj[ka]) adj[ka] = []
    if (!adj[kb]) adj[kb] = []
    adj[ka].push({ angle: Math.atan2(b.z - a.z, b.x - a.x), heIndex: iAB })
    adj[kb].push({ angle: Math.atan2(a.z - b.z, a.x - b.x), heIndex: iBA })
  }

  console.log(`  Polygonize: ${halfEdges.length} half-edges, ${Object.keys(adj).length} vertices`)

  // Step 2: Sort outgoing edges at each vertex by angle (CCW)
  for (const key of Object.keys(adj)) {
    adj[key].sort((a, b) => a.angle - b.angle)
  }

  // Step 3: Link "next" pointers
  // For half-edge AB, its "next" is determined by:
  //   - Look at the twin BA
  //   - At vertex A (origin of BA = target of AB... wait, let me think)
  //
  // Standard DCEL linking:
  //   For each half-edge h (origin→target):
  //     - twin(h) goes target→origin
  //     - At vertex "target", find twin(h) in the sorted edge list
  //     - h.next = the NEXT edge (CCW) after twin(h) at vertex "target"
  //
  // This gives us: walking h.next traces a face boundary.

  // Build lookup: at each vertex, for a given half-edge arriving, what's the next outgoing?
  for (const key of Object.keys(adj)) {
    const edges = adj[key]
    const n = edges.length

    // Build a map from heIndex to position in sorted array
    const posMap = {}
    for (let i = 0; i < n; i++) {
      posMap[edges[i].heIndex] = i
    }

    // For each outgoing half-edge from this vertex,
    // its twin arrives at this vertex.
    // The next of that twin = next CCW outgoing edge after it.
    for (let i = 0; i < n; i++) {
      const outgoing = edges[i]
      const twinIdx = halfEdges[outgoing.heIndex].twin
      // twin arrives at this vertex. Its "next" should be the
      // next CCW outgoing edge, which is the PREVIOUS in sorted order
      // (because we want the rightmost turn for face extraction).
      const prevIdx = (i - 1 + n) % n
      halfEdges[twinIdx].next = edges[prevIdx].heIndex
    }
  }

  // Step 4: Walk cycles to extract faces
  const faces = []
  let skipped = 0

  for (let i = 0; i < halfEdges.length; i++) {
    if (halfEdges[i].visited) continue

    const cycle = []
    let cur = i
    let safe = 0
    const maxSteps = halfEdges.length

    while (!halfEdges[cur].visited && safe < maxSteps) {
      halfEdges[cur].visited = true
      cycle.push({ x: halfEdges[cur].ox, z: halfEdges[cur].oz, source: halfEdges[cur].source })
      cur = halfEdges[cur].next
      safe++

      if (cur === i) break // closed cycle
    }

    if (cur !== i || cycle.length < 3) {
      skipped++
      continue
    }

    faces.push(cycle)
  }

  console.log(`  → ${faces.length} face cycles extracted (${skipped} degenerate/open)`)

  // Step 5: Compute signed area, separate solid faces from holes and unbounded
  const result = []
  let maxArea = 0
  let maxIdx = -1

  for (let i = 0; i < faces.length; i++) {
    const ring = faces[i]
    let area = 0
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j]
      const b = ring[(j + 1) % ring.length]
      area += (a.x * b.z - b.x * a.z)
    }
    area /= 2 // signed: positive = CW (in our coord system), negative = CCW

    const absArea = Math.abs(area)
    if (absArea > maxArea) {
      maxArea = absArea
      maxIdx = i
    }

    result.push({ ring, area, absArea })
  }

  // Remove unbounded face (largest)
  if (maxIdx >= 0) {
    result.splice(maxIdx, 1)
  }

  // Filter tiny artifacts (< 10 m²)
  const filtered = result.filter(f => f.absArea > 10)
  console.log(`  → ${filtered.length} faces after removing unbounded + artifacts (${result.length - filtered.length} tiny faces removed)`)

  return filtered.map(f => ({
    ring: f.ring,
    area: f.area,
    absArea: f.absArea,
  }))
}
