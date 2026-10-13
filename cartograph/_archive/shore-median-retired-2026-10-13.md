# The shore median's lines, retired 2026-10-13

## From `docs/briefs/BRIEF-the-ground-knows-its-height.md`

Moved from `docs/briefs/BRIEF-the-ground-knows-its-height.md` (live home) by Tern when Jacob dropped the shore median
("drop it", 2026-10-13, replacing his 2026-10-04 ruling; "We want the sand color under the water, though"), relayed by
Boz. The median's brief is `cartograph/_archive/BRIEF-the-shore-is-closed-2026-10-13.md`. The coast-run `h` line was
also rewritten for `lineAt` (73eee209). Each block below is the text as it stood.

```
- Readers on the drawn ground (`src/lib/drawnGround.js`): d05e3cc1, c7c433e5, and b0e65999 (the shore median and the
  revetment).
```

```
- The shore: ruled (794b7911). A coast run's `h` is high water, `waterLevels(terrain.water).highAt` (c227acaf).
```

```
  `RIBBONS §1` (how a coast arrives), and `cartograph/_archive/BRIEF-the-shore-is-closed-2026-10-13.md` (the shore median; its step 3 treatment
  rules are MATERIAL, grain and handoffs, and stay there; the SHAPE and HEIGHT of the waterline are this brief's).
```

```
| the shore median's sand edge (lidar marching squares, 1 m) | `cartograph/bake-shore-median.mjs` → `bake-ground.js`'s `shore` group |
```

```
PilgrimMonument, LafayetteParkBody's ponds, stairs and title, ShoreMedian, and the revetment
```

```
   ⭐ **Huron's shore crack (§4.6) is the same class**: its sand vertices sit 5.5–5.7 mm (ε) off the beach edge where
   the median meets ①'s two-sided coast stroke. Re-baked offline with the median on the 1 mm lattice, it is unchanged
   (0.40 m step). Not the median's rounding. ▶ `crack-site.mjs <slab dir> huron 1416.8 -320.5`
```

```
   ✅ The 1 mm lattice has one home, `src/lib/lattice.js` ▶ `checks/claims-the-lattice-has-one-home.mjs`. ⏳ Still: the
   median rounds its output to the cm (`bake-shore-median` `toRing`), and other grids keep their own values (lattice.js).
```

```
Still to go: the median's marching
squares as a shape source, with (a). 
```

## From `docs/briefs/BRIEF-the-coast-from-the-lidar.md` (live home)

```
- **The only lidar trace is downstream of ①, and at the wrong height.** `bake-shore-median`'s marching squares trace
  y = 0 (the datum), not high water, and read the slab.
```

```
  - a coastal bake with no current shore median refuses, except the Bake's first pass, which is stamped
    `shore: "pending"` and cannot ship (76fb11db, 5ffe8dd7);
```

```
`bake-terrain`'s `waterDatum`, `bake-shore-median`,
   `waterLevel.mjs`
```

```
   coast source, and the median's marching squares as a shape source), how
```

```
  - A coastal scratch bake needs `shore-median.json` in its out-dir, or it now refuses (by design).
```

## From `docs/briefs/BRIEF-the-coast-runs-on-past-the-rim.md` (live home)

```
| `cartograph/bake-coast-distance.js`, `cartograph/bake-shore-median.mjs` |
```

## From `docs/briefs/BRIEF-water-glint.md` (live home)

```
**Shingle** holds the shore median (ground, revetment, bed);
```

## From `cartograph/OPERATIONS.md` (the register; the median has no knob or step left)

```
- ⭐ **The shore median** *(ruled 2026-10-04)* — the ground between the **drawn shoreline** and the **lidar's waterline**, read at the elevation source's finest pixel. The waterline is **traced as one continuous line** (marching squares on a 1 m grid), and the median is where the drawing and the lidar disagree, touching the shore. The bake prints its area each way, its mean width, where the two lines drift farthest apart, and the hectares where the lidar has **no value** (not known, not drawn). **See it:** Stage (or Preview) › Diagnostic › *Shore median* — session-only, never saved — paints it solid with the revetment hidden — orange where the lidar ground runs into the drawn water, magenta where the lidar water reaches behind the shore, its edges in cyan. **In the slab it is the town's sand:** the ground bake paints the median as a `shore` sand layer in the one ground plane, above the land-use and below every road, only when the median was walked on the shoreline that bake writes. A town that draws a coast and has no such median **refuses to bake**, naming the file. The one exception is the Bake's first ground pass (`--shore=pending`), which writes the shoreline the median is walked on and stamps the slab `shore: "pending"`; the Bake then walks the median and re-runs the ground (`ground-shore`) without the flag. ▶ `node cartograph/bake-shore-median.mjs --scene=<id> [--out=<dir>]`
```
