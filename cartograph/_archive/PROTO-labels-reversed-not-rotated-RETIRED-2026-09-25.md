# ① labels: "reverse, do NOT rotate" — RETIRED 2026-09-25

**Retired from:** `src/lib/tileGround.js`, `mintProtopolygon`, the comment above the stroke's uniform-winding flip.
**Retired by:** Gantry, landing `gantry/ink-cap` (Jacob's go, 2026-09-25).
**Live home now:** the comment above that flip, and `checks/claims-every-proto-edge-lies-on-its-owner.mjs` (side + span).

## Why it was retired

`labs` is per-edge (`labs[k]` names edge k→k+1), so reversing the ring must also rotate it: new edge k is old
edge n−2−k. The ruling below was measured while `booleanLabelled`'s forward scan handed each minted vertex the
NEXT surviving vertex's record, which partly cancelled the missing rotation. With the containing input edge taken
first, rotating is what the geometry agrees with. The side regression the ruling measured reproduces only with
rotation ALONE (huron: wrong side 149 edges / 12.8 km).
Re-derive: `CARTOGRAPH_SCENE=<scene> node scratch/proto-remint.mjs --data=<checkout> --oracle=<ribbons.json>`.
Measured at retirement, block edges with the wrong span (shipped → rotate + containing edge): huron 29.9 km → 59 m ·
provincetown 19.0 km → 1.3 km · hipointe-demun 176.4 km → 150 m · LS (re-mint) 27.1 km → 3 m.

## The retired text, verbatim

```
    // ⛔⛔ AND THE LABELS REVERSE WITH IT AND ARE **NOT** ROTATED. I rotated them here for an hour
    // on the reasoning that `labs` is per-EDGE, so a reversal must shift it by one — the same
    // correction that is right at `carryEdgeLabels`. IT IS WRONG HERE, and bisected: this ring is
    // [right pass forward, left pass BACKWARD], and each vertex is already paired with the span it
    // bounds by the `segI` argument above. Rotating on top of that shifts the pairing a second
    // time — and it does it ACROSS THE SEAM between the two passes, so a `right` label lands on a
    // `left` vertex and both blocks flanking the street write to one slot.
    // ▶ measured, ① re-poured both ways, same oracle: runs whose `side` disagrees with their
    // geometry **47 with the rotation, 2 without**; slots painting in two blocks **54 → 41**; and
    // the stamp gate did not move either way, so nothing recommended it.
    // ⭐ THE LESSON, and it is the one to keep: the SAME correction was right three times today and
    // wrong the fourth. "Per-edge arrays shift on reversal" is a property of a construction, not a
    // law of the file — check the construction each time.
```
