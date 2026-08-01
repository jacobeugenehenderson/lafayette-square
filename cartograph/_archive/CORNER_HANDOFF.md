# Corner Rounding — Design & History

## Current model (2026-04-13)

> This section supersedes all prior "Operator N Response" sections below. Those are
> retained as a record of what was tried. Read this section first.

### Core principles

1. **Streets are positive geometry, blocks are negative space.** The corner band
   extends the street's cross-section outward around the bend. It does NOT fill a
   void, cut a block, or patch over existing geometry.

2. **The corner band is sidewalk.** Both streets' sidewalk arms merge at the corner
   into a single surface — no ownership, no "which street's sidewalk wins." In real
   life you walk one sidewalk, it curves, you're on the other. Same here.

3. **Curb is aesthetic, not measured.** A colored edge along the asphalt boundary.
   Configurable color/width. Not a material in the cross-section profile, not part
   of the measurement tool scheme.

4. **Treelawn always dead-ends** (ADA curb ramp). Sidewalk fills through behind it.

5. **Angle θ is a real variable.** Streets don't always meet at 90°. The corner
   geometry must work for any intersection angle, computed from actual street
   directions.

6. **The surface is a 3D scene base.** Real mesh geometry with proper normals,
   MeshStandardMaterial, receiveShadow. Must accept terrain and lighting.

### Corner band shape

- **Outside edge** (toward block): two straight lines meeting at angle θ. This is
  the block corner / property line.
- **Inside edge** (toward street): quadratic bezier curve (the curb line rounding).
  Formula: `ctrl = 2 × mid(P0, P1) − oo` (proven, don't re-derive).

The band is wedge-shaped: thick at the middle of the curve, tapering to zero at
each arm (where the arm's sidewalk ring already provides full width).

### Material by case

| Street A outer | Street B outer | Corner band |
|----------------|----------------|-------------|
| Sidewalk       | Sidewalk       | Sidewalk    |
| Sidewalk       | Treelawn       | Sidewalk    |
| Grass          | Grass          | Grass       |

---

## What works (confirmed)

- Rectangular arm rings: all materials, split at IX, perpendicular cuts. WORKING.
- Ring model eliminates same-street overlap and priority conflicts.
- Quadratic bezier from P0 to P1, ctrl = 2*mid - oo, validated across all 4
  quadrants with the oo↔ii distance-check swap.

## Key geometric values

```
IX = [-134.2, -325.6]
perpA (Rutger)  = (-0.233, 0.973)    perpB (Missouri) = (-0.949, -0.316)
dA (tangent)    = (0.971, 0.238)     dB (tangent)      = (-0.320, 0.947)

Rutger:  sidewalk 7.4→8.9, treelawn 6.1→7.4, asphalt 0→6.1
Missouri: sidewalk 4.75→7.5, asphalt 0→4.75

NW corner (sA=+1,sB=+1): oo = (-144.38, -318.93), 12.17m from IX
NE corner (sA=+1,sB=-1): oo = (-129.75, -315.35), 11.17m from IX
SW corner (sA=-1,sB=+1): oo = (-138.65, -335.85), 11.17m from IX
SE corner (sA=-1,sB=-1): oo = (-124.02, -332.27), 12.17m from IX
```

---

## History of approaches tried (sessions 1-4, all superseded by current model)

These are retained so the next operator doesn't re-attempt them.

### Session 3: Corner bands from oA→oB (IX endpoints)
- Arc endpoints computed at IX, offset by halfwidths
- Ctrl = oo (outward bow): ring around IX, not corner rounding
- Ctrl = 2*mid - oo (inward bow): hidden under full-length asphalt (pri 8)
- At pri 10: ring visible but disconnected from arms

### Session 3: Arm extensions + small arc at oo
- Extended arm strips 8m past IX
- Arc at oo adds geometry but doesn't subtract — sharp L-corner persists
- Fundamental issue: overlay adds same-color geometry inside already-filled region

### Session 4: Triangle fans
- Fan from oo, fan from IX, fan from ii — all produce PBR color artifacts
- Different triangle shapes = different shadow map sampling = visible color mismatch
- Merging into same BufferGeometry did NOT fix it (position-dependent, not draw-call)

### Session 4: Continuous quad strip (pullback + arc + pullback)
- Pulled arms back from IX, built corner as one continuous strip
- Arc still near IX, buried under asphalt coverage
- Repositioned arc to oo: visible, but creates L-shape overlap with arms

### The blocker that led to the 2026-04-13 reframe

All prior approaches treated the corner as a **patch** — overlay geometry added on
top of existing arm strips. This fails because:
1. Adding geometry doesn't remove the sharp corner underneath
2. Separate meshes shade differently under PBR (the color mismatch)
3. Priority-based stacking can't simultaneously let asphalt cover the crossing
   AND let sidewalk show at block corners

The 2026-04-13 session reframed the problem: the corner is not a patch, it's an
**extension of the street's cross-section**. The block is negative space. The curb
is aesthetic, not structural. Only one material (sidewalk) needs a corner band.

## Files

- `src/components/StreetRibbons.jsx` — POC component (arm rings working)
- `src/components/CORNER_DEBUG.md` — design document (updated 2026-04-13)
- `cartograph/NOTES.md §12` — architecture, measurements, failed-approach table
