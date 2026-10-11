# ARCHITECTURE — "ribbons skip refinement" (excised 2026-10-10)

**Diary.** Retired for truth, not currency: the belief was false. Live home: `cartograph/ARCHITECTURE.md` §8
"Terrain doctrine" (Triangulation density).

## The excised text (ARCHITECTURE §8, Terrain doctrine)
> `groundConformity.js`'s `conformAndRefine` subdivides face/landscape polygons so per-vertex terrain sampling doesn't
> linearly-interpolate across a curving heightfield (the "foundations too tall / paths in midair on flat blocks"
> artifact; ribbons skip — their authored density already matches).

`bake-ground.js`'s group tiering carried the same belief: "Ribbon bands bypass refinement entirely."

## Why it was wrong (Talus, BRIEF-the-ground-knows-its-height §4.3; ruled a WRONG BELIEF by Boz)
The code did what the doc said; the doc's REASON was false. A band's "authored density" is its ring, and a straight
street's band has vertices only at its corners. Measured on the shipped slabs (`scratch/ground-height/walk-slope.mjs`):
- HPDM sidewalk: area-weighted longest triangle edge p50 59 m, p90 179 m, max 557 m; 89% of the area in triangles
  with an edge over 10 m (LS, Huron, Provincetown: 88–93%).
- The runtime lifts per vertex, so such a triangle is drawn as a chord. At HPDM tile 116 (fauquier-drive · right · 2)
  the walk's lawn-side edge, the edge of a 360 m triangle, was drawn 4–6 m under the terrain while its back edge,
  beside a refined lot, followed it: across ~1 m the walk rose 4–6 m where the field varied ~0.1 m. That is the
  stretched sidewalk Jacob reported (frequent on HPDM). ▶ `node scratch/ground-height/trace-stretch.mjs hipointedemun 116 fauquier-drive right 2 40 7`
- Rendered sidewalk cross-slope p90 at exag 1: HPDM 45% · LS 31% · Huron 82% · Provincetown 89%, against the field's
  own 8–19%.

Replaced 2026-10-10: every draped piece of the partition takes the adaptive policy the lots use.
