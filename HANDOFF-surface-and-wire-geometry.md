# HANDOFF — Surface & wire the missing geometry (highways · frontage · land-use · medians) through the panel into the slab

**Status: scoped, dispatch-ready (2026-06-16, Boz). Branch `curb-offset-draw`.** ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → this brief → `SLAB-CONTRACT.md` (the cartograph↔LS boundary — *"if it isn't baked into the slab, the public never sees it"*) → `cartograph/PREBAKE.md §5` + `BAKE.md`. **The eye is the gate** (`feedback_proxy_render_is_not_the_operator_eye`) — Jacob on the lit app, all four views.

**One line:** every layer the operator expects must **SHOW in all views** (Survey · Section · Design · Stage · Preview · public) **and be WIRED through the Design panel into the baked slab.** Today several are live-only, undetected, or half-wired. This is the pre-DataWall "make it all visible + addressable" sweep — geometry plumbing, not new SHAPE construction.

> Consolidates from `BACKLOG`: "Slab-content (remaining: overlays / highway-class asphalt)", the C5/D4 land-use-faces thread, and grade-sep "awaiting eye." Those lines are struck and pointed here.

---

## The four gaps (recon 2026-06-16, file:line confirmed)

### G1 — Highways + frontage roads: a REGRESSION (the switch to flip), not a build
**Jacob: "we were showing them and they were wired in the panel — a switch to flip." Confirmed.** The highway group (`HIGHWAY_CLASSES` = motorway/trunk + links/ramps) is **excluded from the face-walk** (`tileGround.js:1267`) and **stroked separately** into a **top-level `out.highway` group** (`:2652–2663`). Verified 2026-06-16: a live `buildTileGround` produces **12 highway rings**, and `layerVis.highway = true` in `design.json` — so **in Survey (live) they still render.** But the freeze only serializes the **per-tile `_shapeArtifact`**, which **does not carry the top-level `highway` group** (verified: `_shapeArtifact` tiles have no `highway` field). So commit **`4924d9a`** ("gate the non-Survey render" — Section/Design now consume the frozen `shape.json` per `freeze-the-curb §1b`) **dropped highways/frontage out of every non-Survey view.** The panel toggle, bake routing (`bake-ground.js:384–398`), and runtime gate (`BakedGround.jsx:59–70`) are all already wired — only the **frozen artifact is missing the group.**
- **Fix (surgical):** include the `out.highway` group **in the frozen artifact** (`shape.json` — alongside `_shapeArtifact`, or as a sibling group), and have the frozen consumer (`BlockGeometryV2Debug`, the `sectionFrozen` path) read + render it. The toggle then governs it in every view. This is a *restore*, not new construction.
- ⭐ **Quality bar (Jacob): highways + frontage must be drawn ATTRACTIVELY — enough segmentation.** The motorways/links carry **bezier segments** (curve-primitive; e.g. `motorway 2`, `motorway_link 26` have `bezier` runs) and curve/ramp hard. The highway stroke (`strokeOpen`, `tileGround.js:2652`) must **tessellate those curves finely enough to read smooth, not faceted** — verify the highway centerline goes through `tessellateStreet` (the one curve→points helper) at an adequate density before stroking, the same way the local-street curves do (`HANDOFF-concentric-curb-curved-streets`/curve-primitive). When the group is restored to the frozen artifact, **freeze the tessellated curve**, not a coarse polyline. Gate: a curving ramp reads as a smooth arc on Jacob's eye, no facets.
- **Frontage:** there is **no separate `frontage` layerVis key** — frontage was almost certainly **riding the highway group** (links/ramps in `HIGHWAY_CLASSES`) or rendering as ordinary streets through the face-walk (which *do* freeze, so those still show). ❓**Confirm with Jacob what "frontage" means here** before adding any detection: if it's the highway-class links, G1's restore covers it and **no new detection is needed.** (The recon found no dedicated frontage detection; only build that if Jacob means genuine service/frontage roads not currently in the highway group — see Truman, G2.)

### G2 — Truman's frontage peel-off (inclusion/exclusion) — confirm scope
Truman's frontage road peels off the divided carriageways and the ROW spikes into a **needle** (Jacob's image). IF this frontage is already in the highway group, G1 restores its visibility but the **needle is a separate SHAPE/inclusion-exclusion issue** (where the frontage diverges, what's included). IF it's an undetected service road, it needs detection first. ❓**Resolve against G1's frontage answer.** The include/exclude *rule* is shared with Brief F's boundary work — coordinate. *(Defer the SHAPE half until the visibility regression G1 is restored and Jacob can see what's actually there.)*

### G3 — Land-use polygons: visible but NOT toggleable (the panel never writes the keys)
The bake **reads** `layerVis['lu-<class>']` (`bake-ground.js:785–792`) and the runtime **checks** it (`BakedGround.jsx:59–70`) — but **the Designer never writes those keys.** `CartographSurfaces.jsx:109–120` exposes per-LU **color only** (`kind:'lu'`), no visibility column; `toggleLayerVis` fires only for `kind:'layer'`. So land-use is **always-on, un-addressable** in Stage/Preview/public. Infra is ~80% there; the missing 20% is the panel control + the setter writing `layerVis['lu-*']`.
- **Fix:** add a per-LU **visibility toggle** in the panel (`CartographSurfaces.jsx` Land-Use tab + `Panel.jsx`), wire it to `setLayerVis('lu-<class>', …)` (`useCartographStore.js:1323`). The bake + runtime gates already consume it.

### G4 — Medians want the same wiring (Jacob: "goes for medians too")
The divided median is a **derived walked face** painted to the `median` class (`RIBBONS §1`+§3.5). It needs the **same per-class visibility + material** treatment as land-use (G3) — a panel row writing `layerVis['median']` / its color, consumed by the bake + runtime.
- **Fix:** treat `median` as a first-class toggleable/colorable layer alongside the LU classes in G3's panel work.

---

## The wiring contract (the pattern every layer must satisfy)
For a layer to be correct it must traverse **all three legs** — the recon confirmed which leg each gap is missing:

| Leg | Where | Highway | Frontage | Land-use | Median |
|---|---|---|---|---|---|
| **panel → store** (`setLayerVis`/color, autosave `design.json`) | `CartographSurfaces.jsx` / `Panel.jsx` → `useCartographStore.js:1323` | ✅ | ✗ (no row) | ⚠️ color only, **no vis** | ✗ |
| **store → live render** | `BlockGeometryV2Debug.jsx` `isGroupVisible` | ✅ Survey | ✗ | ✅ (always-on) | ✅ |
| **store → frozen artifact + bake + runtime** | `bake-ground.js` `bakeLayerVis` → `BakedGround.jsx` `isGroupVisible` | ⚠️ **toggle wired, geometry NOT baked** | ✗ | ⚠️ reads keys panel never writes | ⚠️ |

**The SLAB-CONTRACT throughline:** what the operator sees in Survey only ships if it travels through the **bake into the slab**. G1 (highways not in the artifact) and G2 (frontage undetected) fail this; G3/G4 fail the panel→store leg.

## Build order (smallest-risk first)
1. **G3 + G4 — the panel wiring** (no geometry change): add per-LU + median visibility toggles writing `layerVis['lu-*']`/`['median']`; the bake + runtime already consume them. Pure plumbing, verify in Stage/Preview.
2. **G1 — bake highways into the frozen artifact** so they show in every frozen view + the slab. The toggle already governs; just get the geometry into `_shapeArtifact`/`shape.json`.
3. **G2 — frontage detection + routing + the Truman peel-off** (the SHAPE half; coordinate the include/exclude rule with Brief F).

## Acceptance (Jacob's eye, all views)
- Highways + frontage roads **render in Survey, Section, Design, Stage, Preview** and **bake into the slab** (public sees them); their panel toggles gate them everywhere — and they're **drawn attractively: curves/ramps smooth, well-segmented, no facets** (tessellated through the curve helper, frozen smooth).
- Land-use classes + medians are **individually toggleable + colorable** from the panel, in every frozen view.
- Truman's frontage road reads cleanly — **no needle/spike** at the peel-off.
- ⛔ Grid-safe: a normal block's faces/curb are untouched; only the missing layers appear.

## Coordination
- **Independent of the curb/face *construction*** (B/C/F) for G1/G3/G4 — these are panel + bake + artifact-emit plumbing. **G2 (frontage) touches `derive.js`/`skeleton.js` detection + `tileGround` routing**, which overlaps derive with Brief B's junction work — sequence or worktree.
- "Closed-before-now-open / more geometry than showing" (Jacob's item 2 aside) is the **open-perimeter-faces** symptom → **Brief F** (`boundary-trio`); G2's include/exclude rule is the shared seam.
- Rebuild-gated where the artifact changes (G1): re-freeze `ribbons`→`shape`, re-bake. Per the solo-repo rule, commit the bakes too (ask).

*Scoped 2026-06-16 from Jacob's pre-DataWall notes (#2 highways/frontage, #6 land-use+medians, + Truman's frontage/inclusion-exclusion). Net-new brief; B→`HANDOFF-junction-construction.md`, F→`HANDOFF-boundary-trio.md`, C→`HANDOFF-freeze-the-curb-in-the-first-bake.md`.*

---

## LANDING — G1/G3/G4 code complete (2026-06-16, code by agent)

> **Eye status (Jacob, 2026-06-16):** highways + median + the rest **showing and great** — G1/G4 eye-confirmed. **G3 verification DEFERRED:** the per-LU visibility selector lives in the **Stage** Surfaces panel, and Jacob isn't troubleshooting Stage yet — the wiring is in + traced-correct, exercise it when next in Stage. No rush.


**Frontage RESOLVED (Jacob):** frontage = the **highway-class links/ramps**, already in the highway group → **no new detection.** Frontage rides the highway toggle; G1 covers it. **G2 (Truman's needle) is a separate SHAPE/inclusion-exclusion fix — deferred** (not built).

**G3 — per-LU visibility · DONE.** `CartographSurfaces.jsx`: a `visKey()` helper (layers/median → own id, LU faces → `lu-<class>`); `isVisible` + the Visible checkbox now cover `kind:'lu'`, writing `setLayerVis('lu-<class>')` via `toggleLayerVis`. Bake (`groupLayerId` → `lu-<key>`) + runtime (`BakedGround.isGroupVisible` face → `lu-<id>`) already consume it — so a hidden LU is omitted from the slab. Also gated per-LU in the Designer's frozen + live render (`BlockGeometryV2Debug`) so the Design view honors the toggle live (WYSIWYG).

**G4 — median · DONE (incl. a real bake-drop bug).** Panel: a `{ id:'median', kind:'layer' }` row in the Land-Use tab → `layerColors['median']` + `layerVis['median']` (median is a **`mat` group**, not a face — `BakedGround` grass-shades `median` only as a material). **Bug found + fixed:** median geometry routed to `byFaceUse['median']`, but PAINT_ORDER has no `['face','median']` and `['mat','median']` read the empty `byMaterial` → **median was silently dropped from EVERY slab** (confirmed: no `median` group in `ground.json`). Fix: `bake-ground.js` routes `luByClass.median` → `byMaterial['median']` so `['mat','median']` paints it (color `layerColors['median']`, gated `layerVis['median']`, grass-shaded). Designer live/frozen view now colors median from `layerColors` (was `luColors`) + gates by `layerVis['median']`, independent of the lot toggle — WYSIWYG with the slab.

**G1 — highways into the frozen artifact · DONE (regression restore + smooth).** Confirmed: **the slab already carries highway** (`mat highway`, 5834 verts) — the regression was **only the in-app frozen views** (Section/Design read `shape.json`, a bare tiles array with no highway group). Fix: `shape.json` is now `{ tiles, highway }` (sibling group; legacy bare-array still read). Touchpoints — freeze (`BlockGeometryV2Debug` Survey-exit captures `tg.highway` rings), `freezeShape` guard (`useCartographStore`), the fetch parser (back-compat normalize), `sectionGeos` (builds the highway geo + `sectionOpen(frozenShape.tiles)`), the `sectionFrozen` + `surveyActive` render branches (draw it), and the bake writer (`{ tiles, highway }`). **Quality bar:** grade-sep centerlines are now smoothed **unconditionally** at 1.5 m before stroking (`tileGround.js` gradeSep loop) — independent of `STREET_SMOOTH=0` (that knob exists only to spare the fragile *concentric curb* offset; highways stroke flat, no fold risk) → frozen ramps are facet-free. Schema banked in `RIBBONS §"shape.json"`.

**⛔ REBUILD GATE — needs Jacob.** The on-disk `shape.json` is still the legacy bare array, and `ground.json` still lacks median. To make G1+G4 *visible*: **(a)** enter+exit Survey to re-freeze `shape.json` in the `{tiles,highway}` form (restores highways in Section/Design), and **(b)** re-bake the slab (`bake-ground`) to (re)emit `ground.json` with the median mat group + the smoothed highway. **Both regenerate Jacob's baked artifacts → his call; not run by the agent, his `public/baked/*` untouched.** Then the four-view eye gate (Survey/Section/Design/Stage/Preview). **Code verified: all edited files transform/syntax-check clean; every wiring leg traced — but the operator's eye on the lit app is the gate** (`feedback_proxy_render_is_not_the_operator_eye`).

*Files: `src/cartograph/CartographSurfaces.jsx` (G3/G4 panel), `cartograph/bake-ground.js` (G4 median routing + G1 shape.json wrapper), `src/lib/tileGround.js` (G1 highway smoothing), `src/cartograph/BlockGeometryV2Debug.jsx` (G1/G3/G4 render + freeze), `src/cartograph/stores/useCartographStore.js` (G1 freeze guard), `cartograph/RIBBONS.md` (schema).*
