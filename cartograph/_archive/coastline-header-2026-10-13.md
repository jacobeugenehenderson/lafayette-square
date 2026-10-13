# coastline.mjs header — retired 2026-10-13 (Tern)

The OSM coast stopped being ①'s coast source and the drawn water's outline: `bake-coast.mjs` draws both from the lidar at high water (BRIEF-the-coast-from-the-lidar; Boz's ruling). The file became `coastVerify.mjs`, the verifier's instrument. Its live doctrine (stroke the ARC, never the ring; the coast is not the disc) moved into `bake-coast.mjs`'s header. The header as it stood:

```
/**
 * coastline.mjs — THE COAST, AS A CLOSED RING, FOR ① TO EXCLUDE FROM THE bb.
 *
 * ⭐⭐⭐ (Jacob, 2026-09-20) "it is both; we see the difference between land and water, and
 * the geometry creates the water field and on the other side (land-ward side) closes the
 * rest of the LU polygons, especially the dead-ends."
 *
 * ⇒ The coast is COMBINED with the street ink and EXCLUDED from the bb in one move, so the
 * land faces come out bounded by the coast and the water comes out as a discrete positive
 * object to be shaded.
 *
 * ⭐⭐⭐ AND THE SHORELINE IS ALSO STROKED AS A TWO-SIDED CHAIN (Jacob, 2026-09-20): "the lake is
 * a discrete polygon made of shoreline and bb. The OTHER SIDE of the shoreline isn't necessarily
 * a continuous ring; it is separate, via the protopoly, from the lake."
 * ⇒ TWO objects, not one. The closed RING is the lake face (shoreline + bb). The open ARC is ink
 * — expanded at ε like any chain, so the landward boundary is the protopoly's own edge, ε off the
 * water, carrying a per-vertex `left`/`right` stamp. That articulation is what a slipway T's into,
 * exactly as a street T's into a street; without it the coast is one anonymous clip edge and
 * nothing can meet it.
 * ⛔ THE EARLIER "NOT STROKED" RULING WAS MEASURED ON THE CLOSED RING and stands for it (square →
 * filled, circle → annulus, Lake Erie → 3 pieces). Its own wording names the safe case — "the
 * stroke is only safe for OPEN polylines" — and `clipToRect` already yields exactly that: the
 * single longest run inside the bb, both ends ON the bb edge. ⇒ We stroke the ARC, never the ring.
 *
 * ⛔ THIS IS NOT THE DISC AND MUST NEVER BECOME IT. `RIBBONS §1` forbids the *circle* from
 * deciding block geometry because the circle is a render knob. A shoreline is ground truth
 * (`H-4`), so it closes faces — and the circle still stamps LAST, over the result, and the
 * radius remains the SSoT. An earlier attempt carved the disc up front and wrote the result
 * beside the radius; that inverted which one was the source of truth and is why this module
 * produces geometry and writes nothing.
 *
 * ⭐ WHAT THIS FILE IS NOT, because each was tried and measured: not a far-field closure (the
 * bb closes the arc, so no invented constant survives into the result), not a chain stroke
 * (fragments on a closed ring), and not a replacement boundary (that inverted the SSoT).
 */
```
