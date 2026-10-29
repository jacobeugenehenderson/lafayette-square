# BACKLOG row, RESOLVED 2026-10-29 — trees: the field fallback for an unanchored tree

Resolved on groyne/tree-anchor-fallback: the fallback removed (`elevation.js#treeGroundRaw` and the inline `groundRaw ??
getElevationRaw` resolvers in InstancedTrees ×2 and StreetLights), one anchor verdict (`src/lib/anchorGate.js`) refusing a
town's trees or lamps by name at the runtime and at Publish (`cartograph/anchorGate.mjs`), Grove's ring anchored at its
authored 0, and the C9 rule's two KNOWN OPEN rows closed. ▶ `node checks/claims-anchors-know-their-terrain.mjs --mutants`.

The row as it stood:

- **🌳 trees: the field fallback for an unanchored tree** (Boz ruled, 2026-10-29). `elevation.js#treeGroundRaw` falls back to
  `getElevationRaw(x, z)` for a tree with no baked `groundRaw`, a Layer 0 fallback: the tree silently seats on the field. The C9 rule
  (`claims-the-far-shore-is-not-built-at-load`) sees it in HeroImpostorTrees' and OverheadTrees' `aGround` hooks and carries both as
  KNOWN OPEN. On integration's slab, every placed tree has a baked `groundRaw` (▶ `node scratch/tree-anchors/unanchored.mjs
  --slab=<dir>`: 0 on all five towns with trees), so the fallback is dead code on today's data: a deletion (an unanchored tree refuses
  by name), then the two OPEN rows close. The same inline fallback (`groundRaw ?? getElevationRaw`) sits in InstancedTrees.jsx's two
  `aGround` builds and StreetLights.jsx; the C9 rule does not flag those (their hook returns the array rather than setting it; cause of
  the blind spot not established). Not built.
