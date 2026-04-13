# StreetRibbons Corner — Design Document

## Conceptual model (2026-04-13)

**Streets are positive geometry. Blocks are negative space.**

The street cross-section profile (asphalt, treelawn, sidewalk) is measured via the
cartograph measurement tool. Each material has a known width. At a corner, two
streets meet and their outermost materials need to extend around the bend. This is
**additive to the street**, not subtractive from the block.

There is no "void" at the intersection. The black area is asphalt — road surface —
and it is already correct.

## What the corner band is

The corner band is **sidewalk** (or grass if neither street has sidewalk). It extends
the outermost pedestrian surface material from one street around the bend to the
other.

Both streets' sidewalk arms **merge** at the corner. There is no ownership — the
corner is the merge zone, just as in real life (you walk one sidewalk, it curves,
you're on the other).

**Shape:**
- **Outside edge** (toward the block): two straight lines meeting at angle θ. This
  is the block corner / property line. θ is the actual angle between the two streets
  — NOT assumed to be 90°.
- **Inside edge** (toward the street): quadratic bezier curve. This is the curb line
  rounding the corner.

The band tapers to zero width where it meets each arm (at those points the arm's
sidewalk ring is already the full width).

## Curb

The curb is **aesthetic, not measured**. It is a colored edge rendered along the outer
boundary of the asphalt, wherever asphalt meets sidewalk or treelawn — including
around the corner curve. It has configurable color and width but is NOT a material
in the cross-section profile. It does not participate in the measurement tool scheme.

## Treelawn

Treelawn **always dead-ends** before the corner (ADA curb ramp constraint). The
sidewalk fills through behind the treelawn's blunt end. Treelawn never arcs.

## Material lookup by case

| Street A outer | Street B outer | Corner band material |
|----------------|----------------|---------------------|
| Sidewalk       | Sidewalk       | Sidewalk (merge)    |
| Sidewalk       | Treelawn       | Sidewalk (treelawn dead-ends) |
| Treelawn       | Sidewalk       | Sidewalk (treelawn dead-ends) |
| Grass          | Grass          | Grass (merge)       |

## Geometry requirements

- Real mesh triangles (BufferGeometry + MeshStandardMaterial + receiveShadow)
- Must accept terrain deformation and scene lighting — this surface is the base
  of a 3D scene
- All coplanar at Y=0 within the group; polygonOffset for depth arbitration
- NEVER use Y offsets for layer stacking

## What was tried in prior sessions and DID NOT WORK

These are documented to prevent re-investigation. See `cartograph/NOTES.md §12`
for the full table. Key lessons:

- **Overlay patches** (fans, bands, fills at higher priority on top of arm strips):
  Adding geometry doesn't remove the sharp L-corner underneath. Either invisible
  (same color over same color) or creates seams (different mesh = different PBR
  shading under MeshStandardMaterial).
- **Triangle fans** (from oo, from IX, from ii): PBR lighting produces
  position-dependent color per triangle. Visible artifacts even in merged mesh.
- **Y offsets**: Even 0.001m causes visible color/lighting differences.
- **Arc geometry near IX**: Buried under full-length asphalt priority.
- **Stencil buffer / custom shader discard**: No effect / crashed WebGL.

## Previous framing (superseded)

Earlier sessions framed this as "filling a void between streets" or "patching the
corner with overlay geometry." This led to fan-based approaches and the unsolved
color-mismatch problem. The 2026-04-13 reframe established that:

1. The corner is an extension of the street's cross-section, not a block modification
2. Only one corner band material is needed (sidewalk), not per-material bands
3. Curb is aesthetic (not a measured band)
4. The intersection angle θ is a real variable, not assumed 90°

## Files

- `src/components/StreetRibbons.jsx` — POC component (arm rings working, corners TODO)
- `src/components/Scene.jsx` — mounts StreetRibbons
- `cartograph/NOTES.md §12` — broader architecture and failed-approach table
