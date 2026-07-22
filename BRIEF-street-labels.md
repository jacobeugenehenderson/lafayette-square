# BRIEF — Street labels: repeat, size-to-width, runtime LOD

**You are a fresh implementation specialist** on the Cartograph kit. Your job is the street-label
overhaul described below — nothing else. The *design is already settled by Jacob* (below); do **not**
re-derive or re-litigate it. If the code contradicts a decision here, **surface it** — don't silently
diverge. Work in a worktree.

> **Spawn as a SINGLE serial agent — do not parallelize.** The five build steps touch the same
> load-bearing shared files in sequence (`SceneLabel.jsx`, `MapLayers.jsx`, `LafayetteScene.jsx`,
> `streetLabels.js`, `bake-labels.js`), and each step must be eyeball-verified before the next.
> Parallel agents would collide on those files (`[[feedback_load_bearing_files_serial_dispatch]]`).

## Route first (mandatory)
`CLAUDE.md` gate → `ORIENTATION.md` → `README.md §⭐ START HERE`. Then read the label path end-to-end
before editing: `cartograph/bake-labels.js`, `src/lib/streetLabels.js`, `src/components/SceneLabel.jsx`,
`src/cartograph/MapLayers.jsx` (label render ~L790), `src/components/LafayetteScene.jsx` (~L1331–1385),
`src/cartograph/Panel.jsx` (`LabelsSubsection` L271, `LABELS_DEFS` L71), `src/components/LafayettePark.jsx`
(`ParkTitle` + `ElevatedGroup` L748). Doctrine: `[[project_labels_encourage_walking]]`, slab-is-the-contract,
ground-conformance (ORIENTATION §8), `[[project_preview_equals_ls_literally]]`.

## The problem
Labels exist but aren't helpful: **one label per street**, dropped at the longest chain's midpoint
(`bake-labels.js:computeLabels`), so a long street reads unlabeled wherever you're actually looking; and
they're **too small**. `SceneLabel` sizes `fontSize = size × clamp(widthM/12, 0.5, 2.0)` — a timid,
reference-normalized tie that throws away the real widths.

## Settled design — Jacob's rulings (do not re-derive)
- **Size law:** `fontSize = k × widthM`, **floored** for legibility, **no ceiling**. Drop the `/12`
  reference and the 0.5–2.0 clamps — proportions fall out of the real (calculated/authored/custom)
  widths. `k` = the panel **Size** knob: **Auto** by default (absence = auto, the codebase's
  inherit-on-absent pattern), overridable as a **proportional scale**. Custom width overrides flow into
  label size for free via `widthM` — no separate bookkeeping.
- **Density = repeat + runtime zoom-LOD.** Labels **repeat** along each street; a camera-distance LOD
  thins them far out (**≥1 per street in view**) and fills them in as you pull closer. Compute at
  **runtime** (universal-player capability) — cheap, a hood is only dozens of chains. **No baked density
  tiers.** Reuse the camera-distance culling pattern the trees use (`tree-building-frustum-culling`).
- **Fit / abbreviate:** per placement, run length (`height × glyph-aspect × chars × tracking`) is checked
  against the straight run available; overflow → **abbreviate** (dictionary below) → re-check → **else
  drop** (never spill across the cross-street). Apply the **least** abbreviation that fits, stepwise:
  full name → abbreviate suffix → also directional → also `Saint` → still overflows ⇒ drop.
- **Visibility:** default-**on** in authoring / all maps; player keeps the **hero shot clean**, browse
  shows them (the existing `labelsReady`/`labelGateMode` hero gate stays). Poured into the slab; toggled
  only in **authoring** (design/layout troubleshooting) — **no consumer show/hide control.**

### Abbreviation dictionary
Case-insensitive match on **word boundaries**; emit the canonical casing shown. **Suffix** = last token,
**directional** = first/last token, **`Saint`** = first token (its `St.` is distinct from the `Street`
suffix `St` — position disambiguates). "Way" has no shorter form; leave it. Don't abbreviate the
proper-name body, only these generic tokens.

```
Suffix:
  Alley→Aly      Avenue→Ave     Boulevard→Blvd  Bridge→Br     Circle→Cir
  Court→Ct       Cove→Cv        Crescent→Cres   Crossing→Xing Drive→Dr
  Expressway→Expy Freeway→Fwy   Gardens→Gdns    Grove→Grv     Heights→Hts
  Highway→Hwy    Junction→Jct   Lane→Ln         Loop→Loop     Parkway→Pkwy
  Place→Pl       Plaza→Plz      Point→Pt        Road→Rd       Route→Rte
  Square→Sq      Street→St      Terrace→Ter     Trail→Trl     Turnpike→Tpke
  Walk→Walk      Way→Way

Directional (prefix or suffix):
  North→N   South→S   East→E   West→W
  Northeast→NE  Northwest→NW  Southeast→SE  Southwest→SW

Prefix:
  Saint→St.   Mount→Mt   Fort→Ft
```
Extend the table if a poured town surfaces a suffix it lacks — but keep it a **shared, data-driven
table**, not scattered string checks.

## Architecture (settled)
- **Bake slims to "gate + emit geometry":** `labels.json` evolves from single points → **named,
  hood-clipped polylines + `widthM`** (`{ name, widthM, points:[[x,z]…] }[]`). Keep the boundary gate
  (`makeMembership`) in the bake — clip polylines to in-hood portions so the runtime lays out on whatever
  geometry it's handed. Bake stays wired in the pour (`serve.js:2085`).
- **New shared runtime layout module:** polylines + live camera → placements (size law + repeat +
  fit/abbrev + LOD). Consumed by **both** `MapLayers` (Designer) and `LafayetteScene` (player) via the
  existing `streetLabels.js` → `SceneLabel` path, so they never drift.
- **Panel:** add the **Park Title** row (`{ id:'parkTitle', label:'Park Title' }`) to `LABELS_DEFS`
  (it already exists in `CartographSurfaces.jsx:169` but not the Tools panel; relabel the existing row
  `Labels`→`Street Labels`). Make **Size** the Auto/override `k` knob. Keep the font + effects controls
  (Weight/Fill/Halo/Tracking/Case/Font/Opacity) as-is.
- **Park-title cutoff (the "Lafayette Park" clip):** it's the authored `ParkTitle`, occluded by the
  terrain contour. Lift it above the **max** terrain under its footprint (extend the `ElevatedGroup`
  sampling) so the contour stops clipping it.

## Build order (each step must be eyeball-able before the next)
1. **Bake → named polylines** (data foundation) + confirm hood-clip.
2. **Shared runtime layout module** — size law + repeat + fit/abbrev (no LOD yet), wired into both renderers.
3. **Zoom-LOD culling** on top.
4. **Panel** — Park Title toggle + Auto/override Size.
5. **Park-title terrain lift.**

## CSS
The label **text** is TroikaText/SDF in the WebGL canvas (drei `<Text>`) — its styling (fill, halo,
size, tracking, weight, font, opacity, case) is three.js props on the `labels` store block, **not CSS**;
CSS can't reach the canvas, so none of it goes in the master CSS. The only DOM surface is the **panel
UI** — `LabelsSubsection` already uses the `carto-*` classes with no inline styles. Any new panel rows
(Park Title toggle, Auto/Manual size affordance) **reuse those existing `carto-*` classes**
(`[[feedback_use_the_css_doc_not_inline_styles]]`); add a class to the master CSS only if a genuinely
new widget needs one — never inline styles.

## Bounds
Labels only. No consumer-facing toggle. No baked LOD tiers. Don't touch the width/measure system (you
*consume* `widthM`, you don't change how it's computed). Surface any scope drift to Jacob before widening.

## Acceptance
Verify by the operator's eye (proxy ≠ eye): labels are legible, **repeat** along streets, **grow/thin
with zoom**, sized proportionally to real street width, hero stays clean, and "Lafayette Park" is no
longer clipped by the ground contour. Designer and player must render identically (shared module).
