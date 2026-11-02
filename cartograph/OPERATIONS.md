# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/ORIENTATION/RIBBONS = developer). Engineer-internals behind these knobs live in `ARCHITECTURE.md`; the geometry in `RIBBONS.md`.

**The Cartograph has three functions, Stage · Preview · Publish, and the twelve steps sit inside them:** Stage holds 01 Extent · 02 Intake · 03 Skeleton · 04 Survey · 05 Seal · 06 Section · 07 Foundry · 08 Slab · 09 Look; Preview is 10 Preview; Publish holds 11 Publish · 12 Promote. These are the only names on the screens and in this manual: ▶ `node checks/claims-the-chain-has-one-set-of-names.mjs`

---

## Extent — define a new neighborhood and run the Foundry (no CLI)

> **The intake / step-0 tool: define any neighborhood by eye on a labeled aerial, then run the Foundry to make its rendered 3D Slab in one click — the whole intake→3D arc as one tool, no terminal.** `ExtentApp.jsx` + `BezierPen.jsx`; committed on trunk `curb-offset-draw` (not yet in prod). Reach it from the **`◎ Extent`** button in the toolbar. **Fresh arrival = no map** — nothing is fetched until you frame and Fetch. **The model (2026-07-20): you say what the neighborhood IS — an inclusion polygon — and correct the margin.** Search a place and inherit its published boundary, or click the bounding streets in any order and watch the ring close; exclusion loops and per-building toggles are corrections on top. The circle is the **Slab's disc, what renders**, not what decides membership.

The flow, top to bottom (the cheap edits auto-save; the one heavy op — **Foundry** — is explicit and folds Commit into the Foundry run):

1. **Search → Name.** Type a place, a ZIP, or ZIPs separated by commas, and hit **search** — the camera frames it, and **Name** fills with the place it found (the town, never the ZIP; ZIPs in different towns leave it blank). ⭐ **The web address names the scene and its Look** — the domain's name before the dot; it defaults to the Name's slug. Operations' answer shows beside it; *no Ward yet* only stops Promote. A bad or taken address is refused at Fetch; a declared-only folder is joined (▶ `node checks/claims-a-scene-is-named-not-numbered.mjs`). Nothing is fetched yet — only the draft is saved. Until you search, the screen is blank by design.
2. **Frame the neighborhood** on the labeled aerial. Pan/zoom the overhead view until the hood you want fills the frame — you're reading real street labels off the ortho photo (USDA NAIP, US only — the credit line at the bottom names the flight, or says there is no imagery), choosing the extent *by eye*. **Frame-then-fetch: "if you can see it on screen, it's in the list."**
3. **⚠️ Frame TIGHTER than feels natural.** A wide fetch makes **huge** artifacts and can OOM the Foundry run. An early wide test fetch (~5.4 km) produced a 180 MB map; a real ~3 km neighborhood is roughly **10× smaller**. Frame to the actual hood — a ring of margin, not half the metro.
4. **Fetch this view.** Reads the current viewport, writes a `geography.json` centered on the framed bbox, then pulls OSM + builds the skeleton for that area. This is the fetch — after it, the streets are known. ⭐ **It also finds the town's LIDAR now** (ruled 2026-09-23). The panel reports an `elevation` source like any other: a tile count, or **verified-absent** — *searched the whole ladder, this town has no lidar, do not search again.* ⛔ **Nothing is downloaded**; the fetch writes the tile list and the Foundry's terrain step range-reads it, so a town's ~1 GB of 1 m lidar costs a few MB to read. For a town on the water it also records **when that lidar flew and the geoid it was delivered on** (`raw/elevation-flights.json`), so its heights and the water level are on one basis.
5. **⭐ Author the BOUNDARY — say what the neighborhood IS.** This is the step that decides membership. Three ways in, all producing **one inclusion polygon** (stored lon/lat, so it survives a re-frame): **(a) adopt a published ring** — if the searched place has a gazetteer boundary it is drawn **violet and INERT**, deciding nothing, and becomes your polygon only when you press **`⬡ Adopt the published boundary`** (`release` undoes it). ⛔ **It used to seed the polygon on search**, so the hint silently *was* the membership decision (fixed 2026-09-19). Rings range from LS's coarse 26-point outline to Księży Młyn's 815-point cadastral trace; **(b) click the bounding streets** on the labeled aerial, **in any order** — the ring rebuilds from the junctions they share, and a street that doesn't meet two others lights up as a named gap instead of failing silently; **(c) draw it.** Because the ring is made of real streets meeting at real junctions, it never slices a building or halves a block. ⛔ **Street names come FROM the fetch** — there is nothing to click until step 4 has landed.
6. **Set the disc — what RENDERS, not what decides.** The circle is the **Slab's disc**: the ground plane and the soft fade at the rim. Drag the **in-scene radius handle** to size it — the hood's actual extent plus slight aesthetic padding. The soft edge at the rim is the **Look's**, set in **Look › Horizon › Edge**; Extent shows it as a read-only dashed ring inside the circle. ⛔ **The circle must stay inside the fetched data:** commit and re-scope refuse a radius whose disc reaches past the town's bounding box (▶ `node checks/claims-the-disc-stays-inside-the-bb.mjs`). ⚠️ **The disc HIDES what's outside it, but it does not decide membership** — the polygon does (step 5). An *un-authored* scene auto-fits the disc to every fetched building, which is why a fresh fetch shows a huge, off-center circle; that is the disc needing authoring, not the fetch being wrong. ⚠️ **Do not resize the fetch when the disc is the problem** — the recurring trap (`EXTENT-DESIGN §3.3`).
7. **Draw exclusion loops (the pen) — a CORRECTION on top of the polygon.** Toggle **"✎ Draw exclusions"** and loop the strays to carve them OUT — a commercial strip, the far side of an arterial, forest/mountain past the real edge. The loops are **real editable bezier curves**: click for corner anchors, click-drag for smooth handles, drag an anchor to move it, click a segment to insert, select + Delete to remove. **`Space` suspends the pen so you can pan.** The loops persist (lon/lat) and **reopen fully editable in a later session** — this is the "keep fixing the bounds forever" contract. Membership = **`((polygon − exclusions) ∪ activate) − hide`**. ⭐ **A loop is a coarse sweep and a per-building toggle beats it** (ruled 2026-08-04): lasso the commercial strip out, then click the one corner shop you want back — **the click wins.** To re-remove it, un-click it or hide it. `hide` always wins. *(`NEIGHBORHOOD-INPUTS §5.2` carries the full ordering.)*
8. **Per-building override (the ragged edge — optional).** For the idiosyncratic margin one exclusion loop can't express cleanly, click a single footprint to force it: **hide** an inside building, **activate** an outside one. Saved per scene (`building-overrides.json` = `{ activate, hide }`, **git-tracked** — reproducible source, not just a Foundry output). Layers on top of the loops.
9. **Foundry.** The one heavy button: **apply the extent, then run the Foundry.** On a first run it commits (writes the disc to `neighborhood_boundary.json` and marks the scene committed; ⛔ it **never** re-centers the frame or reprojects: `EXTENT-DESIGN §3.3`); on a committed scene it re-scopes in place. Then the Foundry runs (derive → ribbons → the Slab) and opens Plan **in Survey** (▶ `node checks/claims-extent-lands-in-survey.mjs`). The run is LONG: derive processes the whole fetched area, so frame tight (step 3).
   - ⭐ **What changed** shows beside the button: *"This Foundry run changed the street layout: tiles 138→132 · …"*. Pressing Foundry is the decision to accept that change; it is never applied silently.
   - ⛔ **A failure shows beside the button too, naming the step**, and everything the Foundry run wrote is restored: boundary, draft, `map.json`, the ribbons and Plan camera. One consistent state either way (▶ `node checks/claims-a-failed-apply-leaves-one-state.mjs`).
10. **Draft vs applied.** The radius slider is a **draft**, autosaved as `draftRadius`. The map draws the **applied** disc, whose one home is the boundary file. When they differ, the panel says *"draft X m · applied Y m → run the Foundry to apply it"*, and the Foundry button is live for that reason (▶ `node checks/claims-radius-has-one-home.mjs` lists every town with an unapplied draft). Membership and loops, too, reach Plan and the Slab only after a Foundry run. **A committed hood cannot be re-centered**: the frame origin is frozen at the fetch center, and a moved hood centre is stored **off-origin on the disc**.

> **⭐ The inclusion polygon is first-class (2026-07-20).** It is authored, persisted and PRESERVED — `commit-extent` and `rescope` both accept one, and neither drops it. Previously a Foundry run deleted it silently, which left HPDM's hand-authored 4-point boundary one run from gone. A scene with no polygon falls back to the disc, so excluder-era hoods come out of the Foundry byte-identical.

### The two-pass fetch — the square is derived from the DISC

`node cartograph/fetch.js --scene=<id> --pass=light|heavy [--dry-run]`

- **light** — the outline fetch. The generous envelope, and only what a boundary can *run along*: `highway · waterway · railway · boundary`, plus the painted footprints you need to judge an edge. Cheap, reversible, re-runnable.
- **heavy** — the full fetch. The Foundry's material (`landuse · leisure · natural · amenity · barrier · surface · man_made`), scoped to **the square containing the disc + 25%** — ⛔ **not** to the frame. It *augments* the outline fetch and never clobbers it.
- **omit `--pass`** — the pre-split behaviour: one envelope, everything.
- **`--dry-run`** — resolve the envelope, run the containment gate, print, stop. Touches neither Overpass nor disk. Use it to see the gate refuse before you trust it.

⭐ **Why it is derived from the disc and not the frame:** `bbox ⊇ disc` then stops being a check that can fail. Deriving the box from the search — which is what the single-pass tool does — is how altadena's zone came to sit **1,906 m** outside its own envelope, silently: nothing errors, the streets just stop on one side. ⛔ The full fetch **refuses** rather than fetch a square the outline fetch never acquired.

⚠️ **Only the CLI is split so far.** The Extent tool still performs one undivided fetch, so the square does not yet centre the circle in the UI. → `_archive/EXTENT-EXCAVATION-DIARY §0.1`, `EXTENT-DESIGN §3.3`.

### ⭐ The three sizes and the two centers — read this before you touch a radius

The single most re-derived thing in this tool. **Nested: hood < disc < bounding box.** Two *independent* centers, and they are not the same value:

| | What it is | Can it move? |
|---|---|---|
| **The bounding box** (the fetched square) | the frozen frame — the "forever safety zone," sized at **radius + ~20–25%** (a *percentage*, so it scales with the hood; a flat 1000 m is enormous on a small hood and trivial on a big one) | **grow: yes** (append) · **shrink: yes** (destructive — you lose the trimmed data) · ⛔ **MOVE: never** |
| **The disc** (what renders) | the ground plane / the world's horizon; radius = the hood's real size + slight aesthetic padding | freely, forever — its centroid is a **draggable handle**, independent of the frame origin |
| **The hood** (the polygon) | what actually decides membership | freely (re-author, re-run the Foundry) |

⛔ **Never move the frame origin of a committed hood.** Growing or shrinking *from a fixed center* leaves every retained coordinate and building id exactly where it was — block keys, authored corner/hero work, and content anchors all still resolve. **Moving** the origin reprojects everything at once and re-orders identity; that is the failure that once took a hood's content from 84 anchors to 5. The machine enforces it by never moving the origin at all (step 10) — the old opt-in "re-center guard" is gone, so there is no longer an override to reach for. **A correctly-isolated hood sitting off-center in its box is EXPECTED, not a defect** — that's the two centers doing their separate jobs.

⚠️ **Inside the forever zone, these are live and make no step re-run:** hide/reveal buildings · change the disc radius · move the disc centroid. That is what the ~20–25% padding is *for*. *(Design of record: `EXTENT-DESIGN.md §3.3`.)*

## Density — "more lamps and trees" (the vibes knobs)

*Density is product, not decoration. Both populations are a **union of wells**, deduped — never one well winning (`FOUNDRY.md §4.5`).*

- ⭐ **Lamps — real where real, derived where necessary** *(2026-09-26, `ROADMAP H-17`)*. Three wells, every lamp stamped with its `source`, printed per Foundry run:
  - **`osm`** — the town's own `highway=street_lamp` nodes (`raw/osm.json` POIs, plus a `raw/osm_street_lamps.json` export where one exists). Real: a lamp in the road is **nudged** to the nearest legal ground, never deleted.
  - **`derived`** — `node cartograph/derive-lamps.mjs --scene=<scene>` → `clean/derived_lamps.json`: one side of every lit street, mid-treelawn. **Which streets:** residential up to primary, trunks, motorways; OSM `lit=no` never, `lit=yes` always. Invented: on illegal ground it is **dropped**, and it thins toward the rim.
  - **`authored`** — `data/<scene>/authored_lamps.json` (LS: the legacy `src/data/street_lamps.json`). Never moved, and wins any overlap. To add lamps by hand, add them here and re-run the Foundry.
  - **The spacing is not a knob — it is measured.** A town with ≥10 surveyed same-side gaps uses its own median; the rest use the pooled prior, one vote per town. ▶ re-derive it: `node cartograph/lamp-spacing.mjs --write-prior` (sample towns: `scratch/lamp-sample/fetch.mjs`). ▶ `node checks/claims-every-lit-town-has-lamps.mjs <scene>`.
- **Trees — the one knob that matters is `lu-policy.json`.** ▶ `node checks/claims-every-tree-candidate-is-accounted-for.mjs <scene>` prints every gate and its size for the town.
  - **hardscape paint** (pavement/sidewalk/asphalt) — **not a knob.** Surveyed trees here get *nudged* onto legal ground, because our strips are guesses and real trees win.
  - ⭐ **A block painted wetland, beach, dune or bare rock does not refuse a tree by its label.** The tree is judged by the OSM feature it actually stands in — marsh or sand refuses it, a **swamp** (a wooded wetland, by OSM's `wetland=*` subtype) or a wood keeps it, open ground under no feature leaves it to the canopy data. ▶ `node checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs <scene>` lists what each refused tree stands on.
  - **the land-use allow-model** — **This is your dial.** Drop a `cartograph/data/<scene>/lu-policy.json` — `{"commercial": "soft"}` — and those interiors become plantable. Per-scene, no kit edit, no code change. ⛔ **The kit defaults are NOT restated here** — they were, they went stale the day the vocabulary widened, and a class list in prose is quoted for months by people who cannot re-derive it. The `[lu-policy]` block the Foundry prints names every class, its kind and where the kind came from.
  - ⭐ **THREE GROUND KINDS, not two** *(ruled by Jacob 2026-09-20)*. `soft` = the census tree may stand. `hard` = the interior is forbidden to a tree — ⚠️ **and `hard` does not mean paved**: `beach`, `dune` and `bare` are hard because no census tree grows on sand or scree, and `greenhouse` (OSM `greenhouse_horticulture`) is hard because a greenhouse is a building, not a field. `planted` = green, and the planting is **specified** rather than free — a cornfield grows corn, an orchard grows fruit trees in rows. A `planted` row carries its own species: `{"agricultural": {"ground": "planted", "with": ["zea_mays"], "pattern": "rows"}}`, and the species ids are the same ones the roster and the Arborist already speak.
  - ⛔ **A `planted` class grows NOTHING today and the Foundry says so by name.** Nothing in the kit reads the planting spec yet — the Arborist is a species factory, `bake-trees` substitutes against a municipal census, and the policy only subtracts; there is a filter where there should also be a generator (`cartograph/_archive/BRIEF-field-shader-2026-10-04.md`). The face still paints its own colour, so the land reads as worked ground rather than going bald.
  - ⚠️ **An LU class the kit has never seen defaults to SOFT and announces itself** — wrong-but-visible beats wrong-and-silent (the HPDM bald-blocks lesson: 7.7% of that hood went bald with no warning). Check the `[lu-policy]` block the Foundry prints.
  - ▶ **`node checks/claims-every-lu-tag-has-a-home.mjs`** — fails, naming the tag and the town, when a town brings an OSM land-use tag that is neither mapped to a class nor declared not-a-land-use by name. It also fails when a tag is fetched but never bucketed, and when a class the producer can emit is missing from any of the six places the vocabulary lives.
  - ⚠️ Re-run the funnel check after changing the policy; and remember the Foundry's tree step needs the **frozen `shape.json`** — there is no honest forbidden-surface without it.
- **Ground rules** (`surfaces.mjs` `GROUND_RULES`; the town's values in `design.json#surfaces.rules.<rule>`, each OFF at strength 0): `canopyLitter` {strength, color} — damp, littered ground under trees, from the Foundry's contact-shadow channel, on every surface; `duneGrass` {strength, fadeBands, color} — sand greening into dune grass past the town's own beach band, by the distance to the water the Foundry measured (a town without that channel says so); `buildingFoot` {strength, widthM, color} — a bare band at each wall's foot; `buildingGreen` {strength, widthM, color} — yards: grass solid at the wall, breaking into clumps over dirt out to widthM; `pavedEdge` {strength, widthM, color} — worn ground where lawn or sand meets paving. Those three read `ground.rulemap.png` (`bake-ground-ao.js`; a Slab made before it says so when one is on). They reach the map through `bake-scene.js`. Lab: `&rules=<rule>:<strength>[@<widthM>]`, e.g. `&rules=buildingGreen:1@40`.
- **Which `design.json` the Foundry reads.** The town's fields (Survey widths, corners, land use, `curbWidth`, `terrainExag`, `trees`, `groveThreshold`, `water`, `lamps`, `pour`: `cartograph/lookDesign.mjs#TOWN_DESIGN_FIELDS`) come from the town's **home Look** (`public/looks/<map>/`) for every Look of it; everything else is the Look's own. A second Look that sets a town field differently **stops the Foundry**, so make that edit on the home Look. A missing or unreadable `design.json` refuses too. The Foundry never runs on kit defaults in its place. ▶ `node checks/claims-a-bake-reads-design-through-one-reader.mjs`
- **Building walls, per town** (`design.json`, read by `bake-buildings.js`): `buildingPalette` (the swatches a building is dealt, by id), `wallMix` `{material: weight}` (what a building OSM does not describe is built of — absent = `brick_red`, LS's default), `wallPalettes` `{material: [hex…]}` (a material's own swatches, so brick gets brick colours). Materials: `brick_red · brick_weathered · stone · stucco · wood_siding`; any other is refused. Palette changes show live in Look on a scene whose Slab carries `buildings.json` v3; a v2 scene shows them after its next Foundry run (▶ `node checks/claims-live-palette-equals-the-bake.mjs` lists the v2 towns). A building's fixed colour comes from `cartograph/data/<town>/building-overrides.json` (`overrides.<id>.color`) and never follows the palette.
- **Water — the bed and the shallows** (`design.json#water`, per town): `sandD50Mm` (the beach sand's median grain, mm — it sets how the bed slopes away from the shore, read from the USACE profile table) and `secchiM` (the town's measured water clarity, m — the depth at which the bottom stops showing; the shallows fade into it over the last 2 ft). Unset, the sand is 0.30 mm and the clarity Jacob's 8 ft — and the Foundry's terrain step **says** it used them. And **where the water stands**: `high` / `low` (a tide datum the town has — default `MHW` / `MLLW`) or, on a lake, `lakeLevel` (`LWD` or `mean` — required: a lake town's terrain refuses without it). Any of these re-runs the terrain step. ⭐ There is no Look control for `water`: it is edited in the file, and Stage's autosave keeps it.
- **Surfaces — which generator paints a land-use class** (`cartograph/surfaces.mjs`: grass, sand, crop, marsh, earth, litter). Every soft class and OSM ground overlay (garden, pitch, scrub, wood) has one; only paved classes (parking, commercial, industrial …) stay a flat fill. Override per town in `design.json#surfaces`: `{"classes": {"<lu>": "sand" | "grass" | "crop" | "marsh" | "earth" | "litter" | null}, "params": {"<surface>": {"<param>": <value>}}}`. Crop's authored knobs: `growFrac` (share of the season to full plants; harvest reverses at the same speed), `headlandRows` / `trackGaugeRows` (the untilled strip round each field's whole edge and the pair of wheel ruts in it, both × row spacing — needs a ground made with field-edge distances), `bedFrac` (bed top's share of a row), `clodSizeM` / `clodHeightM`, `quiltM` (patch size — each patch its own row direction, tone and planting day, parted by tracks; 0 = one patch per field), and the look — one rough grayscale map that is the colour, the depth (drawn with parallax near the camera) and the distortion: `soilRamp` / `plantRamp` (gradient maps, 1–4 `{t, color}` stops, dark → light) and `rowDistort` (× row spacing). Lab A/B: `?pom=0` = bump only; its dates, spacing and ridge height come from `references/` findings, the dates keyed by the town's state. Marsh / earth / litter (one ground-cover generator — vegetation in patches over soil): `coverFrac` (share of the ground under growth), `patchM` (patch size), `soilRamp` / `coverRamp` (gradient maps). Sand's authored knobs: `windFromDeg` (the town's shaping wind, ° it blows FROM; null = none), `sandRamp` (gradient map); `rippleSpacingM` / `rippleHeightM` are physics with no permitted source yet — absent until authored per town (preview in the lab: `&wind=<°>&ripple=<m>&rippleh=<m>`). The crop's rows need a ground made with field ids — re-run the Foundry's ground step after switching a class to crop (`node checks/claims-crop-rows-derived-per-field.mjs`). A parameter a surface needs and lacks is named in the console, never defaulted. Preview a remap in the lab first: `lab.html?look=<id>&at=class:<lu>&as=<surface>`.

## Survey — the hardscape-SHAPE tool

The hardscape silhouette: centerlines, smoothing, caps, anchor, road metadata, corner radius, curb.

- **Asphalt-edge handle** — `pavementHW` per side (the half-width of pavement).
- **Auto-smoothing** — a selected chain shows its raw points for editing; returns to the smooth curve on `enter`. Street smoothing rides **one knob** (`STREET_SMOOTH`) so the navy centerline and the curb are one curve by construction — never two copies kept in sync by hand (`SKELETON.md §3.5`).
- **Caps** — round / blunt / none, per dead-end (a free per-dead-end authoring choice; `SECTION.md §6`/D6a + G8 govern the *fill*).
- **Curb** — global width, its own material. `curbWidth` (metres) in the town's home Look (Survey › Streets › Curb, or `design.json`); a town that authors none draws the **kit's 6 in** (`src/cartograph/streetProfiles.js#KIT_CURB_WIDTH`, its one home). Survey › Curb shows the width and **kit** or **authored**, and ↺ un-authors it; every Foundry ground step prints the rung (`[curb] … — the kit's` / `authored`). An authored value that is not a number refuses. ▶ `node checks/claims-a-look-authors-its-curb-width.mjs`
- **One-way arrows** — a chain flagged `One-way` draws amber travel-direction chevrons on Plan's ground plane (overlay only — nothing the Foundry makes reads them). Hide them at **Design ▸ Streets ▸ One-Way Arrows**; it writes the Look's `layerVis.oneway`, so it is per-scene authoring like every other visibility toggle.
- **Marker (FAB)** — a freehand pen overlay for triage, independent of the authoring tools (`FEATURES.md §Designer`). Toggle the FAB to draw; each stroke persists immediately to `data/clean/marker_strokes.json`. Stack: **eraser** (click a stroke to remove it) · **undo** (drop the last stroke) · **clear all**. The server's `/<scene>/analyze` endpoint reports the parcels + blocks under the current strokes — circle a defect, ask "what's under here?" ⚠️ **OPEN BUG (2026-07-08): the overlay drifts saved strokes hundreds of m on reload** (`marker_strokes.json` centroids move between loads — a viewBox/frame mismatch). Use it for rough "what's-under-here" triage, **not** as a precise-coordinate source — it sent a whole debugging session chasing the wrong building. For frame-honest placement use skeleton geometry + OSM lon/lat through the current `geography.json`. See `[[project_marker_overlay_drift_bug]]`.
- **The corner-radius kit — three layers that stack at every intersection** (Blocks ▸ Shape):
  1. **Global `Corners` slider** — multiplies every IX radius for the active Look. `1×` = the kit's 15 ft (4.572 m, the local class row in `src/cartograph/streetClass.js`, `f-caltrans-corner-radii`); `>1` = bubblier; `0` = fully square (useful for sponsored "retro" mode). Dragging it *resets* both override maps on commit ("scale all corners to this × default").
  2. **`Edit corners` toggle → per-IX dot** — a big blue dot at each IX center; drag the radial distance from cursor to IX to set that IX's radius (homogenizes the IX). Right-click an IX dot = **revert that IX** (clears its per-IX + per-corner overrides) without touching the rest of the map.
  3. **Per-corner cyan dots** — adjust a single corner alone, for true corner cases.
  - **Color coding:** blue/cyan = default · gold = operator-authored · white = mid-drag. Resolution at render: per-corner → per-IX → data-default, all × the global scale. All three layers persist per-Look to `design.json`; the Foundry reads the same maps. Per-corner identity uses leg-pair keys; an entry that running every step leaves naming no corner is printed by name and value in the Foundry run (`[PROTO②] … names NO corner`). A corner may not ease past half its leg: an authored radius larger than that is drawn at the leg's limit and printed per corner — key, radius asked, radius drawn, the bounding leg (`[PROTO②] ⚠️ authored corner …`); unauthored ones clamped the same way are a count. ▶ `node checks/claims-every-authored-corner-resolves.mjs`.

### Highways — built from their lanes, never authored *(H-3)*
A motorway/trunk is swept from its lanes and the values in `references/registry.json`. **No handle moves it**: an override is refused, printed, and kept. The land it bounds is sorted in the Foundry — **verge** (bare grass, no choice) · **junction residual** (building-less, at a ramp end) · **block** (bare highway edge). At a ramp end, a narrower town street's curb **flares** to the ramp's corner, tapering back 10:1. Each Foundry run prints, by id:
- skeleton: *Interstate status unknown*, two-way motorways · derive `Highway section`: sources, `ASSUMED` lanes, `[U]` values · derive `[H-3 ④]`: verge/JR/block, gores, parcel-vs-building · derive `[expressway speed]`: each at-grade expressway span's speed (posted / statutory / [U]) and its edge · `[tileGround][H]`: tapers, handoffs · `[H-3 flare]`.
- ⛔ `NO WIDTH` / `poured before H-3` / flare `re-pour` ⇒ **run every step for the scene**. H-3 checks read NOT CHECKED until then.

## Section — the ped-profile tool

The pedestrian cross-section, stroked **inward** off the frozen curb (LU = the remainder).

- **Ped handles** — treelawn / sidewalk widths per edge.
- ⭐ **Where the treelawn Y/N default comes from — and what changed 2026-09-08.** Whether an edge
  seeds WITH a treelawn is read from the city's own survey (`raw/survey.json`: the measured distance
  from centreline to each sidewalk). ⛔ **A street whose lanes/AASHTO asphalt guess was WIDER than
  its measured sidewalk position used to seed with NO treelawn** — the asphalt was clamped flush to
  the surveyed walk and the gap was crushed to zero, which the Y/N test then read as *"the city says
  there is no treelawn here."* It now reads that as UNKNOWN and falls back to the standard, because
  the doubtful number is the ASPHALT (the clamp fires precisely when the guess did not fit the
  measurement). ⇒ **83 street-sides on LS seed with a treelawn that previously did not.**
  ⛔ **No width moved and nothing was redistributed** — every width is still a handle and your
  override still wins; only the first draft changed. ▶ Check any town:
  `node checks/claims-the-survey-reaches-the-measure.mjs <scene>` — it also says LOUDLY when a town
  has no `raw/survey.json` at all (HPDM and Altadena do not; their ped sections are AASHTO guesses
  end to end). ⚠️ Reaches the map only after a **Foundry run from the skeleton** — a Survey-exit freeze rewrites
  `shape.json`, not the seed.
- **Strip-material swap** — ctrl-click an LU↔SW strip to flip it.
- **Curb cuts** *(junction corners only; layer toggle "Curb Cuts", colour `curbCut`)* — the style comes from, finest first:
  the operator (Section: click a corner's marker → popover; it writes `cut` in that corner's one entry of
  `cornerCornerRadiusOverrides`, beside Survey's radius and existence; ⌃-click clears) →
  the town's RECORDED kerbs (`raw/osm_kerbs.json` ▶ `node cartograph/fetch-kerbs.mjs --scene=<scene>`; a drop mid-arc = diagonal,
  at both ends = perpendicular, raised only = none, else *unreadable* → counted, to the norm, and listed by position when
  it CONTRADICTS the norm, for an override; landed in the Foundry) →
  `cartograph/data/<scene>/norms.json` `{"curbCuts": {"style", "width", "warningDepth"}}` → the state record's `norms.curbCuts`
  → the kit: **perpendicular**, at PROWAG's width and warning depth, read from `references/registry.json`
  (`r-curb-ramp-default-perpendicular` · `f-prowag-curb-ramp-geometry` · `f-prowag-perpendicular-ramp-dws`). The Foundry
  prints the rung that decided it and why each rung above gave nothing (*"no norms.json"*, *"norms.json has no curbCuts"*,
  *"state MO has no curbCuts"*), and the kerb's rung the same way. It throws on a style without its own width + warning
  depth (metres), on a scene with no data directory, and on a kit citation the registry does not hold. Read at derive, so
  a norm change needs a **Foundry run from the skeleton**; the per-leg override is live. ▶ `node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs <scene>`
  · a town whose frozen norm lags the resolver (every step owed), and every rung's reasons ▶ `node checks/claims-the-pour-reads-the-towns-norm.mjs`
- **Kerb height** — `norms.json` → `{"kerb": {"height", "rampSlope", "flareSlope", "taperRun"}}` (metres; slopes as
  `"rise:run"`, the jurisdiction's — LS: 0.15, ADA 1:12 / 1:10, taper 1.0). Kit = 0, one flat plane. Never tied to the Look's
  `curbWidth`. Read at derive (a Foundry run from the skeleton); raised by the Foundry's ground step (`kerbLift.mjs`): a kerb face where the curb is
  drawn, each cut ramped, and where NO curb is drawn (alleys, shoulders) the block slopes flush over `taperRun`. A town with
  h > 0 and cuts or curbless frontage but no slopes/run THROWS, and so does any step left with neither face nor taper
  (named by place). ⚠️ The renderer does not yet light the kerb face (`BRIEF-corner-ramps-and-kerb` step 5, piece 5).
  ▶ `node checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs`
- **Walk cross-slope limit** — `norms.json` → `{"walk": {"crossSlopeMax": "1:48"}}` (ADA; the four US towns carry it).
  Kit = no limit (measured, said to be ungated). Read when the Foundry runs, never frozen, so authoring it makes no step re-run.
  ▶ `node checks/claims-the-walk-is-level-across.mjs` (every walk and curb, at the town's exaggeration ceiling)
- **Lawn slope limit** — `norms.json` → `{"lawn": {"slopeMax": "1:3.5"}}`: the steepest a tree lawn takes the cross-fall before the
  rest eases into the lot. The four US towns carry 1:3.5, a DESIGN CHOICE (Jacob, 2026-10-11), not a standard. Kit = no limit.
- **Road paint** *(layers "Center Stripes" `stripe`, "Edge Lines" `edgeline`; the one-way's yellow left edge takes the stripe's
  colour)* — the kind per street is selected in the Foundry and printed by rung (`[paint]`): `norms.json` → `{"markings": {"centre":
  "none"|"broken"|"double-solid"|"solid-broken", "edges": false, "look": {"line", "gap", "dash", "space", "edgeInset"}}}`
  (metres) over the kit's house style (`STYLE-GUIDE §18`). Parking depth: seeded by street type, selected by `parking:*` tags;
  Survey control owed. Run every step to take a norm change. ▶ `node checks/claims-the-road-paint-reads-its-marks.mjs`
- **Crosswalks** *(layer "Crosswalks", colour `crosswalk`)* — square across the street, centred on the cut that serves them
  (or on a recorded OSM crossing whose ends land in that corner's arc — read from `osm.json`, nothing to fetch), kerb to kerb;
  no curb cuts ⇒ none. Same ladder under `crosswalks`: `{"style": "lines"|"continental", "width", "line",
  "farKerb"}` for one paint, or `{"style": "byCorner", "byCorner": {"diagonal": {…}, "perpendicular": {…}}, "farKerb"}` — the
  paint follows the corner's resolved cut style (metres; a missing size throws). `farKerb` — a T's far kerb: `none` (no
  crosswalk) or `cut` (a cut there, crossed to); required. The Foundry counts every crossing it does not draw, by cause
  (two cuts further apart than one crosswalk is wide · no owned far kerb · ambiguous …) — never paired by nearness.
- **Edit-row vs edit-block** — author one frontage-edge or a whole block.
- **Translucency-focus** — the selected element renders translucent / context opaque (by design, `RIBBONS.md §5`).
- **Revert to Default** — footer button (whole-scene) · **⌃-click a ped handle** = per-edge re-seed to the calculated best-effort (gleaned treelawn-Y/N + the kit's depths: treelawn 5 ft and sidewalk 5 ft, 1.524 m each — the local class row, `f-massdot-buffer-width` / `f-massdot-sidewalk-width`; uniform for every street until classifier step 7). Field-scoped so it never wipes Survey (`SECTION.md §8`). ⭐ **Clears the CAP FLIP too** (fixed 2026-08-06, `d6a95a0b`): `capFlip` inverts the materials at a dead-end cap — a sidewalk↔treelawn swap by another name — and it was in **neither** revert list, so the tool reported success while the flip silently survived and the scene claimed to be at default when it was not. ⚠️ **There is still no PER-CAP revert gesture** — ⌃-click on a cap *is* the flip — so one cap's way back is flipping it twice; the footer button is the only path. Guard: `node checks/claims-revert-field-coverage.mjs` fails if any authored field is missing from both revert lists.

## Look — the look tool

Materials, color, visibility, shaders, sky, post-FX, neon, camera — the per-Look aesthetic, carried into the Slab by the Foundry. Everything here is **WYSIWYG and live**: a tweak shows on screen immediately, and the Foundry freezes that exact state into `scene.json` (`STAGE.md §3`). Two facts shape every knob below:

- **Every look value is a *time-of-day curve*, not a single number** — the **TodChannel** (`STAGE.md §1`). You drag a slider *at the currently-scrubbed time*, and the channel records the curve, so one Look renders dawn, noon, and deep-night faithfully. A channel left unanimated is a flat scalar (the same value all day).
- **Open Stage by URL:** **`/stage/<town>/<shot>`** (e.g. `localhost:5173/stage/hipointedemun/hero`; `browse|hero|street`, a bare `/stage/<town>` opens on Hero), with `?look=<id>` only for a Look other than the town's own. The same app also answers `/cartograph?scene=<town>&look=<id>&shot=<designer|browse|hero|street|extent>`. **The address follows you**: it is rewritten as you change town, Look or shot (the `/stage/…` form in Stage, the `/cartograph?…` form in Plan), so copying it and opening it later lands you in the same place. Preview's **← Stage** opens this form for Preview's town, Look and shot. Each part is optional — `?look=` alone opens that Look and its town, `?scene=` alone opens the town on its own Look. **Which shot:** the address's `shot`, else the shot you last left, else Plan. A `?look=` naming no Look, one whose town disagrees with `?scene=`, or a `/stage/<town>` no Look belongs to (a typo) opens **no** town and says why in place of Stage's panel, naming the Looks or towns there are, and the address is left as you typed it; an unknown `shot` is named in the console and ignored. With no link and no town last open, Stage opens **no** town: the Look menu reads **Choose a town**, lists every town, and opens itself. ▶ `node checks/claims-a-look-link-opens-that-town.mjs` · `node checks/claims-stage-boots-the-address-town.mjs`
- **Entering on an old Slab is said out loud.** Nothing enters Stage by running the Foundry: not a link, not a reload, and not Plan's **Look →** (it only moves you; run the Foundry from Stage's own **Foundry** button). On every entry Stage asks the Foundry what it would re-run (the same content check the Foundry button makes — code, data and your authoring), and if anything, a red bar says the Slab is older than what the Foundry reads — **The Foundry owes N steps** — with a **Foundry** button; hover it for each step's reasons. A kit code change counts: it makes the bar show on every scene until the Foundry has run on each. ▶ `node checks/claims-a-stage-entry-knows-its-slab-age.mjs` · `node checks/claims-one-way-into-stage.mjs` · ask it directly: `curl localhost:5173/api/cartograph/looks/<id>/bake` (a GET plans, it never runs the Foundry).
- **A piece the kit refused is named on screen, never just missing.** When a layer (trees, ground, lamps, a display, …) refuses to draw this town, or keeps crashing and is given up on, a red line under the toolbar says which layer and why, over the town's emblem too: a refused ground, buildings or trees layer holds the town on its emblem, and the console's `[reveal]` line names it. A refusal is never retried: fix what it names (usually a Foundry run); the line goes when the layer draws again, or on reload. ▶ `node checks/claims-a-refusal-is-never-swallowed.mjs`
- **The only deliberate "save" is forking a named look preset** ("＋ Save as new look preset…"). Every other tweak autosaves the active Look — always the open neighborhood's own — to `design.json`; there is nothing to save before the Foundry runs. A neighborhood no Look belongs to shows a red **No Look for <town>** bar, and its Plan edits do not save.
- ⭐ **"Kit Default" is the 0-state Look, and it is deliberately EMPTY** *(2026-09-19)*. It is what a new scene seeds from, so it holds **no town's anything** — no widths, no camera, no sky. It binds no scene and **the Foundry cannot run on it**; the Look panel opens it showing the kit's own defaults for every channel. ⛔ With a town open it cannot be selected (close the town to edit it), and it cannot be deleted. **A fresh scene therefore opens on kit defaults, not on Lafayette Square's**. *(If you want a town's look as a starting point, fork from that town's Look explicitly.)*

The full channel inventory + where each persists is `STAGE.md §1`; the cards below are the operator's-eye view — *which knob is on which card, and how to drive it.*

### Sources *(toolbar)*

Every input a scene is made from, what to do about it, and where it can come from — **for this town's country**: a row names the source that covers it (from `cartograph/data/<town>/jurisdiction.json`), then global ones; another country's sources are listed after it, tagged **"<country> only"**. The row's action (Fetch · Overpass, → a doc, ⚠ unwritten) is **that source's** — Poland's heritage register is a fetch, the US one a hand procedure. A row nothing covers reads **none known for <country>** (⚠); a town whose country was never fetched reads **country unknown** — fetch it: `node cartograph/fetch-jurisdiction.mjs --town=<id>`. The hand-off and agent-assist text use the same order and tags. ▶ `node checks/claims-a-towns-sources-are-its-own.mjs`

### Identity *(toolbar, beside Sources)*

How the town looks, chosen in one place: its **Mark** (one emoji — avatar, load screen, tab), **Mark style** (regular — a white silhouette · engraved — greyscale lifted to white · colored — as the emoji draws: how the town's mark is drawn in the Ward's header ◉ on every screen where ◉ shows the town, not a person, always on ◉'s one dark field; not chosen shows engraved), **Locals are called** (two words, one and many — *Townie* / *Townies*: what the Ward calls the town's check-in standing wherever it names it; both or neither, never a plural made by adding an s; not chosen shows Local / Locals), **Accent** (the Ward's chrome colour), **Lit tint** (colour + strength of the roofs of a chosen category or search, and of the selected building — previewed live). Saved in the Look's `design.json` `identity`, carried into `scene.json` by the Foundry, published as the manifest's `look` (each channel with `…Authored`). A channel not chosen says so and names the kit's neutral value it shows; **clear** un-chooses one. A malformed value is refused with the reason, and nothing is saved. Sources lists **Identity** with **choose it here** and a to-do count until every channel is chosen. Not here: the town's name and locale (Operations), its label style (Plan). ▶ `node checks/claims-a-towns-identity-is-its-own.mjs`

**Colour policy** (every colour here): accent ≥ 7:1 and each category chip ≥ 3:1 on the Ward's grounds, else not saved (nearest passing offered; the Foundry refuses it too); near a meaning colour → ⚑ advice only. **Suggest from mark** proposes accent, tint and neon from the mark (the Ward's default if it has no colour). ▶ `node checks/claims-identity-colours-obey-the-policy.mjs`

**Neon — category colours** *(moved here from Surfaces, 2026-09-28)*: each category's colour is the town's own — its neon AND its chips in the Ward — **one colour per category, two forms derived from it**: **neon** (the map's tubes: your hex exactly) and **detail** (a pastel of its hue for the Ward's chips, dots and accents). Stored as `materialColors.neon_<category>`; the Foundry's scene step stamps which you chose; the manifest publishes `taxonomy.categories[].neon` + `.detail` + `colorAuthored`. Not chosen → the kit's **neutral** hue (full-saturation neon, a pastel detail that reads as unauthored), and it counts on Sources' to-do. ▶ `node checks/claims-a-towns-colours-are-its-own.mjs` (also lists the towns whose scene still predates it).

### Time of Day card

The time readout and **⟲ live**, the **time-of-day chips** (Dawn … Night) above the day slider, the **season chips** above the year slider, and:

⭐ **Every time here is the TOWN's clock, in the town's own zone** — the slider, the chips, the keyframes you author, and what a visitor sees — wherever you sit (2026-09-29: keyframes tuned on a Central clock were tuned wrong for every town elsewhere). ▶ `node checks/claims-a-town-keeps-its-own-clock.mjs`

**Weather (Look only)** — the card's last row, a segmented pill: **Live · Clear · Overcast · Rain · Snow.** Look opens in **Clear**; Live is your choice, like the live clock, and a reload keeps what you picked. *Live* is the town's real weather — **at the time shown**: with the clock live, this minute's; scrubbed, that hour's forecast (yesterday through tomorrow), for the sky and every label alike (`src/lib/weatherAt.js`). A time outside the forecast is said in the console, and the sky holds. *Clear* is the baseline for judging a look. The rest are courtesy stand-ins (`src/lib/weatherPresets.js`, shared with the surface lab) until the Meteorologist supplies simulated weather too. Every preset stands in **still air** — 1 m/s gusting to 2 — blowing from the town's own **wind tendency** (the speed-weighted mean of its forecast, fetched for that alone), so the trees move at rest and the Tree Wind's gust floor can show. **Wind** (the row under it): **Weather · Still · Breezy · Windy · Storm** — Weather follows the weather above; the others stand the trees in that wind (1/2 · 4/7 · 8/13 · 18/30 m/s, mean/gust peak) from the same direction, for this session only. Judge the trees against them. A click lands at once and is the same every time: the ground starts dry and bare and builds toward the chosen weather, and wind and cloud drift start fresh. Every weather, live or chosen, draws its sky from the Almanac (`public/clouds/almanac.json`, first match wins). Session-only: never saved, never in the Slab; production always runs live. ▶ `node checks/claims-the-light-follows-the-weather.mjs`.

### How to operate any TOD channel (the universal mechanic)

**Look keeps your place across a reload** — the time, date and season (so the key you're parked on) come back
where you left them; a new tab starts at noon. Per tab, never saved into the Look. **The clock stands still once
you click a slot or drag the time** — you edit exactly the moment you see; **◦ live** resumes it.

Every animatable channel shares one drawer, and **the 8 time-of-day slot chips are always visible** (dawn / sunrise / noon / golden / sunset / dusk / night / deep night — the sun's nadir, the slot between Night and Dawn) — there is no "animate" toggle to arm. The live edit target is simply **the slot the playhead is parked on**: that chip is highlighted and its sliders are LIVE. **Edit a value to write that slot's keyframe** — a still-flat channel auto-converts to time-keyed on the first edit (no arming step). **In a gap between slots the playhead is on no slot, so the sliders go read-only**, showing the resolved (tweened) value; **click a chip to scrub the playhead onto that slot** and make it live. Because each slot's time is stamped, editing a value never jogs the timeline — the playhead only moves when you click a chip. **Keys tween to each other — across blank chips too. A key beside a blank chip can instead FADE** *(2026-09-26, Jacob)*: the toggle under it cycles **– tween · ▲ fade up** (blank before it: off until the key, then up over N minutes) **· ▼ fade down** (blank after it: down to off over N minutes from the key, off until the next key); the chip takes the pointed shape and shows its minutes (default 30, `TOD_FADE_DEFAULT_MIN`). Lamps: ▲ at Dusk, ▼ at Dawn. Colours keep tweening. ▶ `node checks/claims-tod-fades-at-the-edges.mjs`. *(The old turn-on/off minute boxes were read by nothing and are gone.)* **The tile you are editing is what you see, at 100% of its settings:** with the clock stopped, the tile the editor targets shows every channel keyed there at its key's own values — no fade, no drift toward the next key. Fades and tweens play only while time runs. **✕ Clear**: parked on a keyframe → removes *that* keyframe (the value falls back to the tween; removing the last one returns the channel to its flat value); otherwise → clears the whole channel to its flat default. *(2026-06-27 — unified: dropped the "animate/animated" toggle; chips are always on and the playhead's slot is the edit target. The internal animated-vs-flat data shape and the Foundry are unchanged — `animated` is just no longer surfaced.)* Toggle-type channels lerp 0↔1 between slots; color fields are an HTML color swatch storing a hex string. *(2026-06-28 — nearly every Sky & Light + Post + Lamps channel is now TOD-animatable: this pass promoted **lantern · ambient · exposure · halo · mist · dof (Focus) · warmth · dirMoon · fill** alongside the channels already curve-aware — so the whole frame can ride the day.)* ⚠️ **Converting a flat channel to TOD needs an anchor slot, or it applies globally.** The resolver gives a single-keyframe channel that *one* value at **all** times — so when you turn a still-flat channel into an animated one, first seed an anchor slot (noon or night) with the prior flat value, then author the others off it. Skip the anchor and the first keyframe you write becomes the value for the entire day.

### Light & Sky card

> *Panel reorganized by intent 2026-06-30 (Phase A) — `scratch/LOOK-PANEL-TAXONOMY.md`. Labels below are display-only; data keys (in `code`) unchanged.*

**Sky colour (the dome gradient).** The dome's colour is authored as **sparse grid overrides** — `{hour, band, hex}` triples on a per-season grid (bands = **horizon / low / mid / high / sunGlow**), and the **Sky Builder** is the live tool for placing them. ⚠️ **Overrides key on the CLOCK HOUR, not the TOD slot — and the slot→hour mapping shifts by season** (e.g. summer sunset ≈ hour 20, winter ≈ hour 17). So a sunset colour authored for one season **won't track the slot** in another; author per-season or expect the hue to land at a different point of the day.

**Light & Shadow group** — the directional lights, the soft fill, and how dark the darks read (all TOD). *(Occlusion / Shadow lift / Cast shadows moved here from the old Post card 2026-06-30 — they belong with the lights, by intent.)*
- **Sun light** (`dirSun`) — the directional sun.
- **Moon light** (`dirMoon`) — the directional moon (carries the night).
- **Fill light** (`ambient`) — flat fill light, the same on every surface; the "not-black" lift. Scales **every ambient light** (including the night floors) and nothing else. *(Was "Ambient.")*
- **Sky fill** (`hemi`) — gradient **skylight**: up-facing surfaces take the **sky-top** colour, down-facing take the **warm horizon** bounce. Scales **every hemisphere light** — the sky wash, the night floor and the moon-side fill. *(Was "Hemisphere." One knob per light type since 2026-09-27; Fill light used to reach two of the hemispheres too.)*
- ⭐ **Cast shadows** (`shadow`) — **Penumbra** (m) + **Samples** `4–32` (whole numbers; between time-of-day keys the penumbra steps by half a texel), for **Street and Browse**: ⚠️ the **Hero shot draws three's plain filter** and ignores both (its depth of field hides contact hardening — Jacob, 2026-10-07). A change costs no recompile: the slider moves it freely (`node checks/claims-a-slider-step-compiles-nothing.mjs`). Penumbra is how wide a shadow edge is **in metres on the ground**; Samples is how many taps pay for it. **The Penumbra slider reaches exactly the widest edge the current Samples can render** (`townRange.js#penumbraBudgetTexels` × the shadow texel; 6 m at 16 samples): above it the renderer clamps, so for softer edges raise Samples. A stored value above the reach still renders at the reach, as it always did. ⚠️ The sun's real penumbra is ~0.0093 × blocker distance — a 10 m wall throws ~9 cm. ⛔ **No stencil ⇒ no shadows, loudly.** ▶ `node checks/claims-stage-controls-are-live.mjs` ④.
  - ▶ Debug seams, house `window.__` convention: `?shadowmask=1` · `window.__r3f` · `window.__terrainExag` · `window.__windSheet` (`.showMap = true` lays the field over the terrain, colour = strength · `.read(x,z)`, `.probeAir(pts)`, `.timePass()`, `.spring = false`). The sheet's resolution is the profile's `windTexelsPerCorrelation` (desktop 12, phone 6 texels per 100 m); its size is the town's disc. ⚠️ `?shadowmask=1` carries a warning earned the hard way — its first cut called `getShadowMask()`, which three defines for Lambert/Phong and **not** `MeshStandardMaterial`, so every ground shader died `VALIDATE_STATUS false` and rendered **uniform white**, which is indistinguishable from a legitimate "everything is lit" reading.
- **Wind** (card at the foot of Stage's and Preview's tools column) — the wind the trees get: **wind** m/s, **from** °, **gusts** (peak m/s), **shape** (0 round patches · 1 squall lines). Each field shows the weather's value; type to override it **for this session** (never saved, never in the Slab; **reset** returns to the weather). The override enters through the one cable, so the trees move exactly as they would in that weather. Use it to judge the trees' motion in a wind today's weather doesn't have.
- **Occlusion** (`ao`) — ambient occlusion (N8AO): contact-darkening in crevices. Fields: radius, intensity (0 = off), distance-falloff `0.05–1`. *(Was "AO.")*
- **Shadow crush** (`fill`) — **Crush** `0–1`: how far the darkest tones are pulled toward black. 0 = none (the image as rendered), 1 = full; default 0.72. **Owns the FilmGrade `uToe` uniform** (= 1 − crush) — which is why the Grade Toe slider was removed. For the opposite, lifting the blacks, use Image › Grade › **Brightness**. *(Was "Shadow lift" `0–2`, which ran backwards; stored values convert on load, same look.)*

**Sky group**
- **Sky brightness** (`skyGain`) — *"how dark is the night sky."* Dims (or lifts) **just the sky dome** on a TOD curve — bands, sun/moon glow, horizon scatter together. Exposure scoped to the sky layer: the global **Exposure** knob (Image card) darkens the *whole frame*, whereas this touches only the dome — so deep night goes genuinely dark while street lamps and lit windows stay where authored. Stars are not affected. The kit's day runs 1.25 at Noon down to 0.3 at Deep night. **Reach for Sky brightness when the *sky* is too bright; Exposure when the *whole image* is.** *(Was "Sky Layer Gain." Note 2026-06-07: bloom no longer auto-boosts at night — author it in the Image **Bloom** channel.)*

**Night Sky group**
- **Constellations** — shows the constellation overlay in **Hero and Street** (never Browse) at the times of day it's on. Default off; no day/night gate of its own — key it off by day if you want one. ▶ `node checks/claims-stage-controls-are-live.mjs` ③.
- **Stars** — brightness multiplier on star visibility (on top of the physical night-fade). Like every channel on these cards it **forks per shot**: edited in Browse or Street, it changes that shot. ▶ ⑤.

**Neon** — the neon look as one grouped TOD channel, two drawings of one sign handed off by on-screen size. **Hot core / Tube glow / Atmospheric bleed** shape the tube; **Emissive** is how fast a sign reaches its full colour (it rolls off along the hue, never to white). **Tube radius (cm)** is the real glass tube, never inflated (kit day 1.5 cm, 0.75 at dawn) — the one field that rebuilds geometry, step-quantized so a drag doesn't churn. **Line width (px)** is the far line's on-screen width (kit 5). **Hand-off (px)** is the tube's on-screen diameter at which the line takes over (kit 5; the crossfade band is a constant). **Line brightness** balances the line against the tube (kit 1). Neon *colour* is chosen per category in **Identity** (the toolbar). **Testing (Look only, session-only):** **Neon on** lights every place (each on its own stretch), off shows none, and **Density** thins them to a share (a stable draw, so raising it only adds buildings) — it tests the neon, not the schedules; production runs each place on its own hours. Mounted in every scene's Look. *(Phase B will move Neon into the Light Sources card with Bloom + Lamps.)*

### Image card — post-processing *(was "Post")*

> *The post-FX passes below are entries in one declared pipeline manifest (`renderPipeline.jsx`), installed identically in production, Stage, and Preview (2026-06-30). Each knob here = a manifest entry's channel; in Preview the same passes appear as the toggle/cost matrix — no separate Preview render path. Which passes a device runs is its quality profile's, with the town's per-surface Deployment (below) laid on it. Mechanism: `ARCHITECTURE.md §8 "Render pipeline"`.*

All Image channels are TOD. Grouped by intent:

**Tone & Color group**
- **Exposure** — global brightness of the whole frame, a **multiplicative gain** (the master image knob; contrast with Sky brightness, which is sky-only). ⚠️ Because it multiplies, it **can't lift crushed blacks** (near-0 × anything ≈ 0) — for that, reach for **Grade › Brightness** (the additive lift).
- **Warmth** — the white balance: **Warmth** (cool↔warm) and **Tint** (green↔pink), both luminance-preserving. ⚠️ Two sun-keyed tints still sit in FilmGrade with no control (a golden wash near sunset, a blue one at night).
- **Grade** — the film grade: **Brightness** · **Saturation** · **Contrast** · **Vignette**. **Brightness** (new 2026-06-30) is the **B of HSB** (Saturation = the "S") — an *additive LIFT* (`c + B·(1−c)`) that raises the black floor while leaving the white point put, so crushed dark surfaces read; it's the lever Exposure structurally can't be. *(The dead **Toe** field was removed — the Shadow lift channel, Light & Sky, owns the FilmGrade `uToe`.)*

**Glow group**
- **Bloom** — glow on bright **contrast** (edges + points of light), not on broad brightness. A *band-pass* off the shared blur ladder: bright local detail (a sharp mip minus a blurrier one) glows, so lamps/neon/glints read as points and a bright sky **backlights** dark objects as a rim, while open sky and flat surfaces don't wash. Fields: intensity (strength), threshold (**how much contrast it takes to glow** — runs LOWER than the old absolute-bright bloom), smoothing (the knee), warm/cool tint. Additive (HDR-correct; SCREEN darkened the HDR-bright sky). *(Owns night glow — see the Sky brightness note. `CustomBloom.jsx`, off `DownsamplePyramid.jsx`.)*

**Lens & Film group**
- **Focus (DoF)** — depth of field. **What it focuses on is an OBJECT, set per keyframe in Hero › Camera › Focus** (below), never a point; the focused object keeps a clean edge (taken back out of the blur beside it); whatever hangs on a hero (its displays, the Light Show's strands) is part of that object and draws after the town's ground and water, so nothing behind a strand paints over it (▶ `node checks/claims-the-focus-matte-draws-after-the-environment.mjs`). Here: **Amount** (how much everything else blurs, in front and behind; 0 = off) · **Clear window** (how wide the sharp zone around the focus is, measured along the ground like a tilt-shift lens's tilted focus, so a tall subject is sharp top to bottom — narrow with a strong Amount is the tilt-shift miniature) · **Window softness** (how gently the blur comes in at the window's edges, hard to gradual; with no focus object it is the share of the town's radius that ramps, and the slider says so). **Softness at focus** is an optional extra, never more than Amount. No metres, so the same settings frame any town. Keyframed like every channel. ⚠️ Off in the overhead Browse shot. *(Debug: `window.__dofDebug = 1` paints green = sharp / red = blur.)*
- **Grain** — film-grain scale.

*(The **Cast shadows** knob — sun shadow-map quality — and **Occlusion** (AO) + **Shadow lift** moved to the **Light & Sky › Light & Shadow** group 2026-06-30; see above.)*

### Surfaces / Materials card

- **Per-layer / per-LU swatch** — pick any map layer or land-use class from the tabbed list (Streets, Blocks, Land Use, Paths, Land Cover, Furniture, Labels, Roofs, Building, Trees, Park, Infra) and set its **Color** (hex swatch) and **Visible** (checkbox). Visibility here is also a Foundry lever (`FOUNDRY.md §2`). *(Not TOD — a flat per-Look property.)*
- **3D material editor** (for the selected PBR material) — **Roughness**, **Metalness**, a **Texture** dropdown (none / brick variants / stone / stucco / wood / slate / metal) with **Texture Scale** + **Texture Strength** when a texture is chosen, and **Emissive** (colour swatch + intensity).
- **Building palette** — the town's swatch grid that drives the per-building tint mix; a change recolours live (v2 towns: § Building walls).
- **How the trees move (no control — by design).** Every tree's motion is an **endemic rustle** (a steady sway and flutter, always on, even in still air) **+ the real weather** (the town's felt wind, in metres of motion per m/s), with one **visible floor**: where a gust passes, the weather's part moves the canopy at least 2 screen pixels at each tree's own distance, so a far, flat card still shows it. Eye-gated 2026-10-05 as is; there are no look knobs. The figures live in the Look's `treeWind` channel (kit defaults = the approved look); a town that genuinely needs other ones authors them in its `design.json`. ▶ `node checks/claims-the-tree-wind-is-the-looks.mjs` · live pixels: `node scratch/tree-cost/wind-px.mjs --town=<id> --shot=browse|hero`

### Light Sources card *(was "Lamps")*

The man-made emitters (TOD):
- **Lamps — each knob moves ONE thing** *(Jacob, 2026-09-26)*, and **the keys alone decide** *(2026-11-01: no sun-altitude multiplier on a keyed value)*: a lamp keyed on by day glows by day, so key it off, or shape dusk and dawn with the chips' ▲ fade up / ▼ fade down (a fade of 0 is a hard switch). ▶ `node checks/claims-a-keyed-lamp-is-its-keys.mjs`
  - **Lantern › Bulb** — the light source: the glass glows in the lamp colour (real light, so Bloom takes it), plus the bulb dot and orb. **Glow** + **Glow size** (0–1.5 m, 0 = none) — a small soft light hugging the lantern head; the WIDE halo is **Image › Bloom**.
  - **Lamp Glow › Light pools** — strength on ground and walls. **Pool radius** — the pool's circle, 0 (none) … 1 (the full reach). **Pool centre (m)** — the pronounced dark circle under the lamp; its size does not change with the radius. **Pool centre softness** — that circle's edge, 0 crisp … 1 fading across the whole centre (kit 0.1); live, no Foundry run. **Trees** — the canopy (× the leaf's own colour, so it runs high). The pool is light on the ground's own colour and rolls off softly — it never clips to flat white.
  - **The lamp post is the town's choice** — `design.json#lamps.model`: `standard` (the kit's low-poly post-top, 160 tris, head 3.2–3.6 m) or `victorian` (Lafayette Square's torchiere, 4,304 tris). Absent ⇒ `standard`, and the console says so. `bake-scene` stamps it into `scene.json#lampModel`, so **re-run the Foundry** after changing it. Each model carries its own head height and lit part (`src/lib/lampModels.js`). ▶ `node checks/claims-a-town-chooses-its-lamp.mjs`
  - ⭐ **The pool's REACH is not a knob — it is derived** from the town's lamp spacing so neighbouring pools overlap (`src/lib/lampPool.js#overlapReach`, ≈ 0.91 × spacing), stamped into `lamps.json#reach` by `bake-lamps` and carried into the pool map + tree glow. Re-run the Foundry's lamps → ground AO → trees steps after a spacing change.
  - ▶ `node checks/claims-light-sources-are-live.mjs` — every knob reaches the screen in every town's Stage and in production, and no two knobs move the same thing.
- **Uplights** — left/right **intensity · colour · cone° · reach**, keyframed, off by default. Shown only where there is something to light: **Arch uplights** (`archLight`) where the Look carries an Arch (placement is the non-TOD `arch` channel), and **‹set-piece› uplights** (`setPieceLight`, e.g. "Pilgrim Monument uplights") where the town declares a set-piece — two real spot lights at its foot, cross-aimed up its face, which also wash the ground and buildings around it (`SetPieceUplights.jsx`, mounted by the slot; `intensity` is the wash at `reach` metres). ▶ `node checks/claims-every-app-mounts-the-set-piece.mjs` (a set-piece renderer must declare its extent and draw the slot's lighting).

The pool is **made into the ground by the Foundry** (contour-correct), so its *shape* is a Foundry-time knob (CLI / Foundry operations, below). **Lamp colour** is the Lantern's keyed **Colour** field — one colour tints bulb, glow, pools, trees and walls, and it rides the day (the kit's: warm gaslamps at Dusk, cold glitter at Night). **Lamps on/off** is Plan's **Furniture › Lamps** toggle (`layerVis.lamp`): off hides the 2D lamp dots, the 3D lamps in Stage, and — through the Foundry — production. ⚠️ **Open (Phase B):** Bloom + Neon should join this card (`scratch/LOOK-PANEL-TAXONOMY.md`); the lamp's three parts — fixture, pool, canopy — are separate knobs now ("Lamps", below).

### Horizon card

The distance: the Arch or the backdrop where the town has one, the air between, and the town's own edge.
- **Mist** — **Amount** + colour: distance fog. Amount is **sized to the town**: `1` = half the light lost over the town's disc radius, `2` (the top) = twice that density, so the same number reads the same in a small town and a big one. About `0.3` is a clear day's haze, `0.5`–`1` a misty morning. **Its colour meets the sky:** distant fog takes the sky's live horizon colour, and the Mist colour tints it (a quarter). A town with no known size gets no fog, and says so in the console. TOD.
- **Halo** — the aerial-perspective glow strength + colour (sky-light bleeding into distance). TOD.
- **Edge** — the town's faded rim, per Look (moved here from Extent 2026-10-06). **Fade band** — how wide the soft edge is, in metres, inward from the radius; unauthored it is **5% of the radius** and the row says "default". Shows at the next **Foundry** run. **Ruffle** — 0 a clean circle, up to 1 scallops a full band deep, **inward only** (the edge never passes the radius; to fade further out, pull the radius out in Extent). TOD, live, and it **forks per shot** like the Light & Sky channels (▶ ⑤). ▶ `node checks/claims-fade-derives-from-radius.mjs`

- **Arch placement** (non-TOD) — ⭐ **the Gateway Arch stands on its real geographic spot** (OSM relation 12813920, recorded in `src/setpieces/gatewayArch.js`), projected through the town's own frame, so its distance and bearing are derived, never authored: from Lafayette Square it stands 2.87 km out, past the disc's edge. Its own controls are unchanged: **Scale** (grows it from the top, so it gets wider and thicker; the feet sink and Foot-fade dissolves them), **Rotation** (a Look that authors none faces it as it really stands, which the card shows), **Y-offset** (its height), and **Foot-fade** (where the legs dissolve into the ground). Its highlight moves with the camera, from the sun and where the Arch really is. The card says when a key that focuses the Arch aims off it; your keys are never moved, so re-aim them. A Look or Slab from before 2026-10-28 still carries the retired Distance/bearing (inert): `node scripts/migrate-arch-stands.mjs --write` (Stage closed), then re-run the Foundry. ▶ `node checks/claims-the-arch-stands-where-it-is.mjs`
- **Backdrop** (where the town has one) — placement, then **Snowline** in metres above sea level: the slider spans the backdrop's own elevation (its `landscape.json#elevM`, from the Foundry), and with no range it collapses and says so in red (▶ ④).
- **A town's set-piece** (not a Look knob) — a modelled landmark the town owns: Provincetown's **Pilgrim Monument**. Declared in `src/instances/<town>.js` as `setPiece`, **standing on one of the town's own buildings** (`buildingId`, e.g. `osm-164024699`): that building's footprint sets where it stands and which way it faces, and it is seated on the town's terrain. ⭐ **It is a building like any other, except for its 3D:** the Foundry's building step keeps its record (id, footprint) but builds no box, so its **listing, click and card** go through that id, and **Plan's 2D map draws its outline** with the other buildings. To give it a card, put a listing on that `building_id` in `listings.overrides.json`. ⛔ Don't `hide` the building in `building-overrides.json`: that removes the id, the card and the 2D outline, and the Foundry refuses. **2D outline:** the building's footprint, unless the model declares a plan of its own (a deck, a railing); the renderer's `.plan` says which, and a model plan **fails the check** until its 2D draw is built. **At night** it is lit by the town's `setPieceLight` channel (Look's uplights card). Until the artist's model lands it renders as a **placeholder from the reconstruction dossier's documented dimensions**, at true height (252′7.5″). **To drop in the model:** the `.glb` goes at `public/setpieces/<town>/pilgrim-monument.glb` and is named in `setPiece.model`. The contract (metres, Y-up, origin at the base centre on finished grade, window face to +Z) is in `src/setpieces/pilgrimMonument.js`. A named model that fails to load shows **no monument and a console error**, never the placeholder. ▶ `node checks/claims-set-piece-contract.mjs` · `node checks/claims-pilgrim-monument-site.mjs`
- **Displays** *(Look section; a town's set-piece may carry them, e.g. the Pilgrim Monument's Light Show)* — **Live · Off · Glow · Show** preview it in Look only. ⭐ **You author it in words, never in clock times**: under them, **Lit** is the display's own channel in this Look, keyed on the day's sun moments like the lamps (*"fade up 30 minutes at Dusk"*). The kit works out each moment's clock time in this town on every day (`src/lib/todSlots.js`, the slots' one home and the one place a display's schedule reads the sun; a moment the sun never reaches there sits at its closest approach, solar noon or solar midnight (the nadir), so every key happens); the lights only ever receive clock times. Knobs: **Glow** · **Show** (0 = no show) · **Glow colour** (K) · **Show every** (minutes, from the town's midnight), with the ▲/▼ fades (0 minutes = a switch). ↺ returns it to the default: it glows Dusk to Dawn, with a show at every whole town hour it can finish (never clipped). *Example, a show every two hours through the night:* **Show every** 120. Shows fall on the clock (18:00, 20:00, 22:00 …) wherever **Show** is above 0, and a window keyed on sun moments follows the sun, so its first show moves with the season. **Tonight** draws the channel: where it glows, and a tick at each showtime. ⛔ A schedule whose showtimes crowd the show (closer than it runs, on any day of the year at the town's position) stops `bake-manifest`. ▶ `node checks/claims-a-display-is-authored-on-its-own-channel.mjs` ⭐ **Look shows the looks as authored; Preview and the player show what the Foundry made**: `bake-manifest` publishes each display's looks with the town (a missing look file stops the Foundry), so a new look reaches Preview only after a Foundry run. ▶ `node checks/claims-the-bake-carries-its-displays.mjs`

### Share image card
**Share Image** (a collapsible card): **📷 Capture share images** renders Look's current camera at all eight times of day, on the date Look is set to, and saves them into the scene's Slab (`share/<slot>.jpg`). The card shows the saved set under the button with their slot names, four to a row (the **compact · larger** pill switches to two, closer to real size; remembered in your browser) (a slot with no file says *not captured*); once the town has a full set the button reads **Recapture**. The next Publish carries them. A shared link to the town then shows the picture for the time of day it is **in the town** when the link is opened (the nearest slot). A slot the sun doesn't reach that date (Night, far north in midsummer) refuses by name: pick another date. **Pause the Hero shot on the frame you want first**: it refuses while the shot plays, and stops (saving nothing) if the camera moves during the run. Share images are always taken in **Clear** weather: Capture sets it for the run, whatever the Weather switch says, and puts your weather and time back after. Each image carries the map's credit in its corner, printed from the town's `sources.json` (with the copyright URL written out); a town with no `sources.json` refuses the capture. Re-capture whenever the Look or the camera changes the town's face, and once to put the credit into images taken before 2026-10-20. ▶ `node checks/claims-a-town-shares-its-own-picture.mjs`

### Camera / Shots

- **Browse lean** (no card: a kit value) — in Browse (the visitor's overhead view: Society's map, Stage's Browse) a right-drag, or two fingers up or down, tilts the map like a surface, back along its heading, so north stays the rose's; Browse's own moves land straight down. How far it may lean is ONE kit value, `PLAN_MAX_LEAN_DEG` (`src/lib/cameraRegimes.js`), the same in every town because it is a limit of the overhead tree drawing (flat bands read as plates when leaned far). ⚠️ **Its size is NOT ESTABLISHED** (30° is a placeholder): Jacob sets it by eye in Preview at the close camera. ▶ `node checks/claims-a-lean-never-turns-the-map.mjs --base=<a running Preview>`
- **Browse depth** (no knob: derived) — Browse's near plane stands just above the town's drawn top, as seen from where the camera is (`cameraRegimes.js#overheadNear`, held by `Town.jsx#TownOptics`), so a phone's linear depth separates water from the bed under it at every zoom. The movie keeps the device profile's `movieNear` and Street the canvas's 1 m. Rain and snow are not drawn over Browse: they fall about the camera, and from Browse's height that is a lens effect, not weather on the town. ▶ `node checks/claims-the-overhead-camera-resolves-its-ground.mjs --mutants` · `--live --town=<t> --base=<a running dev server>`

- **Hero shot** — a **timeline of keyframes**, played in time. ⭐ **Each keyframe is a whole shot — position, AIM and FOV — and sits at the time you put it**; the camera reaches every key at exactly its time, the aim riding along with the position, and **nothing else points the camera** (no hero subject). The shot has a fixed **Length** (seconds); changing it stretches every key with it. **Mode:** **Bounce** plays first key → last key and turns back (a short turnaround at each end, never a stall) · **Loop** travels on from the last key back to the first and carries straight on — a lighthouse turn (about 6 keys make a circle read as round). ⛔ No whole-shot ease: between keys the speed follows your spacing and changes smoothly through each key. **Look plays it with the same driver Preview and production mount** (`src/camera/MovieCamera.jsx`), so what you preview is what ships. **Focus** (under a key's FOV): the OBJECT the depth of field holds sharp from that key — the Arch, or a building / set-piece from the list (this town's own listed buildings) or by **Pick** (click it in the view); ⭐ **the object is everything hung on it** — a set-piece's display (the Light Show's strands and bulbs) is held at the set-piece's own distance, whatever lies behind it. ⭐ **Focus lives only on the keys** *(2026-10-28: the Survey's Hero picker is retired)*: a key left on *Same as previous* keeps the one before; a first key left on *None* has no focus object. Between two keys with different objects the focus **racks** over the segment on the camera's own timing — a **◎** on the track marks where. ⭐ In Hero the focus is always an object — playing, paused, orbited or scrubbed: the key's object at the playhead. A key focus naming nothing has no plane: the frame racks toward the town's blur there. **No key focus ⇒ the blur is the TOWN's**: sharp at the disc's centre, easing to the Amount at the rim and beyond, anchored to the town so it holds still as the camera moves (Amount 0: sharp). Street always uses the aim; Browse has no depth of field. ▶ `node checks/claims-hero-focuses-the-object.mjs` · `node checks/claims-the-no-focus-blur-is-the-towns.mjs` · `node checks/claims-the-focus-object-is-everything-hung-on-it.mjs` ▶ `node checks/claims-a-keyframe-carries-its-aim.mjs` (every key's aim and time; each key reached at its time, both modes)
  - ⭐ **THE FIRST KEYFRAME IS THE ENTRY POSE**, on every town. A town with **no** keyframes opens on a view **derived from its own disc** (a close oblique on the town centre, scaled to its radius) — a starting suggestion; the kit stores no camera until you save one. ▶ `node checks/claims-hero-degrade-static.mjs`
  - ⛔ **A CAMERA CHANGE IS PUBLISHED BY A FOUNDRY RUN, NOT BY SAVING.** Look authors keyframes into `design.json`; Preview and production fly `scene.heroKeyframes` out of **the Slab**. Until `bake-scene` runs, Preview is flying the *old* path and nothing says so. ⛔ **The Foundry's tree step reads those keyframes from the Slab too** (hero tiers), and refuses one without its aim — so after a keyframe-format change, re-run the scene step **before** any tree step. ▶ `node cartograph/bake-scene.js --look=<id>` (a full Foundry run does it for you).
  - **Authoring** *(Look only; Preview has none)* — ⭐ **Hero opens PAUSED on the first key, and the camera is yours whenever playback is not running.** ▶ plays from the playhead; ⏸ stops where it is. **Drag the timeline** to move the playhead anywhere. **Key here** sets a key at the playhead from your view — on a key it replaces it, between keys it adds one; **while playing it keys that exact moment and playback carries on.** **Click a key marker** → the playhead goes there and pauses; a plain drag from a marker **scrubs**, like anywhere on the timeline — ⭐ **scrubbing never changes the keys**; **⌥-drag a marker** (Alt) → retime it (the first key, and a Bounce's end key, are pinned). ▶ `node checks/claims-a-scrub-never-writes-the-keys.mjs` **Delete** removes the key under the playhead — any but the first, which is the shot's start. **One key is a static shot**; Key here elsewhere adds the second at the end. In **Loop** the end marker (dashed) is the first key again, linked; switching to Loop squeezes the keys' times by (n−1)/n to make room for the way home, and switching back puts the last key on the end again — the exact inverse unless you dragged keys in between. **FOV** tunes the key under the playhead. Flying: *Camera controls* below.
- **Browse camera** — the overhead default: **Center X / Center Z** (the look-at point; numeric inputs, click-to-edit or drag-to-scrub), **Altitude** (the slider reaches twice the height that fits the town's disc, `townRange.js`), **FOV** (the town's Browse FOV — it goes into the Slab, and every surface opens Browse at it), and **Heading** (screen orientation). ⭐ **Set as Browse frame** makes the view the town's **Browse frame**: what Preview, the Ward and every player open Browse on, as the same square of ground fitted whole to each screen (a phone, the Ward's map half, Stage). **Town disc** clears it: Browse then opens on the town's whole disc, and the console says so. ⛔ **Panning authors nothing** — Stage's camera stays where you leave it (Plan ↔ Browse carries the view; Hero or Street → Browse, and a reload, come back to it), so you can check a placement in Plan and see it lit in Stage without re-navigating. In the Ward, choosing a category or a search flies Browse to its places; entering Browse opens on the frame. Reaches a viewer after the next Foundry run. ▶ `node checks/claims-browse-frame.mjs`
- **Street camera** — the eye-level shot, standing near the centre of the town's own disc (no disc ⇒ the camera stays put and the console says why): **Eye height** (measured **above the finished ground** under the camera, default 1.73 m / 5′8″, in every app; ▶ `node checks/claims-the-street-eye-stands-on-the-ground.mjs`) and **FOV** — both are the town's, and go into the Slab.
- **⭐ An embedding page can ASK for a shot by name — `?shot=hero|browse|street` (2026-08-29).** Framed only, and it picks the *starting* shot; everything it frames with is the shot you authored right here. So a marketing page that wants an overhead of the whole neighbourhood frames `?layer=slab&shot=browse`, and **re-framing Browse on this card moves that page** — no edit on the other side. ⛔ **This is why the page may not carry a centre and a zoom of its own:** a framing built into a site is *this* town's framing, inherited by every town after it, and it forks the thing it embeds. The page sends a name; the Slab supplies the geometry. ⛔ An unknown name is **loud in the console** and shows the hero shot — it never silently pretends to be the framing you authored.
- ⭐ **Camera controls — ONE definition per regime, the same in every app** (Stage, Preview, the live site, the lab, the Extent tool and the tree/sky viewers; `src/lib/cameraRegimes.js`, 2026-09-26):
  - **2D — straight down** (Plan, the authoring mode, and the Extent tool): drag = pan · wheel = zoom · **no rotate**. **Browse**, the visitor's overhead view, is the same plus a lean off straight down, never a turn (the `overhead` regime ▶ `node checks/claims-a-lean-never-turns-the-map.mjs`).
  - **3D — orbit** (Stage's Hero): drag = orbit around the ground under screen centre · **⌥-drag = move the view** (the spot under the pen stays under the pen) · **⇧-drag = aim** (the camera turns where it stands, what you grabbed staying under the pen; ⇧ no longer pans ▶ `node checks/claims-the-aimer-turns-in-place.mjs`) · **⌘/⌃-drag = pan** · scroll = zoom, in proportion to the scroll — so a stylus plus a scroll-surface mouse make every move.
  - **3D, constrained — Street**: stand at eye height and look around (drag), right / ⌃-drag walks across the ground, no zoom.
  - **Playback** (Hero while it plays; always, on the live site and Preview): no input — a drag or wheel on the live site leaves for Browse.
  - ▶ `node checks/claims-the-camera-has-one-definition.mjs` fails on any app that defines its own controls. Plan's **"Look →"** lands in Hero, on the first key, paused; a reload or a link opens the shot its address names (*Open Stage by URL*, above).

### Paths ▸ Shape

- **Alley end-cap dial** — a 3-segment toggle controlling how **all** alleys in the active Look terminate: `square` (flush) / `rounded` (rounded-rectangle pad) / `round` (true semicircle). Stored as `design.alleyCap`. Other path kinds use per-kind defaults and carry no operator surface.

### Terrain ▸ vertical exaggeration

- ⭐ **`terrainExag` — how tall this town's hills are drawn, per town, authored.** Stored as
  `design.terrainExag`; carried into the Slab's `scene.json`; the render lerps toward it for the Hero
  shot (Browse draws flat at 0, Street/Planetarium at 1, so this dial is the **Hero ceiling**).
- ⛔ **The kit default is 1 — the neutral value, meaning "draw the ground at the height it is."**
  A town nobody has authored gets the truth, not another town's drama. **Lafayette Square authors
  1.5** and that is LS's data, not a kit constant.
- ⚠️ **Why it exists:** it was one hardcoded `V_EXAG = 1.5` for every town, chosen by looking at
  LS. Relief across the disc, measured 2026-09-20: **LS 35.2 m · HPDM 43.1 m · altadena 1,480.3 m.**
  One multiplier cannot serve a river bluff, a lake plain and the San Gabriels.
- ▶ Read a town's value: `node -e "console.log(require('./public/looks/<look>/design.json').terrainExag ?? 1)"`
- ⛔ **Re-run the Foundry's ground step after changing it.** The adaptive refinement subdivides where the
  heightfield *bends*, and how much it bends is a function of the exaggeration — so a
  change the Foundry has not run on leaves the mesh tessellated for the old value (over-dense, or faceted on the hills).
- ⚠️ **No slider yet** — it is authored by editing `design.json`. A Look control is unbuilt.

### Foundry — committing the look to the Slab

- **The Foundry button** — Plan's **"Look →"** only moves you into Look, on the opening keyframe; it never runs the Foundry. Look's **Foundry** button runs it in place and you stay put; **Option-click: run every step** (bypasses the dirty-check). A small orange dot means edits since the last Foundry run (indicator only — never disables the action).
- **A Foundry run whose ground fails leaves the Slab as it was.** The ground step writes into a stage (`cartograph/.bake-stage/`) and is published only when it succeeds, in the same commit as the town's new terrain, so the Slab never holds a new terrain over an old ground. A commit stopped part-way leaves `cartograph/.bake-stage/<look>.journal.json`, and that look's next Foundry run (and serve.js at start) refuses by name: re-run its ground step, then delete the journal.
  ▶ `node checks/claims-a-failed-bake-leaves-the-slab.mjs --mutants`
- **Tree anchors are part of the Foundry run** — `tree-anchors` runs **after the tree step** and seats every trunk on the *drawn* ground. The file names its placements (`placementKey`) and its terrain. ⛔ **When either no longer matches (or the file is missing), Publish refuses the town by name, and the map draws none of its trees** (the same for lamps and `lamps.json`): there is no fallback onto the smooth field. The fix is to re-run this, not the tree step: `node cartograph/bake-tree-anchors.js --look=<id> --scene=<id>`. ▶ `node checks/claims-anchors-follow-the-placements.mjs` · `node checks/claims-anchors-know-their-terrain.mjs` · measured seat: `node scratch/marram-tree-seating.mjs --looks=<id>`.
- **The Foundry transcodes the impostor pages, LAST (since 2026-08-29)** — after the placements step, `pack-impostor-ktx2.mjs` encodes every hero + overhead page to KTX2/ETC1S and repoints `trees-atlas.json`. ⛔ **It has to be last and it is not optional:** the atlas step rewrites the manifest from source and hands back `.png`, so a Foundry run that skipped this would silently ship ~4× the impostor VRAM (LS: 282 MB → 1,121 MB) and look exactly like a clean run, because PNG pages render perfectly on the desktop running the Foundry. A pack failure therefore **fails the whole Foundry run** rather than returning a green Slab nobody can tell is heavy — `basisu` is a hard requirement (`brew install basis_universal`). ⛔ **The pages must SHIP** (from R2): ▶ `node scripts/verify-baked-in-r2.mjs` reads the bucket and names any page that is absent. ▶ `node scratch/claims-every-declared-page-ships.mjs`
- **The Foundry writes this town's public credits** — a `sources` step reads which inputs are actually on the scene's disk and writes `public/baked/<look>/sources.json`, which feeds the corner credit, the share images' credit and the info panel's **Sources**. Missing, the corner is blank and the console warns `[sources] ⛔ no attribution for look '<id>'` (and the URL). ⭐ **Read what it prints as OWED.** An input that reached the render under terms the kit cannot state is listed there and is *not* credited — you close that by reading the licence **at the source** and recording it in `cartograph/intake-rows.mjs`'s `licence`. ⛔ **Never fill one in from memory or a search result** — the entry for Microsoft's footprints said ODbL for over a month and the dataset's own `LICENSE` says CDLA Permissive 2.0. ▶ `node cartograph/bake-sources.js --look=<id> --scene=<id>`
- ⛔⛔ **THE UPLOAD — NOT A COMMIT — CARRIES A FOUNDRY RUN TO A VISITOR, AND IT IS PUBLISH'S, NOT THE FOUNDRY'S.** `public/baked/`
  is gitignored and served from R2. **A Foundry run ends on disk** (since 2026-10-05); **Publish** runs
  `scripts/upload-baked-to-r2.mjs --env=staging` (staging keys only; prod is Promote), and a failed upload **fails
  Publish** rather than reporting a Slab that reached nobody. ▶ `node checks/claims-a-bake-never-uploads.mjs` ·
  `node scripts/verify-baked-in-r2.mjs` (PUBLISH §6).
  - ⭐ **Slab names** (`--names=sha256-16`: content-named files, `manifest.json` last). **Publish and Promote both ship
    content names**, and every read of what an environment serves goes through the town's manifest (`serve.js#servedPour`).
    ▶ `node checks/claims-a-slab-ships-under-content-names.mjs`. A town's link card has no image until its Slab is
    content-named (`src/lib/shareCard.js`). Still Jacob's, each step: (a) **Publish** each town (it needs its share images:
    Look → Capture share images) · (b) deploy both Workers once `node checks/claims-a-worker-deploy-darkens-no-town.mjs`
    is green · (d) **Promote** each production host · (e) `node scripts/sweep-retired-slab-keys.mjs --env=<e> --look=<t>`
    (⛔ `--apply` deletes — Jacob only).
    ⚠️ A town with a Slab but no `manifest.json` in an environment reads as **not published** there.
  - ⭐ **Stored compressed** *(2026-10-30)*: a type nothing on the way compresses (`.bin`, `.glb`; the one table is
    `src/lib/slabWire.js`) is stored **brotli-5** with `content-encoding: br` and served as stored (both Workers, with
    `encodeBody: 'manual'`, and no byte ranges of it); json is compressed by the edge, ktx2/png/jpg by their format. The
    manifest keeps the **raw** bytes and sha256, so content names don't change; R2's ETag and length are the stored bytes',
    which the uploader's dirty check and verify read back with `accept-encoding: br`. ⚠️ A Node upgrade that changes zlib
    re-uploads every `.bin` once. ▶ `node checks/claims-the-slab-ships-compressed.mjs --mutants`
- ### ⭐ **PAINT ORDER IS A FOUNDRY-TIME FLATTEN, NOT A RENDER CONCERN** *(2026-09-21)*
  Plan is a **2D paint stack** — layers overlap and the order decides what you see, and that
  is correct there; the overlap *is* authoring. **The Foundry is the 2D→3D crossing, and it is the last
  moment flatness exists**, so it is spent there: the Foundry walks the paint order top-down, clips
  every layer against the union of everything above it, and emits only what is actually visible.
  - ⇒ **The painted ground becomes one partition on one plane**, so there is no millimetre ladder
    left to tune and nothing to lose to the terrain-chord error that made every such separation
    unwinnable (`ARCHITECTURE.md §8` ZEROTH RULE). The Slab is now Plan's stack **resolved**,
    rather than a separately-edited model — which is why the two agree again.
  - ⭐ **What this changes for you: toggling a layer off is now subtractive in the Foundry.** A hidden layer
    is not flattened in, so **the layers beneath it become visible on the next Foundry run** — you are
    painting, not just hiding. ⛔ It takes a **Foundry run**; the toggle alone does not move the Slab.
  - ⚠️ **Two layers are held out, each for a measured reason.** `water` keeps its own slot **and does
    not cut** — it *tints* rather than replaces. Beneath it is the **`bed`**, the sand ground under
    every water body; its shape is in the terrain (`FOUNDRY.md` "the bed"), so the waterline is wherever the
    level meets the ground. ▶ `node checks/claims-the-shore-is-closed.mjs`
    `stripe` **cuts but keeps its slot** — a guard against an overlap residual whose cause is not
    established (`ARCHITECTURE.md §8`); it goes the day that residual measures zero.
  - ⭐ **A layer paints the UNION of its polygons** (overlaps never cancel); each emitted piece is an
    outer or a hole by **the ground inside it**, and a step that cannot decide **stops the Foundry by
    name**. ▶ `node checks/claims-the-ground-is-painted-once.mjs --dir=<slab>`
  - ▶ `node checks/claims-coplanar-groups-do-not-overlap.mjs` — asserts both directions: groups
    sharing a Y must not overlap, **and** a group alone on its slot must overlap something (without
    the second half, the broken state — every group on its own slot — passes trivially). A town still
    warning has not had **every step re-run** since ① landed (no frozen protopolygon) — the operator's call.
- **Ground-contact effects** (made by the Foundry; tune via its constants in **CLI / Foundry operations** below): the **lamp light pools**, the **dark contact rings** under trees + lamps (visible in daylight), and the **tree trunk-base ground blend** (the lowest of each trunk takes on the ground colour beneath it). All three go into ground textures + sample in the ground/tree shaders — **re-run the Foundry to see them**, hard-refresh to pick up the Slab.

## Preview — the publish-confidence gate

**Which scene:** `?look=<id>`, else the scene Stage last had open, else **none** — Preview offers the towns to choose from; it never falls back to Lafayette Square. ▶ `node checks/claims-a-look-link-opens-that-town.mjs`

GPU profiler · device frame · layer-toggle matrix · TOD scrub. Walks the *shipping* render with a profiler strapped on. **The layer-toggle matrix is *ephemeral inspection* ("what am I measuring") — never persisted as policy; "all-on" equals production for the selected tier.** **Deployment** (which effects ship on each surface) is authored here (§ Deployment, below). Keystone Reference: **`PREVIEW.md`** (the model — what it inspects + how to read the numbers). **Profiler** (strip · gpu · files; desktop: right panel, click to open): the strip's first recording is the cold start, so TIME TO WARD and the files tab are a **cold** number only on a page reload, not ↻, and only in *event* mode; they read the Slab off local disk unless the build points at R2 (`PREVIEW.md §4a`). ▶ `node checks/claims-startup-marks-fire-in-order.mjs`

### Publish — where the buttons actually push

- **Publish** runs the Foundry first only when the Foundry owes a step, then freezes the manifest (**this is where the deployment panel's settings are accepted**), uploads this scene's Slab to `staging.theward.online/<map>/`, and, once the Slab is proven there, writes the town's **share card** (`staging/sites/<map>/towns.json`, its own record from its own Look as the Foundry made it; alone: `node scripts/publish-towns-record.mjs --map=<map>`). ⛔ It ships no player: every town plays the Ward, which publishes itself (the kit's legacy player was retired 2026-11-01). Every operator tab (every tracked page but `index.html` and `public/`) wears the Ward's mark, `src/operator/ward-mark.svg`, copied from theward-online, never redrawn (re-copy: `ward-mark.source.json`; ▶ `node checks/claims-every-operator-tab-wears-the-ward-mark.mjs`). **Promote** pins that card at `sites/<map>/towns.json` and refuses without it; `--map=<map> --card-only` pins the card alone (the same verification, that one key, no player), so a card or icon fix never waits on a Ward release. A town with no record serves no card tags and says why (`ward-share-card: absent; …`) ▶ `node checks/claims-a-town-page-writes-its-own-card.mjs` · `node checks/claims-a-town-has-one-icon.mjs`. **Which player the address serves is the town's record — § Staging — which player a town serves, below.** ⭐ A town whose trees are all impostors (no species on the Arborist's mesh bar) publishes no model-tree GLBs or atlas PNGs; put a species on the bar, re-run the Foundry, and the next Publish ships them (`src/lib/treeGeometry.js`).
- **Promote** ships **this scene only** to its own domain — see **§ Production sites** below. ⛔ It no longer pushes `main` (which, on 2026-09-26, would have released 648 commits). ⛔ **Publish refuses a town with no share images**, by name: capture them in Look (*Share image card*).
- **One line per target; the button says what it will ship.** **Publish slab** (staging ships only the Slab) and **Promote slab · Promote player · Promote slab + player**, past-tense and inert when that site already serves it: your Slab (`scene.json#bakedAt` from the live key space, and the deployment its manifest carries; staging also needs no Foundry step owed) and, for Promote, the player (the host record pins the Ward build and kit staging serves). ⛔ Unknown counts as stale. **A blocked Promote prints why under the button**: no production address · staging's player not ready (the town's record, the Ward build or its kit bundle, each named: `src/lib/stagingPlayer.js`) · staging not current yet (Promote ships this disk's Slab, so Publish and check it first). **Visit →** is the address **derived for this look** — staging `staging.theward.online/<map>/`, production from Operations — or **"no address"** with the reason on hover, never a substitute. ⛔ The state is **read on every mount**, never remembered. ▶ `node checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` · `node checks/claims-the-publish-button-can-say-it-is-done.mjs` · `node checks/claims-promote-waits-on-the-towns-own-player.mjs`
- ⛔ **No branch name and no commit counts on this panel** — *"the user shouldn't know about the git"* (Jacob). Neither button ships through git any more; the commit is only the authoring record.

### Staging — which player a town serves, and the kit bundle

**Each town names its player; a town that names none is a 404 that says so** — there is no default (BRIEF-ward-on-staging, 2026-09-28; Jacob: every town goes to the Ward on staging, no holdout). The record is `staging/sites/<map>/player.json`, read by the staging Worker on every request.
- **The switch:** `node scripts/set-staging-player.mjs --map=<map> --player=ward [--dry-run]` — one town per run, Jacob's go for each. `ward` serves the Ward build `staging/ward/current.json` names (the Ward publishes it: `npm run publish:staging` in `theward`); it is the only player (the kit's legacy player was retired 2026-11-01). It refuses a town with no staging Slab, and refuses `ward` while the Ward build or its kit bundle is missing.
- **The kit bundle:** `node scripts/publish-kit-bundle.mjs --sha=<kit commit> [--dry-run]` puts the renderer's own files (transcoder, clouds, building/sky textures, lamp, weather icons) on the asset host at `staging/kit/<sha>/`, immutable, read from git at that commit. What ships is every `kitUrl('…')` call site's path — never a list. The Worker stamps `<meta name="ward-kit-base">` for a `ward` town from the `kit` the Ward build pins; the renderer's `kitUrl()` reads only that tag and throws without it. The kit's own apps declare their own base (`vite.config.js`).
- ⛔ **Deploy order:** every served town needs its record **before** the staging Worker is deployed, or it goes dark — the deploy refuses (`checks/claims-a-worker-deploy-darkens-no-town.mjs`). To take a town off staging on purpose for one deploy, name it: `ACCEPT_DARK=<map>[,<map>] npx wrangler deploy` — printed as your decision, staging only, and refused if the named town would not go dark. ▶ `node checks/claims-a-staging-town-names-its-player.mjs` runs the Worker locally.
- **Reading it:** `curl -s https://staging.theward.online/<map>/ | grep ward-kit-base` names the bundle; that base's `manifest.json` answers 200. A record naming the retired `legacy` player answers 500 by name, and `/_player/` answers 404 saying it was retired. ▶ `node scripts/legacy-player-census.mjs` (read-only) lists every staging and production record and fails on any not `ward`.

### Production sites — the knobs

**A town ships with two buttons: Publish to Staging, then Promote to Production.** Nothing per town is done by hand.

**What Promote does, in order** (`cartograph/serve.js` POST `/looks/<id>/promote`): asks **Operations** for the town's domain — owned, and its zone **active right now** (Operations asks Cloudflare live) — or refuses and says why → reads **the player the town's staging record names** (`staging/sites/<map>/player.json`, § Staging above) and refuses by name if there is none, before anything ships → uploads the Slab to the prod keys → copies that player's exact bytes, each checked against its list (`scripts/promote-player-to-prod.mjs`): the Ward build staging serves into `ward/<sha>/` and its kit bundle into `kit/<sha>/` (a record naming the retired `legacy` player refuses) → puts `<domain>` **and** `www.<domain>` on the production Worker if they are not already (`scripts/bind-production-domain.mjs`; it never takes a name another Worker or site is serving) → writes `hosts/<domain>.json` (the switch) → **asks the domain itself** which town and which Slab it serves. A promote the domain cannot confirm is reported as an error, never as done.

**Which player production plays is the host record's** (`v: 2`, `app: ward`, pinning `ward` and `kit` shas — `workers/production-sites/src/route.js#appOf`). A Ward page is told `ward-kit-base` = `https://<domain>/kit/<sha>/`, same-origin like the Slab. A record naming the retired `legacy` player (or a pre-v2 record carrying its build timestamp) is a 500 that names the town, never served the Ward in its place: Promote it on the Ward. Anything else that names no player is a 500 that says so.
- ⛔ **`ward/<sha>/` and `kit/<sha>/` are WRITE-ONCE and shared** by every town pinning that commit: a key already in production is verified and kept, never overwritten, and a mismatch refuses. ⛔ Nothing may delete a sha any `hosts/*.json` still names.
- ⚠️ **A new town needs its staging record before Promote** (`node scripts/set-staging-player.mjs --map=<map> --player=ward`, then check it on staging): until it has one, Promote refuses it.
- ▶ `node checks/claims-a-production-town-plays-the-player-promote-pinned.mjs`

**A town's name is its address** (Jacob, 2026-09-27): the name before the dot of its Ward's **Domain** in Operations — `provincetown.online` → `provincetown` — and the scene is made under that name. It is a value: change the Ward's Domain and the name follows. Both towns that predated the rule carry their address: `hipointe-demun` → `hipointedemun` (2026-10-04), `lafayette-square` → `lafayettesquare` (map, look and data, 2026-10-21). Lafayette Square's address comes from Operations like every town's (its instance's `domain` line was deleted at its cutover, 2026-10-30). `lafayette-square.com` and `www.` 301 to `lafayettesquare.online` (measured 2026-11-01).

**Machine setup — done 2026-09-27, listed so it can be redone:** the Access service token `ward-publisher` (its id in theward-operations `PUBLISHER_CLIENT_IDS`, a **Service Auth** policy on the Operations application) · `OPS_ACCESS_CLIENT_ID` / `OPS_ACCESS_CLIENT_SECRET` exported in the shell that runs `npm run dev` (⛔ `serve.js` does **not** read `.env`) and set as secrets on `theward-staging-sites` · both Workers deployed · Wrangler signed in on this machine (`npx wrangler login`), which is what binds domains and uploads to R2.

**Reading it:** the Promote row is current when this town's pinned player is the build staging serves **and** its prod Slab is yours. `curl -s https://<domain>/ | grep ward-look` names the town the site thinks it is; on a Ward town, `grep ward-kit-base` names its kit. **The share card** (what an SMS/iMessage preview shows: og:/twitter: tags, `<title>`, icon) is written whole by both Workers, whichever player is served: `curl -sI https://<domain>/ | grep ward-share-card` (or `…/staging.theward.online/<map>/`) says `complete`, or `incomplete; missing <tags>; <why>` — the page still serves, the tags it has no value for are absent, and the Worker logs it by town. A missing picture means Capture share images, then Publish. **The icon** is the `identity.mark` of the town's Look as the Foundry made it (a Look made with no mark: its initial; a scene the Foundry never ran on: no icon, and the header says so; a Slab older than the identity block: the publish refuses, "run the Foundry on <map>"), taken from `public/baked/<map>/manifest.json` when the town is published (`scripts/towns-record.mjs#townRecordOf` → its record's `icon`; `publish-towns-record.mjs --map=<map> --dry-run` prints its `icon` line); a new mark reaches the card at the town's next Publish, and in production at the next Promote. ▶ `node checks/claims-a-town-has-one-icon.mjs --mutants` A `/place/<id>/<name>` link carries the place's own card; when it falls back to the town's, the header adds why (`; the town card for place "<id>": …`, or `; the town's picture for "<id>": its photo is <licence>…`): only a photo whose licence is in `shareCard.js#PREVIEW_LICENCES` stands in a preview, which shows no credit. ▶ `node checks/claims-a-town-page-writes-its-own-card.mjs` · `node checks/claims-a-place-link-sends-its-own-card.mjs`

Unlike Look, **Preview authors almost nothing** — its knobs set up an *inspection*, not a look. The one thing it will write is deployment policy (below). What persists is the inspection *state* (which device, which layers shown), in `localStorage`, so a reload returns you to the same vantage.

### Device / environment selector — Desktop · Phone-hi · Phone-lo

The top-bar device picker switches the render environment *and* the budget the gauges read against — the cost is benchmarked to **two real reference phones**, not the operator's desktop. Exclusive toggle; persists to `localStorage` (`preview.mode.v1`). Phone modes also draw the canvas inside the phone bezel (below).
- ⭐ **Each tier draws with its own quality profile** — the phone tiers with the **phone** profile, in both `<Town>` and the Canvas (linear depth, no shadow map, the hero-only pieces, no building textures, and the phone's post-FX passes only: grade, SMAA, grain); Desktop with the desktop profile. The Canvas is re-created on a tier switch (depth can't change live). ⚠️ `phone-hi` and `phone-lo` render identically today; they differ only in the budgets below. ▶ `node checks/claims-the-canvas-is-the-towns.mjs` · `node checks/claims-preview-phone-runs-production-passes.mjs`
- **`phone-hi` = iPhone 16 Pro Max** — Apple A18 Pro (6-core GPU), 8 GB RAM, 6.9″ 2868×1320 (~460 ppi). The best-case ceiling (and the device the PhoneFrame bezel is modeled on).
- **`phone-lo` = Samsung Galaxy A54/A55** — the floor we *guarantee*. Anchored to the weaker A54 (Exynos 1380, Mali-G68 MP5, 8 GB, 6.4″ 2340×1080); the A55 (Exynos 1480, RDNA-based Xclipse 530) is the stronger sibling, so an A54-clean Slab covers it.
- **`desktop`** — a 60fps target with a generous-but-present draw/tri ceiling (trips only on a pathological scene / weak laptop GPU).
- **All budgets live in one place: `src/preview/deviceProfiles.js`** — edit the numbers there. ⚠️ Today the device *identities* are set but the per-tier budget *numbers* are **interim** (placeholder) until the Phase-3 virtual-device measurement locks them — don't trust a "ships" verdict for a publish call until they're measured.

### Shot picker — Hero · Browse · Street

Top-bar buttons that move the camera between the three production shots, **gated by production's adjacency graph** (Hero ↔ Browse ↔ Street; there is no direct Hero↔Street edge, so that button greys out from Hero). The **Hero** shot is the same authored bounce, replayed identically here (`heroAnim.js`). Camera drag in each shot is the shared regime (Browse = overhead, no rotate; Street = look around; Hero = playback — see *Camera controls* above). ⭐ **Preview is the player's experience:** the Hero movie takes no input, as in the Ward (Stage is the authoring camera: free motion, playback while editing keys). The town's camera *values* (Browse frame, FOVs, eye height, keyframes) are authored and go into the Slab; the *transitions and ownership rules* — which gesture does what, who drives the camera when — are fixed in code for now (Jacob, 2026-10-04: parameterize them, "but not today"). Ephemeral.

> **Building x-ray is automatic — there is no toggle to find.** When the camera moves *inside* a building, that building dissolves so you get a clean shot through it instead of a hollow cross-section; roofs you pass over stay solid. It's artifact suppression, not a look channel, so it's wired on with no knob (the old see-through button was removed 2026-06-28). The feel values (dissolve distance 12 m / fade band 9 m) are dev-tunable via `window.__bldgXray(dist, band)`; if they ever need authoring we'll promote them to a real knob. *(As-built: `ARCHITECTURE.md` "Building x-ray.")*

### Time-of-day scrub

The shared **DawnTimeline** — scrub dawn → day → dusk → night to inspect the Look across the day (the same control Look uses). Ephemeral.

### The layer-toggle matrix — *what am I measuring*

The right panel lists every render layer with a per-layer cost bar; each checkbox gates that layer's `.visible` (never the mount), so **"all on" is the literal shipping cost** (`PREVIEW.md §3`). Toggling a layer off attributes its measured Δ. Inspection state persists to `localStorage` (`preview.layers.v3`) — but this is *measurement* setup, **not** the deployment manifest (those are separate; see below).
- **Scene layers** — Ground (carries the Foundry's lamp-pools / contact-shadows / trunk-blend), Buildings (the Slab's merged mesh), Trees, Park, Streetlamps, Gateway Arch, Neon, Sky+Sun, Clouds, Atmospheric Fog.
- **Post-FX layers** — N8AO, Bloom, Halo (aerial perspective), Film Grade, Film Grain, SMAA, DoF. Everything starts on. A toggle can only take out a pass the tier ships: on a phone tier the passes a phone doesn't run show greyed *"not on this tier"*, and DoF mounts only where the Look authors a blur. To tune DoF, use Look.

### Reading the gauges

- **GPU panel** — the numeric tab: a **scene-vs-budget verdict** (one chip per device, green/amber/red against that device's budget), live **frame ms · fps**, **draws / tris** vs. budget, resident **geos / tex / progs**, and a rolling **spike log** (each spike tagged with the gesture that caused it). **Milliseconds are the budget** — draws/tris are context, frame-time is what users feel (`PREVIEW.md §4`).
- **Strip chart** (phone mode) — a rolling work-ratio equalizer against the device budget line, with cluster detection (≥3 events bunched → "stagger" hint) and a hover caret (when stopped) for per-frame detail.
- **Recording mode** (phone mode) — **event** (a trigger arms a ~5 s capture window) vs. **ambient** (a continuous rolling window, triggers disabled). Persists to `localStorage` (`preview.recMode.v1`).
- ⚠️ **Three caveats** when reading per-layer cost (`PREVIEW.md §4`): it's *render* cost, not VRAM; deltas **don't sum** (shared overdraw) — trust the all-on total.

### ⛔⛔ A BLANK SURFACE MAY BE A SHADER THAT DID NOT LINK — check this FIRST

**`MAX_TEXTURE_IMAGE_UNITS` is 16** on a phone *and on the dev M1*. A material that wants a
17th fragment texture **does not link, and its surface draws NOTHING** — no degraded mode, no
visible clue. It reads as a bright shadowless ground, a missing building skin, or (the
neighbouring `MAX_VERTEX_ATTRIBS` ceiling) every tree vanishing at once. ⭐ **This is the kit's
signature failure: fine on town #1, dead on town #2** — one more land-use class or one more
authored map is all it takes, and the operator sees a map and trusts it.

- ▶ **`window.__samplerCensus()`** in any Stage or Preview console. Prints every compiled
  program, the texture units each really uses (read off the **compiled** program, so nothing
  is guessed), which ones are **shadow receivers**, the headroom on the tightest one — and
  **names any program that did not link**. ⚠️ Read the *receiver* row: a fullscreen post pass
  is usually the tightest program in the scene, but it receives no shadow, so it is not the
  budget.
- A link failure also logs on its own, naming the material — you do not have to ask.
- ▶ **`?unitbomb=1`** deliberately mounts a material 20 samplers over the ceiling. The census
  must then report `unitbomb` as a program that did not link. ⭐ **Run it once on a new device
  before you trust a green census there** — a detector nobody has seen fail proves nothing.
  ⚠️ **It is a self-test, not a mode to leave on:** under the flag the scene has sometimes
  stuck mid-load (**cause not established**). Drop the flag and reload. The detector itself
  costs nothing per frame and is always on.
- ⚠️ **Name your materials.** The attribution reads `material.name`; an unnamed one reports
  only its class, which narrows a blackout to "one of these forty."

### Phone frame · soft-reload · trigger bar

- **Phone frame** — in a phone device mode, the canvas renders inside an iPhone bezel at the deployed mobile aspect, so you read the real portrait slice.
- **Soft-reload (↻)** — remounts the canvas and re-fetches the Slab's artifacts (and busts the tree-atlas cache) — the escape hatch when a Foundry run didn't show. *(If the look looks right in Look but wrong here, it's the Foundry run that didn't propagate — re-run the Foundry / soft-reload — never a Preview bug.)*
- ⛔⛔ **AN EYE-GATE TAKEN IN PREVIEW IS TRUSTWORTHY AS OF 2026-09-20 — AND WAS NOT BEFORE.** Preview mounted its nine Slab consumers with **no cache-bust token**, so the browser's HTTP cache served the *previous* Slab at an unchanging URL. A Foundry run was made, the operator looked, reported "unchanged", and the A/B was read backwards — ⭐ **a stale viewer is worse than no viewer, because it makes the operator confidently wrong, and the operator's eye is the gate we trust most.** Now threaded from `scene.bakedAt`, which changes exactly when the Foundry runs. ⚠️ **The same bug was in production** (a visitor's browser served the previous Slab after a deploy) and is fixed the same way. ⚠️ **Treat any Preview verdict recorded before this date as possibly taken on a stale Slab.** ▶ `node checks/claims-baked-consumers-get-a-cache-bust.mjs`
- **Trigger bar** (phone mode) — shot-jump + reload buttons that fire a recording span, so a spike is attributable to a specific gesture.

### The pyramid tuner — *unfinished: it reaches nothing yet* ⏳

The **Pyramid · <env> · unfinished** card (collapsed by default). Per-tier sliders (**Levels · Resolution · Radius**) persisted to `localStorage` (`preview.renderTiers.v1`). ⛔ **Moving them changes nothing on screen**: the values never reach the renderer, the pyramid ignores them, and phones don't run the pyramid. It is kept as the *intent* that a phone runs every effect at a lower rung instead of dropping it; whether to finish it is Jacob's call after the phone measurement. The `src/lib/renderTiers.js` header lists the breaks. Board row `ROADMAP.md H1`.

### Deployment — what each surface ships, authored in Preview

Pick **Desktop / Phone hi / Phone lo**; the amber **deployment** panel (right) lists that surface's post-effects. Where you leave the boxes is what the surface ships: **autosaved** to `cartograph/data/<map>/deployment.json` (one file per town), **accepted at the next Publish**, which freezes it into the manifest and ships it. The panel says *on staging* or *ships at the next Publish*. ⛔ The Scene / Post-FX rows below it are **inspection** (temporary, `preview.layers.v3`) and never reach the file. **Every phone runs Phone lo** until phones can be told apart; Phone hi is stored for then. A town with no file ships everything everywhere (its manifest says `authored: false`). ▶ `node checks/claims-deployment-has-one-authority.mjs`

## Photographs — we host them, we do not hotlink them

▶ `node cartograph/fetch-photos.mjs --scene=<scene>` downloads every listing photograph and
rewrites the listing to point at a local path. Idempotent — re-running fetches nothing it already has.

⭐⭐ **TWO COPIES, AND THE SPLIT IS THE DESIGN** *(Jacob, 2026-09-22: "in the future these things
will all be stored on the client's server, we're just doing the best guess first step")*:

| | where | tracked? | deployed? |
|---|---|---|---|
| **archive** | `cartograph/data/<scene>/photos/<id>/` | yes | never |
| **web** (≤ 1600px, q82) | `public/photos/<scene>/<id>/` | no — derived | yes |

⛔ **The archive is TRACKED because `source_url` is not a durable path back.** This town produced
three local domains that lapsed inside a year; when a client eventually hosts their own photographs,
the archive is what we hand them, and a downscale we could not undo would have destroyed the only
full-res copy in existence. ⛔ **The derivative is gitignored** — a derived artifact does not belong
in git — and is regenerated by this command.

⭐ **A listing's LOGO travels with its photos** (since 2026-11-01): the Foundry publishes it into the town's `content/logos/` and indexes it under the listing's own string, which is where the Ward finds it (before then no town's logo was published, so every card showed initials). Keep a logo in the town's own `cartograph/data/<map>/content/logos/` and name it `logos/<file>`. ⛔ A path at the kit's root (`/photos/…`, `/logos/…`) or on another host is refused by ▶ `node checks/claims-a-listing-names-only-its-own-assets.mjs` (LS's and Huron's `/photos/` still are: their move is boarded). ⛔ A Foundry run whose photo root is missing entirely refuses, by name; one missing file is said and skipped.

⭐ SVG passes through untouched — it is already resolution-independent, and rastering a wordmark
would make it worse and bigger at once. Nothing is ever upscaled.

⛔ **A hotlinked image makes a local resource depend on the platforms it exists to replace.** Before
this ran, 20 of huron's 63 images loaded from Wix, Shopify and Squarespace, each request telling that
platform which card a visitor was reading. ⛔ **And a hotlinked image on a LAPSED domain is an
injection vector** — this town produced three local domains re-registered by squatters serving
offshore casinos. A wrong link is visible in the data; a wrong image only appears on screen.

⭐ **The trade, stated plainly:** copying makes us the publisher of a copy. What makes that
defensible is the discipline, not the copying — only images an operator published about themselves or
carrying an explicit licence, a credit and a link back on every one, and `source_url` kept so the
original is one click away. ⛔ **What we give up:** a business deleting its photo no longer removes it
from our card. Takedown becomes a request to the operator rather than an automatic consequence.

**The fetch refuses rather than guesses:** no credit, not an image, or a body that disagrees with its
content-type (a "domain for sale" page served as `image/jpeg` would otherwise be stored as a
photograph). Every refusal prints its reason.

▶ `node checks/claims-no-photo-loads-from-someone-elses-server.mjs` — no cross-origin photo, a credit
and a `source_url` on everything we copied, and a link on any formally licensed image.

---

## The Host's contact sheet — `host/<scene>/` *(look at the whole town at once)*

▶ `node cartograph/contact-sheet.mjs --scene=<scene>` → **`host/<scene>/contact-sheet.html`**. Open it
in a browser. Every listing in the order a visitor meets them, with its photographs, hours,
description and a chip for each thing the card carries; a listing that is only a name and an address
is dimmed, because that is the work.

⭐ **It is a CHECK as well as a view.** It references photo URLs exactly as the product does and
rehosts nothing — so a dead link, a hotlink block or an image that was never there renders as a tile
marked *"image did not load"*. A URL we hold and have never loaded is not evidence of anything.

Beside it, `host/<scene>/worklist.md`, written by the research merge: the places whose existence is in
doubt, the ones a researcher hedged, the records that are mis-labelled. The sheet is what the town
looks like; the worklist is what to ask about.

⛔ **Both are DERIVED. Regenerate, never hand-edit.** A correction belongs in
`cartograph/data/<scene>/content/listings.overrides.json`, where it is reviewable in git and a fresh
intake cannot destroy it. ▶ `host/README.md` · `ROADMAP` H-28.

⭐ **A listing's id is permanent.** `content/listing-identity.json` seals each source key
(`ovt-<GERS>` / `osm-<id>`) to its `…-lst-NNNN` on the first Foundry run; a new business appends, a closed
one's number is never reused, and every listing ships its `source_key`. The `…` prefix is sealed in the
registry's `meta.prefix` too and read back on every Foundry run, so renaming a town renames no listing. The first
run seeds it from the town name's first four letters and digits (`st-louis` → `stlo`); ⛔ a prefix another town
already holds is refused, naming both — choose one by writing the new town's registry before its first Foundry run as
`{ "meta": { "prefix": "…", "highWater": 0 }, "ids": {} }`. ⛔ Commit the registry and never hand-edit a sealed one. The Foundry refuses an authored `id` that would renumber a business the registry numbered. ⭐ **A researched add** in `listings.overrides.json` needs no hand-picked number: give it a `_key` (e.g. `research:<slug>`) and the registry mints its id; it is anchored by `anchor.address` → the parcel at that address → its building. A patch whose key reaches no listing does nothing and the Foundry names it every run.

⭐ **One place per name and building.** Two listings with one name and a shared building, address or parcel are one place, and the Foundry refuses until `listings.overrides.json` says which: `places.merge { "<kept>": ["<absorbed>"] }` or `places.apart [["<a>", "<b>"]]` (by source key or authored id). The absorbed ids stay reserved, and their research reaches the kept listing: a field it lacks is filled; a different value refuses until you delete the unwanted one from the absorbed patch. A listing named only by its own address refuses until a `name` patch names it. ▶ `node checks/claims-a-town-lists-each-place-once.mjs` · `claims-research-is-keyed-to-the-place-it-describes.mjs`.

⭐ **What a visitor sees is three layers:** this file < the Apps Script sheet < the layer operations
publishes (`<ASSET_BASE>live/<town id>/listings.json`, keyed by the town's sealed id in
`cartograph/data/<map>/town-id.json`, never its name). A correction made in operations wins over both.
▶ `node checks/claims-a-listing-keeps-its-id.mjs`.

---

## The town calendar — `content/events.json` *(the knob: authored, no UI)*

A town's own happenings — a festival, a fireworks night, a farmers market — live in
`cartograph/data/<scene>/content/events.json`, beside `listings.json`. **Fully authored; there is no
intake and no panel.** Edit the file, re-run the Foundry, reload.

⭐ **An event with dates and NO times runs all day, every day, across the range.** That is the point:
it carries the ticker at 3am, when every business in town is shut. Supplying `start_time` *and*
`end_time` makes it clock-dependent again, so omit both unless you mean it.

**Every event names where it happens** (r-an-event-has-a-host-and-a-venue-and-opens-at-the-venue):

| field | form | |
|---|---|---|
| `listing_id` | a listing | the place's **own** event: it replaces the place's open-now entry, and the place is its venue |
| `venue` | `{ listing }` · `{ building }` · `{ name, point: { lat, lon } }` · `{ scene: true }` | **required** on every other event; the ticker opens it (a scene show, over the whole town, opens nothing) |
| `host` | `{ listing }` · `{ name }` | optional: who puts it on (a name opens nothing) |

⛔ **The Foundry refuses, by name:** a town event (no `listing_id`) without a unique `id` or without a `venue`; a venue or
host that resolves to nothing; a `{ building }` with no name and no address; a `point` outside the town's radius
(Jacob: "Only inside the radius"; written `{ lat, lon }`, the town's frame converts it); a `listing_id` row naming a
different venue (write `host` + `venue`); and **`links_to`, retired** (sort it into host or venue). A display's season
(e.g. the Light Show's) is a `{ scene: true }` row whose `id` the display names. ▶ `node checks/claims-an-event-names-its-venue.mjs`

▶ The file carries its own `_schema` and `_example`. Any `_`-prefixed key is provenance and never
ships. ▶ `node cartograph/bake-content.js --scene=<id>` prints the count, and
`node checks/claims-a-town-event-is-not-clock-dependent.mjs` guards the all-day rule.

---

## Street furniture — the catalog workstage *(`BRIEF-street-furniture`)*

The kit's street hardware (lamps, signals, name signs, benches, …) is cataloged here before any town places it.
- **Add a pack to the library:** `node street-furniture/ingest.mjs <pack-dir> --pack=<pack-id>` (you name the pack; the library holds several, and the choice is per model). It reads the pack's `obj.zip` + `Icons.zip` and writes GLBs (full and two decimations), icons and `catalog.json` into `street-furniture/out/<pack-id>/` (gitignored: a bought pack's files are never committed until a town serves them). In the library now: `street-collection-3` (`~/Desktop/dev.nosync/street_elements`, commercial licence).
- **Start the server only while you work:** `npm run dev:street-furniture` → port **5555**, then open **`/street-furniture`** on the dev server. It is not part of `npm run dev`; stop it when done.
- **What you author per asset:** mount (ground / wall / overhead) · forward (the front faces the blue arrow, the street) · triangle budget (one of the three decimations) · which piece is which lit or sign role (click a piece in the preview). **Night** and **sequence** show the glass and the toy signal cycle. **Cost** = the model's triangles at the chosen budget × each town's census for its role (lamps from the town's `lamps.json`, signals/benches/bins/bus stops from its OSM nodes, name signs from its 3+-street junctions). A town whose census can't be read says why, never 0. Mesh tier only, for now. Saves go to `street-furniture/tags.json` (committed). An asset is **Ready** only when every field is set and its family's required roles are tagged (`src/street-furniture/contract.js`); anything else is listed with its reasons. **Exclude** takes a reason.

## CLI / Foundry operations

- The build: the `skeleton` step → `node pipeline.js` → `node promote-ribbons.js` → `node bake-ground.js` (the pipeline does **not** re-run the extractor). ⭐ **The Foundry re-skeletons a committed scene** when what its skeleton is made of changed (the skeleton's code, the street-class vocabulary with it, raw OSM, the survey), behind the run-every-step question, which names the skeleton; never on `?force=1`, never by Extent's re-apply. ⛔ It **refuses, by name, before a new skeleton re-keys the operator's authoring** (an id naming other ways, a capped or cornered chain's end moved, a crossing gained or lost before an authored block slot, a corner's junction moved) and leaves `clean/skeleton.json` as it was. By hand: `node reskeleton.mjs --scene=<id>`, never bare `skeleton.js`. ▶ `node checks/claims-the-bake-re-skeletons-a-stale-town.mjs`
- The Foundry is incremental (dirty-skipped); `?force=1` (or Option-click the Foundry button) runs every step. **It asks before running every step because of CODE** — a Foundry file whose code RUNS differently from what that scene's last Foundry run ran (the ① mint included; a comment or re-indent does not count, and a file the parser refuses always does), a data file the Foundry reads but that is not an authoring input (building overrides, the footprint well, the boundary, parcels — `FOUNDRY.md §2`), the town's geography, or a registry value its last run read — and names them; a checkout that only touches file dates, or another town's module, asks nothing. If the server is older than the repo's dirty detector (`pour-code.mjs` or `serve.js` changed in code since it started), the Foundry refuses with a 503 that says to restart `cartograph/serve.js`. An authoring edit re-runs its steps without asking (`FOUNDRY.md §2`).
- **The Foundry shows its steps while it runs** — state, elapsed time, the running step's last line, a real fraction where the step counts its own work, an estimate only from this town's previous run — and **Cancel** stops it at the running step, by name. No step is killed on a clock; a failure names its step. ▶ `node checks/claims-bake-progress-shows-the-route.mjs`
- ⛔ **The Foundry STOPS on a missing input that would falsify the map** — it does not list it as skipped and carry on. Today that is **elevation**: a town with no lidar and no record of anyone looking fails the `terrain` step and is told the command to run. **The way past it is to LOOK** — a search that finds nothing records **verified-absent**, and a town carrying that mark comes out flat deliberately, with a date. *An absence somebody signed for is not the same as one nobody noticed.* ▶ `node checks/claims-a-false-map-is-not-a-fallback.mjs`
- ⭐ **The coast is the lidar's** *(2026-10-25)* — the Foundry's `coast` step, before derive, traces where the survey meets the town's high water (`design.json#water`) and writes `clean/coast.json`; derive draws the shore from it and **refuses without it**. OSM's water only verifies it (a majority must agree), and every mapped pier, wharf or quay is read as water beneath (OSM `width`, else the sourced 1.8 m). A coast that moved asks to run every step, naming the file. It **refuses, by name**, on water flown above its high level (the call is Jacob's), on no water record, or on a lidar with no NAVD88 datum. A coast older than the kit's `COAST_VERSION` refuses by name: re-run its step (what each version changed: `coastFile.mjs#COAST_VERSION`). Where that open/close cannot read a ring it refuses by name, saying whether the operator can do anything. ⭐ **Where it changes the water's SHAPE, `coast.json` says so** (Jacob's ruling (a), 2026-10-29): `waterTopology` and `decksTopology` hold one row per change, `{ kind, at: [x, z] m, m2, n }`, kind one of `hole-filled` (an island or a hole narrower than a cell becomes water or deck), `hole-opened` (a hole joined to the outside through a gap narrower than a cell), `holes-merged` (`n` holes become one), `part-split` (a part divided at a neck narrower than a cell into `n`), `parts-joined`. Read it after a coast step to see where the drawn shore differs in shape from the trace; an empty list means none. Every change is one the open/close's own definition makes; anything else refuses. ⭐ **Every open/close the coast step runs is judged against its definition, every Foundry run** (Zob's ruling, Boz's approval, 2026-10-29): what differs past two roundings is the town's *residual*, recorded in `coast.json` (`waterResidual`, `decksResidual`: count, m², the largest piece and where). A coastal town must have SIGNED for it, piece by piece: `cartograph/data/<town>/coast-tolerance.json` (TRACKED, committed with the town's authoring) holds, for the water and the decks, the count, m² and the accepted set of piece keys (a key is the piece itself, rounded once to the millimetre). The coast step STOPS on a first Foundry run (no file), on a rise, and on any piece not accepted, even at the same count and m², listing the new pieces and what changed since the signature (code, water level and tide names, overlay, skeleton). When accepted pieces disappear it tightens the file itself, with one log line. To accept: **in Look's Foundry run**, whose card lists each piece (a click frames it on the map) and whose one **Accept** signs exactly those pieces, commits the file, and runs the Foundry again; it refuses if the coast changed since you looked. Or `node cartograph/sign-coast-residual.mjs --scene=<town>` prints them and `--accept` signs (then commit the file). Publish, on a stopped coast, says to sign in Stage. There is no run-anyway flag. ⛔ A coastal town's first Foundry run after this lands stops until someone looks at its pieces and signs. ▶ `node cartograph/bake-coast.mjs --scene=<id> [--out-dir=<dir>]` · `node checks/claims-the-coast-is-the-lidars.mjs` · `node checks/claims-the-open-close-cuts-once.mjs` · `node checks/claims-the-coast-residual-is-signed-in-stage.mjs`
- ⭐ **The revetment says how much of the shore it covers, every Foundry run** — **built**, **bare and why** (soft shore · below one course · no terrain), arcs **refused and why** (too short · ink with no drawn water: run every step), **outside the drawing**, and **STRUCTURES**. The drawn water's edge IS the shoreline *(2026-09-26)*; every mapped breakwater and groyne is stone *(2026-09-27)*, walked on its own outline. ▶ `node checks/claims-every-metre-of-drawn-shore-is-named.mjs` · `node checks/claims-every-mapped-stone-structure-is-stone.mjs` · measure without touching the Slab: `node cartograph/bake-revetment.js --scene=<id> --out=<dir> [--terrain-dir=<a bake-terrain --out-dir>]`
- ⭐ **The far shore is made by the Foundry, not built at load** *(2026-10-29)* — the Foundry's `revetment-far` step (after `scene`) writes `revetment-far.json` + `.bin` + `-unseen.bin`: the whole armoured shore at distance, its flat overhead band for Browse, and each piece classed by when the movie first sees it (never-seen pieces load after the reveal). ⚠️ **~2 min a coastal town**: it builds every near piece once for its exact bounds (how far the near stone reaches past the far one had a long tail, to 10 m on huron, that no fixed pad covers); it shows a real progress fraction. ⛔ **A coastal Slab without it draws NO shore** and says which step to run, and so does a Slab whose `revetment-far.json` is another format than the player reads (`revetmentFromSlab.js#FAR_FORMAT`; **3** since the bytes were quantized, so every coastal Slab re-runs this step after that merge). **The bytes** *(Jacob, 2026-10-29: "compress, fine normals")*: positions 16-bit on one grid per town, normals octahedral 16-bit, pins exact (`src/lib/farQuant.js`); the step prints each bin's MB raw and as stored (brotli, what a visitor downloads) and the town's grid, and a position is within half a grid step (sub-mm). **Release order:** merge → run `revetment-far` for every coastal town and publish their Slabs → only then move the Ward pin (staging's one player serves every town; ⟦owed⟧ a check that refuses the pin while a coastal staging Slab lacks it). ▶ `node cartograph/bake-revetment-far.js --look=<id> --scene=<id> [--dry-run]` · `node checks/claims-the-far-shore-is-not-built-at-load.mjs --mutants` · the error bounds and the seam after decode: `node checks/claims-the-drape-meets-itself-on-one-line.mjs --mutants`
- ⭐ **The near stone is built once per chunk, between frames, never on every camera move** *(2026-11-02)* — a chunk the camera newly reaches is queued nearest first and built in the frames' spare time (the kit's `src/lib/frameSlices.js`, the frame's own measured interval, no constant) while its far chunk stays drawn; once built, its stones and drape are kept while it is in the near set or the one before (`src/lib/revetmentNear.js`), cleared by a town switch, a re-bake, or a terrain or drawn-ground reload; an unchanged near set redraws nothing. No knob. ▶ `node checks/claims-a-reselect-reuses-what-it-built.mjs [--town=<id>] [--mutants]` (every stone chunk of every coastal slab: ~5 min for Huron).
- ⭐ **Surfaces › Water — Clarity and Deep see-through** (a town's `design.json#surfaces.params.water`, live in Look, carried into scene.json by the Foundry). **Clarity** is a share of the town's OWN measured visibility (its Secchi, `water.secchiM` → the terrain's `bed.visibleToM`): 1 = the measure, lower shows the bottom less far, never more (a clearer town = `water.secchiM` + a re-run of the terrain step). **Deep see-through**: 0 = opaque past that depth (the kit's neutral), 1 = the bed faintly through it. ↺ returns each to the kit's neutral.
- **After a Foundry run that ran every step, the 2D map redraws itself** (*"Redrawing the 2D map…"*) — no reload. *"The 2D map is out of date"* appears only when that redraw FAILED, and says why; **Reload** then draws what the Foundry made.
- ### ⛔ **NAME THE TOWN. There is no default town, anywhere** *(Jacob, 2026-10-21: the LS default goes "once and for all")*.
  Every script in `cartograph/` that writes an artifact refuses to start until you have named the
  scene; a reader with no scene gets no geography (`config.js` refuses by name the moment one is
  read); a server data route with no scene (`/<verb>`) is a 400, an unrouted path a 404; Arborist's
  `/coverage`, `ship-audit` and its tree steps take the town from the Look you name, or refuse.
  It used to default to Lafayette Square — so forgetting the flag silently ran the Foundry on LS over
  whatever you thought you were building, which cost a full day on 2026-07-31 and read the whole
  time as "the fix isn't working" rather than "the wrong town is being built."
  - **Two spellings, ONE resolver.** `--scene=<id>` on the command, or `CARTOGRAPH_SCENE=<id>` in
    the environment. Both are read in exactly one place (`cartograph/scene.js`), so they cannot
    disagree — which they did until 2026-09-19, when eight of ten bakers parsed the flag themselves
    and ignored the variable, and an env-named Foundry run quietly re-made LS while passing every guard.
    ⛔ Note the `=`: `--scene huron` is not the flag, and you will get the refusal, not a guess.
  - **You will not get a wrong map, you will get an exit.** A writer with no scene prints what it
    refused and why, and exits 2. That is the whole design: an unnamed scene is a question, and the
    kit's rule is that a question is never answered with a plausible-looking default.
  - **Some writers legitimately have no scene to name** — one that is look-keyed, or writes a
    single fixed path. Each says so in its own source, with a reason, and
    `node checks/claims-writers-name-the-scene.mjs` prints every one of them and fails on any
    writer that neither guards nor explains itself. ⛔ Don't keep a list here — run the check; add
    a Foundry step and it is classified on the next run, with no list to update.
  - **A town's committed inputs are DECLARED in its home Look's `design.json#pour`**, never chosen by its name:
    `pour.ribbons` (ribbons a shipped build imports) and `pour.buildings` (a curated building set the Foundry takes
    instead of the footprint wells). Lafayette Square declares both (`src/data/…`). A declared path that is missing
    refuses. A bundled-park component mounts on its town's `bundledPark`. ▶ `node checks/claims-no-town-name-gates-the-kit.mjs`
  - ⚠️ Naming the scene is **not** the same as naming the look. `--look=` picks the Slab you write
    into, and a mismatched pair is a separate refusal (`cartograph/bake-target.js`).
- **Ground tri-budget — the `GROUND_REFINE` knob** (`bake-ground.js`, the GPU/mobile lever). The ground is drawn on a flat datum (plus its own kerb y) and lifted per vertex at runtime by **the town's one height field** (`terrain.bin`, Float32, sampled in the shader by a manual 4-tap bilinear from a NEAREST texture, so no device needs float linear filtering), so it must be subdivided enough to follow the relief. `GROUND_REFINE = "adaptive"` (default) subdivides **only where the field bends** — `GROUND_REFINE_TOL_M` (default **0.50 m**, drawn metres) is the max deviation from the field a coarse triangle may keep before it's split; **every draped group uses it** — the lots, the carriageway, the ped bands and the stripe (one policy, 2026-10-21: BRIEF-the-ground-stands-on-one-field). ⚠️ The walk is then as level as the field under it; how far that is from the town's `walk.crossSlopeMax` is printed by `node checks/claims-the-walk-is-level-across.mjs`. Lower `tol` = finer mesh + more tris; higher = coarser + fewer. The triangle count per group is in the look's `ground.json` (`groundShape`); `node checks/claims-ground-refinement-does-not-breed-slivers.mjs` bounds it. The split is **longest-edge bisection, conforming across every ground group at once** — crack-free between land use, sidewalk, curb and asphalt, not just within one polygon (2026-09-23). ⚠️ That costs triangles where ribbons take their neighbours' splits, and Foundry time on a big town; the Foundry prints both, and refuses to write if a crack survives. CLI overrides (gated on argv, never `process.env`): `--refine=uniform` restores the legacy byte-identical mesh; `--refine-tol=`/`--refine-min-edge=`/`--refine-max-edge=` retune. ⚠️ It calibrates to the town's authored `terrainExag` (above); if you change that, re-run the Foundry and re-check the slopes. ⚠️ **After any CLI `bake-ground.js`, run `bake-ground-ao.js` too** — but ⛔ **the failure mode changed 2026-09-20 and it is no longer silent.** It used to rewrite `ground.json` *without* the AO `lightmap` block, so a standalone ground step shipped flat-lit and nothing said so — **five of seven towns with a Slab had an AO PNG on disk that no manifest pointed at.** Now the ground step **carries any existing `lightmap` block forward** and stamps a `groundKey`; the AO pass stamps the key it ran against; and the renderer **refuses a mismatched lightmap, naming the command to re-run.** ⚠️ The old staleness gate could not have caught it — the AO pass writes the manifest *before* the PNG, so "ground.json newer than the PNG" meant both "AO is current" and "a ground re-run just destroyed it"; **an mtime cannot separate those.** ▶ `node checks/claims-the-ao-belongs-to-its-ground.mjs` The full diagnosis + per-material numbers live in `cartograph/_archive/handoffs/HANDOFF-ground-tri-cut-LANDED-2026-06-22.md`.
- **Ground-contact effect knobs.** *Foundry-time* (`bake-ground-ao.js`, edit + re-run the Foundry): lamp pool `POOL_RADIUS_M` · `POOL_RING_POS` · `POOL_RING_SHARP` · `POOL_SHADOW_FRAC`; contact shadow `TREE_SHADOW_RADIUS_M` / `_STR`, `LAMP_SHADOW_RADIUS_M` / `_STR`. *Live*: trunk-base blend `uTrunkBlend` / `uTrunkBlendTop` (`treeAtlasMaterial.js`); contact-shadow strength `uShadowStr` (`grassMaterial.js` + `BakedGround` FadeMesh); the pool takes the **lamp colour** (the Surfaces lamp swatch); pool intensity and arch uplight are TOD channels (Lamps / Arch Lighting cards). ⚠️ Pool diameter/blur are Foundry-time; promoting them to panel controls is unbuilt.
- ### ⭐ **A TOWN WHOSE OSM POIs ARE THIN — the external listings base** *(2026-09-20)*
  The listings base is normally derived from OSM POIs, which is excellent where OSM is richly
  mapped and thin where it is not — and a town does not tell you which it is until the Foundry has run on
  it. When the OSM base comes back too thin, switch the base rather than hand-authoring a town:
  1. **Acquire** — `node cartograph/fetch-overture-places.js --scene=<id>`. Reads the bbox out of
     the town's own `geography.json`, so there is nothing to configure per town. No credentials, no
     native dependencies, and it pulls only the parquet row groups that intersect the town — not
     the theme. Writes `data/<scene>/raw/overture-places.json`.
  2. **Declare** — put `{ "meta": { "baseSource": "overture" } }` in
     `data/<scene>/content/listings.overrides.json`. ⛔ **The declaration lives in the DATA, never
     in the code** — that is what protects the next town without anyone editing `bake-content.js`.
     `"hand-curated"` declares listings kept by hand: the Foundry reads `content/listings.json` as the base and writes
     `roster.json` only — the listings and their id registry are never written (`--force` regenerates from OSM, loudly).
  3. **Run the content step** — `node cartograph/bake-content.js --scene=<id>` as usual. The Foundry prints which
     producer ran and why, so *"the external base was used"* and *"nothing was produced"* can never
     look alike in the log.
  - ⛔ **DO NOT `--force` A SCENE WITH AN EXTERNAL BASE.** `--force` regenerates the base from OSM
    and **destroys** it; that is not hypothetical, it took one town's listings from 84 to 5 on
    2026-07-20. The guard refuses by default for exactly this reason.
  - ⛔ **THE LICENCE IS PER RECORD, not per source.** Overture Places has no theme-level licence —
    a record may arrive under CDLA Permissive 2.0, Apache 2.0 or CC0 depending on which contributor
    supplied it, so **what your town owes depends on which records your town got**. It is derived
    from the artifact automatically and appears in the visitor credit; a contributor the kit cannot
    licence is reported as **owed, by name**, and is not credited.
    ▶ `node checks/claims-overture-licence-table-is-current.mjs` re-reads the terms from the source.
- The server runs under `node --watch`: saving `serve.js` **or anything it imports** (incl. `src/instances/*.js`) restarts it and **kills a Foundry run in flight**. ▶ `node scripts/bake-in-flight.mjs` before saving (exit 1 = wait).
- ### ⭐ **THE ASSESSOR BUTTON — giving a town its addresses** *(2026-09-20)*
  A town's **address spine** is what the property atlas is built on: the Society Pages list bare
  buildings **by address**, so a town without one opens nearly empty no matter how good its geometry
  is. OSM `addr:*` carries it in much of the world; in the US the assessor is the well, and it also
  carries what OSM never does — **valuation, zoning, year built, units**.
  1. **Declare the well** — `data/<scene>/sources.json`. ⭐ **In a state the kit knows (OH, MA, MO, NY), take it from
     the state:** `"state": "MA", "select": { "town_id": 242 }, "parcels": [{ "from": "state", "id": "massgis-l3" }]`
     — protocol, endpoint, columns and vocabulary come from `cartograph/states/<st>.mjs` (an NYC town:
     `"nyc-mappluto"`, no select). Its declared state must be the one its own map votes (NOT MEASURED
     before the first fetch). Elsewhere, declare the well in full (shape: `cartograph/sources.js`) — or write the
     state's record. ▶ `node checks/claims-a-state-gives-its-towns-their-wells.mjs`
     ⭐ **Cropland** (US towns): `"cropland": [{ "id": "usda-cdl", "year": 2024 }]` (Extent fetches
     it) — USDA's CDL places crop rows where OSM maps no
     field. Outside the US: `"cropland": [], "cropland_absent_reason": "…"`. Undeclared is LOUD in the Foundry.
     ⭐ **Buildings:** undeclared = Microsoft's; `"buildings": [{ "from": "state", "id": … }]` swaps in the
     state's (ids `bin-<BIN>`). The Foundry prints which, and each courtyard it can't draw.
     ▶ `node checks/claims-a-city-building-keeps-its-permanent-id.mjs`
  2. **Fetch** — Extent's **Fetch** fetches every declared well (parcels, addresses, cropland, trees) and
     reports *undeclared* when there is none. ▶ `node checks/claims-extent-fetches-every-declared-well.mjs`. By hand: `CARTOGRAPH_SCENE=<id> node cartograph/fetch-parcels.mjs`
     (`--dry-run` first).
  3. **Run the content step** — `node cartograph/bake-content.js --scene=<id>`. It reports the match rate and what it
     could **not** classify or address.
  - ⭐ **Building street addresses** (the Ward's card) come from the town's own record, its declared **address points**,
    then OSM — never guessed, never the nearest point. Declare them in `sources.json` — `"addressPoints": [{ "from":
    "state", "id": "ohio-lbrs" }]` (Ohio) or `"nyc-addresspoint"` (NYC), or `[]` + `addressPoints_absent_reason` (Extent
    fetches them), then re-run the buildings step. A point joins by the id
    both carry (NYC's BIN; containment then checks it, printed), else by standing in the footprint or its parcel.
    ▶ `node checks/claims-every-building-has-an-address.mjs`
  - ⭐ **Building history** (the card's dates, historic name, style, architect): declare the town's `history` wells in
    `sources.json` — `[{ "from": "state", "id": "mhc-inventory" }]` (Massachusetts; `select.town_name` as MHC spells it), or
    `{ "id", "reader": "nr-inventory", "file": "nr-inventory.json", "registry", "nps_ref" }` (HPDM), or a nomination's
    rows extracted by hand (`"reader": "nomination-extract"`, `content/history/<ref>.json`: address, name, dated events,
    each with its page; PTown's 89001148), or `[]` + `history_absent_reason`. ⭐ The order of the wells is the order of
    precedence for a fact two of them give; a disagreement is printed, and every well's dated entries show. A row with
    only an address is placed by another well's point at that address (one standing record there, or none). Fetch: `CARTOGRAPH_SCENE=<town> node cartograph/fetch-history.mjs --gdb=<MHC_Inventory_GDB.zip>`
    (needs GDAL; fails loudly without it), then `node cartograph/bake-content.js --scene=<town>`, which prints the join
    (both witnesses · one · conflicts and ambiguities by name). Withhold a record on request: its id in the well's `exclude`.
    A parcel well's own district column still needs `historicDistrictField` from its data dictionary, or the Foundry refuses.
    No district is declared or derived. ▶ `node checks/claims-a-district-is-the-towns-own.mjs`
  - ⛔ **"No parcels" has THREE meanings and the kit keeps them apart.** *Undeclared* (no
    `sources.json`) means **nobody has looked into it** and shouts; *declared-none* is an honest zero
    with a written reason; *declared* is a real well.
  - ⛔ **A WELL IS USUALLY PARTIAL, AND YOU MUST SAY SO.** Huron's (Ohio's statewide layer) gives
    address and land use and **no valuation, zoning, year built or units** — those live behind a
    per-parcel county lookup that is not an endpoint. Listing them as `absent` makes the roster emit
    **null instead of zero**, so nobody downstream reads "we never had this" as "this is worth $0".
  - ⛔ **A DEAD JOIN NOW FAILS THE FOUNDRY RUN.** Parcels loaded and not one building inside any of them is
    a frame disagreement, not a sparse town — it refuses rather than writing a roster whose every
    address is null. Fix it with `CARTOGRAPH_SCENE=<id> node cartograph/reproject-raw.js`.
  - ⭐ **What you should see:** huron went from *"missing stl_parcels.json — skipping"* and **0 of
    3,678** buildings matched, to **3,576 (97%)**, and from ~98% of the town having no address to
    **3%**. Nothing about huron is in the code; the whole difference is one declaration.
- ### ⭐ **THE WORK QUEUE — which buildings to fill first, and how far down to go** *(2026-09-20)*
  Content hand-work is the one genuinely **unbounded** cost in a town: you cannot do 3,678 buildings
  and there is no honest way to pick 60. The Foundry now ranks every building from the free signals, so
  you work down the list and **stop wherever you choose** — and the top 40 being done means *the 40
  that matter* are done, rather than an arbitrary scatter.
  - **Where it is.** `node cartograph/bake-content.js --scene=<id>` stamps `prominence`
    `{ score, rank, signals, unknown }` on every roster record and prints the top 10 with its
    reasons. ⛔ **Never a bare number** — the breakdown names every signal that earned a point, so a
    rank you disagree with can be argued with.
  - ⛔ **IT IS A SORT, NEVER A FILTER.** Every building gets a rank in 1..N. There is no threshold,
    no top-N cut and no score that suppresses a card: rank 900 is as fillable as rank 1. The number
    orders a queue and that is the whole of its authority.
  - ⭐⭐ **THE ONE LINE TO READ: "evidence runs out at rank K."** Above K, buildings are ordered by
    somebody having *noticed* them — a Wikidata entry, a website, opening hours, a name. Below it the
    order is **footprint area and nothing else**, which is a real ordering but not a prominence one.
    Huron: **153 of 3,678** buildings are noticed by any source. That is the honest size of the
    signal, and it is the dial `§4.3` says the operator lacked: *how much town do you want?*
  - ⭐ **OVERRULE IT — that is the point, not a workaround.** The rank is a guess and residents know
    the ranking the data cannot see. Patch the town's `content/roster.overrides.json`:
    ```json
    { "patches": { "msbf-1234": { "promoted": { "by": "operator", "note": "the corner bar everyone means" } } } }
    ```
    A promoted building sorts **above every scored one**. ⛔ The score never overrules the person who
    knows — and on LS, where humans picked 87 landmarks over years, **27 of the 63 landmark buildings
    score below rank 63**, most of them with no signal but a parcel record. Park Avenue Coffee, Rhone
    Rum Bar, Polite Society, Baileys' Chocolate Bar. That population is the argument for the
    resident-promotion path, not a bug list.
  - ⛔ **A WELL THIS TOWN LACKS IS DROPPED, NOT SCORED ZERO.** Huron has no valuation, sqft, units or
    storey data, so those signals are removed for **every** building — uniform, and therefore
    rank-neutral, because a sort does not move under a constant. A building whose *parcel* simply did
    not match is different: it is listed in `prominence.unknown`, because "we did not join this" and
    "this is the cheapest building in town" must never rank alike.
  - ▶ **`node checks/claims-prominence-recovers-ls-landmarks.mjs`** — scores LS blind and reports how
    many of its 87 hand-curated landmarks the rank recovers, with the misses named. ⛔ The hit rate is
    **reported, never asserted**: tuning the weights until LS comes back clean is overfitting to the
    mould the kit was cast around. What is asserted is that the score beats random selection by 4×.

## The check suite — `npm test`

The repo's `claims-*` checks. One per bug-class, each stating a claim that can be **shown false**;
a non-zero exit is a **finding**, not a broken runner. Wired 2026-09-13 — before that all 157
existed and none ran, while 116 were cited by name in the docs as the corpus's own proof.

| gesture | runs | contacts |
|---|---|---|
| `npm test` | the `safe` tier | **nothing** |
| `npm run test:all` | `safe` + `local-effect` | nothing; ⛔ writes to disk, so not CI |
| `npm run test:live` | the `live` tier | ⛔ **production.** Refuses without `CHECKS_LIVE=i-mean-it` |
| `npm test -- --list` | — | prints what would run, runs nothing |
| `npm run test:tiers` | — | regenerates `checks/TIERS.json` + `checks/README.md` |

`npm test` runs in CI on both workflows. It takes ~8 min and writes nothing — run it twice and
`git status` is unchanged.

### ⛔ Why there are tiers at all, and why you must not flatten them

**A blanket run over every check hits the production Supabase project.**
`scratch/claims-onboarding-guard.sh` performs an unconditional `POST /auth/v1/signup` with **no
teardown**, and has already left anonymous users on the live project that were never removed —
a recorded incident (`SECURITY.md`, the 2026-08-31 audit disclosure), not a hypothetical. Every
invocation creates another.

⭐ **The tier is DERIVED from each check's source on every run** (`checks/tier.mjs`), never read
from a list. A hand-maintained manifest is a skip list: it is wrong the first time someone adds a
check, and wrong silently. `TIERS.json` is a generated artifact for reading and diffing — the
runner does not consult it, so it cannot go stale in a way that matters.

**Undecidable ⇒ excluded.** A check whose source cannot be read (a computed `import()`, an exec
whose command is not a literal) is tiered `live` even though it may contact nothing, because
"cannot be shown safe" is the only honest gate. ⛔ Do not resolve ambiguity in favour of `safe`.

**And the tier is not the only guard.** Every check in a default run is spawned with
`checks/_no-network.mjs` preloaded, which makes `fetch`, DNS and the socket layer throw. So
"`npm test` contacts nothing" is enforced on every run — including on checks added by people who
never read this page — rather than asserted once by someone who read the sources and felt sure.
That confidence is what produced the incident above.

### Which towns a check runs on

**Every check runs on every town that has the data it needs.** By default — no flag.

```
node checks/claims-<name>.mjs                 # every measurable town
node checks/claims-<name>.mjs altadena        # just that one
node checks/claims-<name>.mjs --scene=altadena  # the same thing, older spelling
```

⛔ **Never type a scene roster into a check.** Ask `checks/_scenes.mjs`:

```js
import { ribbonScenes, scenes } from './_scenes.mjs'
for (const scene of ribbonScenes()) { … }                      // ribbons-reading checks
for (const scene of scenes('public/baked/<scene>/shape.json')) { … }   // any other corpus
```

**Why this is a rule and not a style note.** 45 checks used to end
`if (!scenes.length) scenes.push('lafayette-square', 'hipointedemun')`. Every copy looked like a
sensible default, which is exactly why it survived: the corpus carried **a skip list spread across
45 files and nothing named it one.** Pour a new town and it was invisible to all of them until
somebody edited 45 files — and **nothing failed when they didn't.** The checks just kept reporting
on the towns someone typed in. That is Layer 0 q1 answered *"nothing for town #2"* and q2 (a
plausible-looking pass) in the same line.

The roster is **the look manifest ∩ has-the-artifact**. ⛔ Neither half alone: a bare directory
listing answers with `clean/`, `raw/`, `public/baked/default/` and two dead towns; an artifact
filter alone *looks* sufficient and counted `default/` as a town until a mutation test asked for an
artifact it happened to have. And **nothing is skipped silently** — a declared town that lacks the
artifact prints `⚠️ NOT CHECKED`, every run. Naming a town that cannot be measured exits 2.

⚠️ **A consequence to expect:** a check now covers 4–5 towns instead of 1–2, so it is slower and it
finds more. New reds after this change are usually **real defects in towns that were never
measured**, not regressions.

### Adding a check

Drop it in `checks/` (or `scratch/`, which is also scanned) named `claims-*.mjs`. It is tiered
automatically. Give it a one-line header stating **the claim it falsifies** — that line is what
`checks/README.md` prints. ⛔ Don't edit `checks/README.md`; run `npm run test:tiers`. Take the
scene roster from `checks/_scenes.mjs`, never from a literal.

▶ Re-derive the portability state, don't quote it: **`node checks/scene-portability.mjs`**
(`--list` names the files).

⛔ **OPEN: the length-one roster.** A batch of checks still do
`const scene = process.argv[2] || 'lafayette-square'`. That is the same defect as a typed roster —
a roster of length one — and it is *not* mechanical to port: several are genuinely single-scene
probes, and making one loop is a per-file semantic call. ⚠️ **Two instruments have now been wrong
about this class three times between two sessions**, so ⛔ don't quote a figure from either; run
the command. And note the ceiling: **only `lafayette-square` carries a frozen protopolygon** — no
other town has had every step run since ① landed — so a family of these cannot measure anything elsewhere
however portable they become. Portability ahead of that run buys capacity nothing can use.

### "I could not measure that" is not a failure — exit 2

A check that finds no data to examine must **exit 2 and say so** (`NOT MEASURED` / `NOT CHECKED` /
`could not run`). The runner then buckets it **NOT CHECKED** — printed every run, counted in the
summary, and it does **not** fail the build. ⛔ The exit code alone is not trusted: at least one
check exits 2 on a genuine failure, so a check that exits 2 **without saying so stays RED**. Code
*and* evidence, the same rule the `blocked` bucket uses.

```js
import { requireArtifact } from './_scenes.mjs'
const shape = requireArtifact(`public/baked/${scene}/shape.json`, 'baked shape.json')
```

⭐ **Why it matters:** `public/baked/` is gitignored, so a fresh clone has no Slab. A check that
*crashes* on the missing file is indistinguishable from one that found a defect — it reports ENOENT,
the run goes red, and nobody can tell which. Crashing turns *"I could not look"* into *"I looked and
it was broken."* The summary line now states green / red / **not checked** / blocked / timed out, so
the number that actually matters in CI — **how much did it verify** — is visible every run.

⚠️ **`npm test` in CI is a HOLD, not a gate** — but ⛔ **not for the reason first written here.** That
note claimed a fresh clone scores 36/126 because the Slab is gitignored. **The measurement was
wrong:** the clone had never run `npm ci`, so most checks died on a missing `clipper-lib`, not on
missing data. Re-measured with dependencies installed, the gap is about **2 checks, not 47** — CI is
not data-starved. The step is held open because the board carries **~36 genuine red findings that
fail everywhere**, and blocking on those is a scheduling decision, not a CI one.
▶ Re-derive both, never quote them: `npm test` · `T=$(mktemp -d); git clone --depth 1 file://$PWD $T/c; cd $T/c; npm ci; npm test`

## Save → ship — the lifecycle, the git tree, and the troubleshooting door

> **The door + the knobs for "the tree is dirty / how do I save / why is staging stale / it works here but not there."** Written so a future troubleshoot is a *lookup*, not a forensic. The Foundry's *mechanism* is `FOUNDRY.md`; the Slab's *byte format* is `SLAB-CONTRACT.md`; this is the **operator's** view of save-and-ship. Grounded against `serve.js`, the workflows, and `.gitignore` (verified 2026-06-17).

### Source vs. derived — the one distinction that ends the confusion

Everything in the tree is **one of two things.** Knowing which ends most "is this dirty diff real?" questions on sight.

| | **SOURCE** (you author it — intent) | **DERIVED** (the Foundry makes it — a shadow of source) |
|---|---|---|
| **Files** | `public/looks/<id>/design.json` (the SHAPE + Look SSoT — Survey widths/corners + Look materials/sky) · `clean/overlay.json` (Survey edits) · the raw set (`raw/osm.json`, `survey.json`, `elevation.json`, `measurements.json`) · `neighborhood_boundary.json` | `clean/map.json` · `src/data/ribbons.json` · `public/baked/<id>/shape.json` · `ground.json`+`ground.bin`+`ground.lightmap.png` · `scene.json` · `public/baked/<scene>/trees.json` (trees) · `public/looks/index.json` |
| **Who writes it** | the operator, via the tools (autosave) | the Foundry (`/looks/:id/bake`, see `FOUNDRY.md §2`) |
| **If you lose it** | gone — it's intent, not regenerable | regenerate it: re-run the Foundry from source |
| **Edit it by hand?** | yes — that's authoring (or a curated datum fix, `SURVEY.md`) | **never** — edit the source, re-run the Foundry |

**The rule:** to *change* the map, edit **source** and re-run the Foundry. A hand-edit to a **derived** file is a shadow-edit — it comes back wrong on the next Foundry run (the same lesson as `RIBBONS §1` / `ORIENTATION` "fix the centerline, not the shadow").

### Why the tree goes dirty — noise vs. real

The Foundry's geometry steps are **deterministic**: same source in → byte-identical `ground.bin` / `ribbons.json` / `map.json` / `shape.json` out (everything routes through `writeIfChanged`, `io.js`). So a derived-file diff is one of exactly two things:

- **NOISE — discard it.** Three files carry a `Date.now()` stamp that changes on *every* Foundry run even when nothing semantic moved: `scene.json` (`bakedAt`, `bake-scene.js`), `public/looks/index.json` (`updatedAt`/`bakedAt`, `serve.js`), `public/baked/<scene>/trees.json` (`generatedAt`). A diff that touches **only** those timestamp lines = a no-op Foundry run. Throw it away.
- **REAL — decide it.** A diff in the *geometry* of `ground.bin` / `ribbons.json` / `map.json` / `shape.json` means the source genuinely changed (a width edit, a corner, a new survey value). Keep it only if you meant the edit.

> **Fast triage:** `git diff --stat` — if the only changes are `scene.json` / `index.json` / `trees.json` at ~2 lines each, it's pure timestamp noise. If `ground.bin` / `ribbons.json` / `map.json` moved, real geometry changed — look at `design.json` to see which width/corner you (or an autosave) touched.

### Save / discard ceremony

The dev server **autosaves** source on every edit (Survey/Stage debounce → `overlay.json` / `design.json`) and **re-freezes** `shape.json` on Survey-exit — so the tree is *expected* to drift while authoring. Reaching a clean state is deliberate:

- **To discard churn** (the default habit while iterating): from a quiet tree (no active drag), `git restore .` returns to the last commit. Safe — source autosaves are already on disk; this just throws away uncommitted derived churn + unwanted source edits.
- **To save a Slab** (you authored something to keep): run the Foundry (Option-click the Foundry button runs every step, or `POST /looks/<id>/bake?force=1`) so the derived artifacts match source, then commit **source + derived together** in one commit (`bake(...)` or `feat(...)`). The Slab must travel as a coherent set (`SLAB-CONTRACT §9` rule 1) — never commit a `design.json` edit without the artifacts the Foundry re-made from it, or the deploy ships intent the Slab doesn't reflect.
- **The ports are canonical and pinned with `--strictPort`:** the kit's `dev:web` (here) and the Ward's `dev` (`theward/package.json`) — read the scripts, not this line. A taken port **refuses to start** rather than drifting to the next one, so a stale server can never pass for the live one. The three `serve.js` backends carry their own ports in source.
- **⚠️ The dev server reads the *main worktree's* branch.** Work done in an agent worktree is **invisible** on the lit app until merged into the checked-out branch. "Still not fixed" usually means "not merged yet," not "the fix failed."

### How it ships — local Foundry run → commit → CI serves as-is

**CI does not run the Foundry.** Both workflows run `npm ci` + `vite build` (+ `--base` for staging) and publish the checked-out `public/` as static files. There is **no `pipeline.js` / `bake-*.js` in CI.**

⛔⛔ **BUT "WHATEVER SLAB YOU COMMITTED IS WHAT DEPLOYS" IS NO LONGER TRUE (2026-09-01), AND ACTING ON IT SHIPS NOTHING.** `public/baked/` is gitignored and served from **R2** (`PUBLISH.md §6`). Two consequences that pull in opposite directions, so hold both:
- **The Slab needs no commit and no push.** Publish uploads it to staging and Promote to production. "Run the Foundry + commit before you push" is retired for geometry.
- **Everything else still does.** `design.json`, `looks/index.json`, `ribbons.json` and the OG image are tracked and ship the old way.

⭐ **So a stale *Slab* is now impossible-by-push and possible-by-upload:** if a Slab looks stale, the question is no longer "did I commit it" but "did it reach the bucket" — ▶ `node scripts/verify-baked-in-r2.mjs`.

| Branch | Workflow | Deploys to |
|---|---|---|
| `main` | `deploy.yml` | **nothing a visitor reaches** — `lafayette-square.com` 301s to `lafayettesquare.online` (measured 2026-11-01); the workflow retires in `BRIEF-ls-cutover-to-its-address` step 6 |
| **the trunk** — ⛔ derive it, never quote it | `staging.yml` | **`lafayette-square-staging` (GitHub Pages)** |
| any other feature branch | — | **nothing** (pushing it deploys no site) |

> ⛔ **THE TRUNK NAME IS NOT WRITTEN DOWN HERE ON PURPOSE.** It has moved twice, and both times a doc and a constant kept naming a branch that deployed nothing — the publish button reported success while staging never moved. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` derives it from `staging.yml` and fails if the code parts company with it. **The check is the answer; this page is not.**

Promote to staging = commit on the trunk and push (or fast-forward a feature branch into it); promote to prod = merge/fast-forward the trunk into `main` and push.

**The working loop (strategy B, chosen 2026-06-26; solo → work directly on the trunk).** Commit source on the trunk → **push it** (auto-deploys staging) → eye-check staging → **fast-forward `main`** when you want it public. Prod and the trunk are kept only a few commits apart, so a prod promotion is a clean fast-forward, not a big-bang. `git push origin <trunk>` (staging), then `git push origin <trunk>:main` (prod) once staging is verified.

> ⚠️ **Reason about deploy state from the REMOTE, never a stale local ref.** Always `git fetch` and compare `origin/main` / `origin/curb-offset-draw` — not local `main`/trunk, which drift badly when you live on a feature branch. On 2026-06-26 local `main` (`b39834b4`) read **1123 commits + "pre-slab" behind** while `origin/main` was actually **4 commits behind and slab-era** — an entirely phantom gap that nearly derailed a publish decision until the remote was checked.

### The troubleshooting door — symptom → knob

| Symptom | The door (go here, no forensic) |
|---|---|
| Tree always dirty, but no geometry changed | Timestamp **noise** (`scene.json`/`index.json`/`trees.json`) — §"noise vs. real" above. Discard. |
| Staging/prod shows **stale geometry** | ⛔ **The old answer ("you didn't run the Foundry and commit before push") is retired.** The Slab is served from R2, not from the deploy — a commit has nothing to do with it. ▶ `node scripts/verify-baked-in-r2.mjs` reads the bucket and names what is absent or the wrong size. ⛔ **It defaults to PROD keys — to check a staging Slab, prefix the base:** `ASSET_BASE=https://assets.theward.online/staging/ node scripts/verify-baked-in-r2.mjs --look=<look>`. If the bucket is current, it is a **browser/CDN cache**: hard-refresh (`PUBLISH.md §6` — TTL 300 s). |
| **A Foundry run looks like it did nothing on staging** | A Foundry run ends on disk: nothing reaches staging until **Publish**. Publish fails loudly when its R2 upload fails, so read its error first. |
| **Publish fails: "the slab upload failed — N of 915 objects FAILED"** | R2 hands back a transient 500 on a small fraction of puts. Since 2026-09-04 each put **retries 4× with backoff**, so a survivor of that is a real failure — read the key it names. ⛔ Don't re-run the whole Foundry to fix one object: the upload is **incremental**, so re-running only re-puts what actually differs (~15 s when nothing does). |
| **Blank map in a fresh clone / new machine** | `public/baked/` is not in the repo. `cp .env.example .env` and set `VITE_ASSET_BASE` (`README §Local development`). ⛔ **But comment it out again before you author**, or Stage/Preview will show you R2's Slab instead of the one the Foundry just made. |
| **Ground or buildings missing; the console says `baked/<town>/ground.json says it belongs to "<other>"`** | The Slab folder was moved or copied under a new town name, and its files still carry the old one. It is refused, not drawn under the wrong name (`src/lib/slabUrl.js#slabStamped`). **Re-run the Foundry for the scene under its new name.** ▶ `node checks/claims-the-slab-addresses-files-by-where-it-was-fetched.mjs` |
| Wrong in **Survey**, right in **Section/Foundry** | The **live-load path**, not the frozen geometry — measure-resolution / overlay / the vite bundle (`ARCHITECTURE.md §2.1`). |
| Section shows **no change** after a CLI Foundry step | The `shape.json` cache-buster (`?t=freezeTag`, `BlockGeometryV2Debug`) — a CLI step can't bump client state. Exit Survey (autosave-freeze) or click **Foundry** to bump it. |
| An **artifact in the Slab looks wrong** | First ask "is this the *live re-stroke's* defect, faithfully captured?" — the Foundry is the messenger, not the bug (`FOUNDRY.md §4`). Diagnose **upstream** (the live construction), never patch the output. |
| Proxy / node render disagrees with the app | **The operator's eye is the gate** (`[[feedback_proxy_render_is_not_the_operator_eye]]`). The proxy misleads in both directions — trust the lit app. |
| A SHAPE/curb silhouette is wrong | Upstream — Survey · skeleton · prebake. *How a ribbon bends* is Section (FILL). Name the layer before you fix (`CLAUDE.md` route gate · `ORIENTATION §3 (the Wall)`). |
| **Bloom (or another post effect) suddenly looks broken / no glow** right after DoF turned on or off (a Blur edit to or from 0) | An **HMR artifact, not a real bug.** The `EffectComposer` is keyed on its mounted pass set, so DoF turning on or off rebuilds the composer and Vite HMR can leave it detached → **hard-refresh the page.** Don't chase a DoF↔Bloom coupling — they share the pyramid by design. |
| **Trees don't show in Browse** | Known render "wake-up" — **nudge any look dial** and they pop in. It's the render/cull layer, not a look knob (tracked, unresolved). |

### `VITE_ASSET_BASE` — where the Slab is read from *(the one env knob you will actually touch)*

| | |
|---|---|
| **Unset** (default) | falls back to `BASE_URL` → **whatever is on local disk** under `public/baked/`. |
| **Set** | `https://assets.theward.online/` → the published Slab in R2. |
| Where prod/staging set it | a GitHub Actions **variable** (not a secret), read by both workflows. |
| Where you set it | `.env` (see `.env.example`). |

⭐ **The fork that matters, and it is easy to get backwards:**
- **Viewing** the map (fresh clone, no local Foundry run) → **SET** it, or you get a map with no ground, buildings or trees.
- **Authoring** (Stage, the Foundry, then Preview) → **COMMENT IT OUT**, or you will run the Foundry on a scene and then inspect R2's *older* copy. That reads exactly like a Foundry run that didn't propagate — the confusion `PREVIEW.md §7` warns about ("a wrong Preview is a wrong Foundry run"), except the Foundry run was fine.

⛔ **There is deliberately no automatic fallback between the two.** A missing asset 404s loudly rather than resolving to something that renders, because a broken local Foundry run that silently looks fine is the failure this whole arrangement exists to prevent.

### Named levers (deliberate)

- **The save ceremony is the Preview "Publish" panel** — one button commits the scoped Slab pathspecs only, then pushes. Use it instead of eyeballing the dirty tree. It runs on DEV-ONLY git endpoints in `cartograph/serve.js` and the panel **hides when the backend is unreachable**, so a deployed Preview can never touch prod. ⚠️ **For a Slab-data publish, staging is redundant — push straight to prod:** Preview already renders the Slab in production's exact tree, so it *is* the gate. Staging-first still applies to **code / structural** changes. Home: `PREVIEW.md §0.2`.
- **⏳ Chosen but unbuilt — kill the timestamp noise.** Make `scene.json` / `index.json` / `trees.json` omit or stabilize their `Date.now()` fields so a no-op Foundry run is byte-identical and the tree stops going dirty for free. *(Companion, also unbuilt: a reproducibility gate — a CI/pre-push check that the committed Slab equals a fresh Foundry run from source, to catch a stale Slab before it ships.)* Tracked in `BACKLOG.md`.

*Provenance: Boz 2026-06-01 (seed); populated 2026-06-14 from the FEATURES operator-knob migration; **save→ship lifecycle + troubleshooting door added 2026-06-17** (the forensic-to-lookup conversion); **Stage + Preview expanded to the full code-grounded knob master list 2026-06-26** (pyramid tuner + inclusion manifest flagged in-flight); **Extent / no-CLI intake→Foundry flow documented 2026-07-04; rewritten to the INCLUSION-POLYGON procedure + the three-sizes/two-centers model 2026-07-23** (the canon sweep — step 5 had still carried the retracted "the circle IS the boundary" model, which was on the routing path and was actively mistraining agents; design of record `EXTENT-DESIGN.md`). The operator-manual counterpoint to FEATURES.*
