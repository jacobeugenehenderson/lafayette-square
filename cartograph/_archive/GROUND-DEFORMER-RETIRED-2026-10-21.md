# The ground's own baked height (the deformer) — RETIRED 2026-10-21

**Why retired:** BRIEF-the-ground-stands-on-one-field (Jacob's choice (a), Boz's rulings, 2026-10-21). Since 5255b311
(2026-10-11) the ground left the town's one height field for per-vertex `aRaw`/`aGrad` from `cartograph/groundDeformer.mjs`
(the street's line, the level walk, the lawn, the ease, ownership by ray). That move is what put 89% of HPDM's ground
triangles into band refinement, and what produced the unowned refusals and the seam steps. The ground reads the field again:
drawn = field × uExag + y (the kerb). `groundDeformer.mjs` and `lineHeight.mjs` are deleted; they are still in the tree
at the commit named in the retiring commit's message (the seed for the backlog's shaped field, (B)).

**Live home now:** `cartograph/ARCHITECTURE.md` § Ground conformance (the one-field bullet) · `cartograph/OPERATIONS.md`
§ Ground tri-budget · `src/utils/terrainShader.js` (`_terrainRaw`, `TERRAIN_NORMAL`) · `src/lib/drawnGround.js`.

## The text that left the live docs, verbatim

### From SLAB-CONTRACT.md §2

| `rawByteOffset`, `gradByteOffset` | Deformed slabs (`groundDeformer.mjs`): per vertex, float32 terrain part (raw m; drawn `× uExag` + y) and float32×4 `(∂aRaw/∂x, ∂aRaw/∂z, ∂y/∂x, ∂y/∂z)`. Absent ⇒ the 5 m texture. ▶ `checks/claims-the-ground-meets-its-terrain.mjs` |

### From SLAB-CONTRACT.md §2

| float32 aRaw, then float32×4 aGrad, per deformed group (rawByteOffset, gradByteOffset) |

### From ROADMAP.md (open items)

- **The deformer's memo is one Map, and V8 caps a Map at 16,777,216 entries: a town past the cap throws mid-bake** *(Swale, measured on Huron's dump 2026-10-12; Boz)*. Huron, exact key: ~12.43M distinct positions (HyperLogLog, ±~0.4%) of 883.8M sampler calls = ~74% of the cap, 1.35× headroom. ⛔ A PROJECTION, not a measurement: at Huron's density (~228,700 cells/km² of the input's 50.10 km² bbox, 3.05 cells per output triangle) a town crosses it past ~73 km² of bbox; whether density scales by bbox area or by output triangles (likely the better scale) is not established, and no other town is measured. It fails loudly (the Map throws), so it is a size ceiling, not a silent defect. ▶ `node --max-old-space-size=14000 scratch/ground-height/memo-stream.mjs <dump dir>` (`[headroom]`). → `groundDeformer.mjs#resolve`.

### From cartograph/ARCHITECTURE.md § Ground conformance

- **One field — CPU↔GPU reconcile.** There is one heightfield (`terrain.bin`) but two samplers, and they used to index it at *different positions*: the CPU bilinear (`terrainCommon.makeElevationSampler`) reads grid index `u·(N−1)`; a raw `texture2D` reads texel centers `u·N−0.5` — up to **±0.5 cell (±2.5 m horizontal, ~2 m vertical at the steep edges)** apart, zero only at the domain center. A CPU-placed object on a GPU-rendered ground therefore floated. **Cure:** the GPU snippets remap their coordinate through `_terrainUV` (`terrainShader.js`) so `texture2D` lands on the CPU grid index — the two paths now return **byte-identical** world-Y. Reconcile direction is GPU→CPU on purpose: buildings/foundations anchor on the CPU convention (below), so the ground comes to *them* and they never move.

### From checks/codemap.mjs (row)

  { id: 'one-owner-per-piece', topic: 'a ped point\'s owner is decided once',
    doc: { file: 'cartograph/groundDeformer.mjs', quote: 'THE BAND DECIDES, NEVER THE NEARER LINE' },
    code: [{ file: TG, symbol: 'export function rekeyByPiece(st, byLu, sp = null) {', note: 'the painter: each piece carries one owner' },
           { file: 'cartograph/groundDeformer.mjs', symbol: 'const p = profile(c, x, z)', note: 'the deformer: re-derives the owner by a straight ray from each span\'s station' }],
    verdict: 'MISMATCH, aspiration pending Jacob (Boz, 2026-10-21): the painter assigns each piece\'s owner, the deformer decides it again '
      + 'by ray and reads no width (read in source). Measured on LS (Mitre\'s k dump, Kerf\'s ground.unowned.json): at the unowned '
      + 'points on tiles 44, 35, 17, 18 the painter names an owner whose ray leaves the band before the point',
    probe: 'scratchpad ribbon/pieces44.mjs + why44.mjs (Zob, 2026-10-21)' },
