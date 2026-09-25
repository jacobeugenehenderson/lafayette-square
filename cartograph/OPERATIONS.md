# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/PIPELINE/RIBBONS = developer). Engineer-internals behind these knobs live in `ARCHITECTURE.md`; the geometry in `RIBBONS.md`.

---

## Extent — define + pour a new neighborhood (no CLI)

> **The intake / step-0 tool: define any neighborhood by eye on a labeled aerial, then pour it to a rendered 3D slab in one click — the whole intake→3D arc as one tool, no terminal.** `ExtentApp.jsx` + `BezierPen.jsx`; committed on trunk `curb-offset-draw` (not yet in prod). Reach it from the **`◎ Extent`** button in the toolbar. **Fresh arrival = no map** — nothing is fetched until you frame and Fetch. **The model (2026-07-20): you say what the neighborhood IS — an inclusion polygon — and correct the margin.** Search a place and inherit its published boundary, or click the bounding streets in any order and watch the ring close; exclusion loops and per-building toggles are corrections on top. The circle is the **slab disc that renders**, not what decides membership.

The flow, top to bottom (the cheap edits auto-save; the one heavy op — **Bake** — is explicit and folds Commit + Pour):

1. **Search → Name.** Type a place, a ZIP, or ZIPs separated by commas, and hit **search** — the camera frames it on the global aerial, and **Name** fills with the place it found (the town, never the ZIP; ZIPs in different towns leave it blank). ⭐ **The Name names the scene**: its slug is the scene id (`The Cloisters` → `the-cloisters`, `Księży Młyn` → `ksiezy-mlyn`), so edit it before you Fetch. A blank or numeric name, or one another neighborhood already has, is refused at Fetch (▶ `node checks/claims-a-scene-is-named-not-numbered.mjs`). Nothing is fetched yet — only the draft is saved. Until you search, the screen is blank by design.
2. **Frame the neighborhood** on the labeled aerial. Pan/zoom the overhead view until the hood you want fills the frame — you're reading real street labels off the ortho photo, choosing the extent *by eye*. **Frame-then-fetch: "if you can see it on screen, it's in the list."**
3. **⚠️ Frame TIGHTER than feels natural.** A wide fetch makes **huge** artifacts and can OOM the pour. An early wide test fetch (~5.4 km) produced a 180 MB map; a real ~3 km neighborhood is roughly **10× smaller**. Frame to the actual hood — a ring of margin, not half the metro.
4. **Fetch this view.** Reads the current viewport, writes a `geography.json` centered on the framed bbox, then pulls OSM + builds the skeleton for that area. This is the fetch — after it, the streets are known. ⭐ **It also finds the town's LIDAR now** (ruled 2026-09-23). The panel reports an `elevation` source like any other: a tile count, or **verified-absent** — *searched the whole ladder, this town has no lidar, do not search again.* ⛔ **Nothing is downloaded**; the fetch writes the tile list and the terrain bake range-reads it, so a town's ~1 GB of 1 m lidar costs a few MB to bake. ⚠️ **A verified-absent town bakes FLAT, and that is now a decision on the record rather than a line in a skip list** — which is how a dune town came to be poured flat with nothing but *"terrain (no elevation.tif — flat)"* to show for it.
5. **⭐ Author the BOUNDARY — say what the neighborhood IS.** This is the step that decides membership. Three ways in, all producing **one inclusion polygon** (stored lon/lat, so it survives a re-frame): **(a) adopt a published ring** — if the searched place has a gazetteer boundary it is drawn **violet and INERT**, deciding nothing, and becomes your polygon only when you press **`⬡ Adopt the published boundary`** (`release` undoes it). ⛔ **It used to seed the polygon on search**, so the hint silently *was* the membership decision (fixed 2026-09-19). Rings range from LS's coarse 26-point outline to Księży Młyn's 815-point cadastral trace; **(b) click the bounding streets** on the labeled aerial, **in any order** — the ring rebuilds from the junctions they share, and a street that doesn't meet two others lights up as a named gap instead of failing silently; **(c) draw it.** Because the ring is made of real streets meeting at real junctions, it never slices a building or halves a block. ⛔ **Street names come FROM the fetch** — there is nothing to click until step 4 has landed.
6. **Set the disc — what RENDERS, not what decides.** The circle is the **slab disc**: the ground plane, the horizon, the soft fade at the rim. Drag the **in-scene radius handle** to size it — the hood's actual extent plus slight aesthetic padding. ⚠️ **The disc HIDES what's outside it, but it does not decide membership** — the polygon does (step 5). An *un-authored* scene auto-fits the disc to every fetched building, which is why a fresh fetch shows a huge, off-center circle; that is the disc needing authoring, not the fetch being wrong. ⚠️ **Do not resize the fetch when the disc is the problem** — the recurring trap (`EXTENT-DESIGN §3.3`).
7. **Draw exclusion loops (the pen) — a CORRECTION on top of the polygon.** Toggle **"✎ Draw exclusions"** and loop the strays to carve them OUT — a commercial strip, the far side of an arterial, forest/mountain past the real edge. The loops are **real editable bezier curves**: click for corner anchors, click-drag for smooth handles, drag an anchor to move it, click a segment to insert, select + Delete to remove. **`Space` suspends the pen so you can pan.** The loops persist (lon/lat) and **reopen fully editable in a later session** — this is the "keep fixing the bounds forever" contract. Membership = **`((polygon − exclusions) ∪ activate) − hide`**. ⭐ **A loop is a coarse sweep and a per-building toggle beats it** (ruled 2026-08-04): lasso the commercial strip out, then click the one corner shop you want back — **the click wins.** To re-remove it, un-click it or hide it. `hide` always wins. *(`NEIGHBORHOOD-INPUTS §5.2` carries the full ordering.)*
8. **Per-building override (the ragged edge — optional).** For the idiosyncratic margin one exclusion loop can't express cleanly, click a single footprint to force it: **hide** an inside building, **activate** an outside one. Saved per scene (`building-overrides.json` = `{ activate, hide }`, **git-tracked** — reproducible source, not just baked). Layers on top of the loops.
9. **Bake.** The one heavy button — it folds **Commit + Pour**. Commit re-centers `geography.json` to the boundary centroid, reprojects every frame-dependent raw layer, rebuilds the skeleton, and writes `neighborhood_boundary.json` (the circle + your flattened `exclusions`) + `neighborhood.json` (name/blurb/radius/timezone/exclusions/`committed:true`). Then it pours: derive (clipped to circle − exclusions) → ribbons → Look → bake the slab (ground / buildings / lamps / scene / AO) → drops you into the Designer on the finished 3D, **in Survey**. ⭐ Every way out of Extent (Bake, and the **← Designer** button) lands in Survey whatever tool you left: a changed frame is a shape nobody has inspected yet (▶ `node checks/claims-extent-lands-in-survey.mjs`). **The pour is LONG** — the *derive* processes the whole fetched area before clipping, so a wide fetch is slow *and* heavy (another reason to frame tight, step 3). Guarded per-scene against a double-click race.
10. **Re-editing a committed hood.** Reopen it, adjust the radius or the exclusion loops, hit Bake again — it takes the **light rescope path** (re-clip + re-bake in place, *no* re-center), so authored corner/hero work isn't orphaned. **A committed hood cannot be re-centered at all — by you or by anything else.** The frame origin is frozen at the fetch center and never moves; a hood whose centre you shift is stored **off-origin on the disc** instead. *(There used to be a "re-center guard" that refused a >5 m move; it was **removed 2026-07-23** because under the never-move model there is nothing to guard. Don't count it as a protection — the frozen origin is the protection.)* ⚠️ Membership is applied at **pour/bake, not live** — the loops/overrides show live in Extent, but the 2D Designer + 3D slab only reflect them after the Bake.

> **⭐ The inclusion polygon is first-class (2026-07-20).** It is authored, persisted and PRESERVED — `commit-extent` and `rescope` both accept one, and neither drops it. Previously a re-bake deleted it silently, which left HPDM's hand-authored 4-point boundary one Bake from gone. A scene with no polygon falls back to the disc, so excluder-era hoods bake byte-identical.

### The two-pass fetch — the square is derived from the DISC

`node cartograph/fetch.js --scene=<id> --pass=light|heavy [--dry-run]`

- **light** — the SOFT fetch. The generous envelope, and only what a boundary can *run along*: `highway · waterway · railway · boundary`, plus the painted footprints you need to judge an edge. Cheap, reversible, re-runnable.
- **heavy** — the HARD fetch. The pour material (`landuse · leisure · natural · amenity · barrier · surface · man_made`), scoped to **the square containing the disc + 25%** — ⛔ **not** to the frame. It *augments* the light pass and never clobbers it.
- **omit `--pass`** — the pre-split behaviour: one envelope, everything.
- **`--dry-run`** — resolve the envelope, run the containment gate, print, stop. Touches neither Overpass nor disk. Use it to see the gate refuse before you trust it.

⭐ **Why it is derived from the disc and not the frame:** `bbox ⊇ disc` then stops being a check that can fail. Deriving the box from the search — which is what the single-pass tool does — is how altadena's zone came to sit **1,906 m** outside its own envelope, silently: nothing errors, the streets just stop on one side. ⛔ The heavy pass **refuses** rather than fetch a square the light pass never acquired.

⚠️ **Only the CLI is split so far.** The Extent tool still performs one undivided fetch, so the square does not yet centre the circle in the UI. → `_archive/EXTENT-EXCAVATION-DIARY §0.1`, `EXTENT-DESIGN §3.3`.

### ⭐ The three sizes and the two centers — read this before you touch a radius

The single most re-derived thing in this tool. **Nested: hood < disc < bounding box.** Two *independent* centers, and they are not the same value:

| | What it is | Can it move? |
|---|---|---|
| **The bounding box** (the fetched square) | the frozen frame — the "forever safety zone," sized at **radius + ~20–25%** (a *percentage*, so it scales with the hood; a flat 1000 m is enormous on a small hood and trivial on a big one) | **grow: yes** (append) · **shrink: yes** (destructive — you lose the trimmed data) · ⛔ **MOVE: never** |
| **The disc** (what renders) | the ground plane / the world's horizon; radius = the hood's real size + slight aesthetic padding | freely, forever — its centroid is a **draggable handle**, independent of the frame origin |
| **The hood** (the polygon) | what actually decides membership | freely (re-author, re-bake) |

⛔ **Never move the frame origin of a committed hood.** Growing or shrinking *from a fixed center* leaves every retained coordinate and building id exactly where it was — block keys, authored corner/hero work, and content anchors all still resolve. **Moving** the origin reprojects everything at once and re-orders identity; that is the failure that once took a hood's content from 84 anchors to 5. The machine enforces it by never moving the origin at all (step 10) — the old opt-in "re-center guard" is gone, so there is no longer an override to reach for. **A correctly-isolated hood sitting off-center in its box is EXPECTED, not a defect** — that's the two centers doing their separate jobs.

⚠️ **Inside the forever zone, these are live and need no re-pour:** hide/reveal buildings · change the disc radius · move the disc centroid. That is what the ~20–25% padding is *for*. *(Design of record: `EXTENT-DESIGN.md §3.3`.)*

## Density — "more lamps and trees" (the vibes knobs)

*Density is product, not decoration. Both populations are a **union of wells**, deduped — never one well winning (`BAKE.md §4.5`).*

- ⭐ **Lamps — every town gets the lamps its own pull already carried** *(2026-09-20)*. They **union across the wells**, deduped at 4 m, with provenance printed per pour:
  - ① **the live pull** — `node["highway"]` has always returned `highway=street_lamp`, so the data was on disk the whole time. ⛔ **The absent thing was never the lamps, it was the reader**: derive only ever opened `raw/osm_street_lamps.json`, **a file nothing in the pipeline writes** (it exists once, hand-exported from Overpass years ago, for LS). Every poured town therefore got an honest zero forever, and the honesty hid that the answer was already in `raw/osm.json`. huron went **0 → 30** with no new fetch.
  - ② **the per-scene hand export** (`raw/osm_street_lamps.json`) — kept because LS's 641 live there. ⛔ **Never a cross-installation fallback**: each scene reads **its own** file; no town inherits LS's. It retires itself the day LS is re-fetched.
  - ③ **the authored well** (`data/<scene>/authored_lamps.json`; LS's is still the legacy `src/data/street_lamps.json`) — for lamps OSM doesn't carry. To add lamps by hand, add them here and re-bake. *(Before 2026-07-23 ① and ③ were alternatives, and LS's 80 authored park lamps silently stopped baking the day it gained an OSM fetch.)*
  - ⚠️ **Zero lamps now says why.** A town whose pull predates the tagged-node ingest fix (2026-09-20) needs a **re-fetch**, and the pour prints that instruction rather than a bare 0. ⛔ A lamp file that exists and will not parse now **throws** — it used to read identically to "this town has no lamps".
- **Trees — the one knob that matters is `lu-policy.json`.** Trees are excluded by two gates, and they are very different sizes (measured on LS, `scratch/tree-lu-exclusion-census.mjs`):
  - **hardscape paint** (pavement/sidewalk/asphalt) — 1707 trees, 25% of the census. **Not a knob.** Surveyed trees here get *nudged* onto legal ground, because our strips are guesses and real trees win.
  - **the land-use allow-model** — **This is your dial.** Drop a `cartograph/data/<scene>/lu-policy.json` — `{"commercial": "soft"}` — and those interiors become plantable. Per-scene, no kit edit, no code change. ⛔ **The kit defaults are NOT restated here** — they were, they went stale the day the vocabulary widened, and a class list in prose is quoted for months by people who cannot re-derive it. The `[lu-policy]` block the bake prints names every class, its kind and where the kind came from.
  - ⭐ **THREE GROUND KINDS, not two** *(ruled by Jacob 2026-09-20)*. `soft` = the census tree may stand. `hard` = the interior is forbidden to a tree — ⚠️ **and `hard` does not mean paved**: `beach` and `bare` are hard because nothing grows on sand or scree. `planted` = green, and the planting is **specified** rather than free — a cornfield grows corn, an orchard grows fruit trees in rows. A `planted` row carries its own species: `{"agricultural": {"ground": "planted", "with": ["zea_mays"], "pattern": "rows"}}`, and the species ids are the same ones the roster and the Arborist already speak.
  - ⛔ **A `planted` class grows NOTHING today and the bake says so by name.** Nothing in the kit reads the planting spec yet — the Arborist is a species factory, `bake-trees` substitutes against a municipal census, and the policy only subtracts; there is a filter where there should also be a generator (`docs/briefs/BRIEF-field-shader.md`). The face still paints its own colour, so the land reads as worked ground rather than going bald.
  - ⚠️ **An LU class the kit has never seen defaults to SOFT and announces itself** — wrong-but-visible beats wrong-and-silent (the HPDM bald-blocks lesson: 7.7% of that hood went bald with no warning). Check the `[lu-policy]` block the bake prints.
  - ▶ **`node checks/claims-every-lu-tag-has-a-home.mjs`** — fails, naming the tag and the town, when a town brings an OSM land-use tag that is neither mapped to a class nor declared not-a-land-use by name. It also fails when a tag is fetched but never bucketed, and when a class the producer can emit is missing from any of the six places the vocabulary lives.
  - ⚠️ Re-run the harness after changing the policy; and remember a tree bake needs the **frozen `shape.json`** — there is no honest forbidden-surface without it.

## Survey — the hardscape-SHAPE tool

The hardscape silhouette: centerlines, smoothing, caps, anchor, road metadata, corner radius, curb.

- **Asphalt-edge handle** — `pavementHW` per side (the half-width of pavement).
- **Auto-smoothing** — a selected chain shows its raw points for editing; returns to the smooth curve on `enter`. Street smoothing rides **one knob** (`STREET_SMOOTH`) so the navy centerline and the curb are one curve by construction — never two copies kept in sync by hand (`SKELETON.md §3.5`).
- **Caps** — round / blunt / none, per dead-end (a free per-dead-end authoring choice; `SECTION.md §6`/D6a + G8 govern the *fill*).
- **Curb** — global width, its own material.
- **One-way arrows** — a chain flagged `One-way` draws amber travel-direction chevrons on the Designer ground plane (overlay only — nothing baked reads them). Hide them at **Design ▸ Streets ▸ One-Way Arrows**; it writes the Look's `layerVis.oneway`, so it is per-scene authoring like every other visibility toggle.
- **Marker (FAB)** — a freehand pen overlay for triage, independent of the authoring tools (`FEATURES.md §Designer`). Toggle the FAB to draw; each stroke persists immediately to `data/clean/marker_strokes.json`. Stack: **eraser** (click a stroke to remove it) · **undo** (drop the last stroke) · **clear all**. The server's `/analyze` endpoint reports the parcels + blocks under the current strokes — circle a defect, ask "what's under here?" ⚠️ **OPEN BUG (2026-07-08): the overlay drifts saved strokes hundreds of m on reload** (`marker_strokes.json` centroids move between loads — a viewBox/frame mismatch). Use it for rough "what's-under-here" triage, **not** as a precise-coordinate source — it sent a whole debugging session chasing the wrong building. For frame-honest placement use skeleton geometry + OSM lon/lat through the current `geography.json`. See `[[project_marker_overlay_drift_bug]]`.
- **The corner-radius kit — three layers that stack at every intersection** (Blocks ▸ Shape):
  1. **Global `Corners` slider** — multiplies every IX radius for the active Look. `1×` = AASHTO/NACTO baseline; `>1` = bubblier; `0` = fully square (useful for sponsored "retro" mode). Dragging it *resets* both override maps on commit ("scale all corners to this × default").
  2. **`Edit corners` toggle → per-IX dot** — a big blue dot at each IX center; drag the radial distance from cursor to IX to set that IX's radius (homogenizes the IX). Right-click an IX dot = **revert that IX** (clears its per-IX + per-corner overrides) without touching the rest of the map.
  3. **Per-corner cyan dots** — adjust a single corner alone, for true corner cases.
  - **Color coding:** blue/cyan = default · gold = operator-authored · white = mid-drag. Resolution at render: per-corner → per-IX → data-default, all × the global scale. All three layers persist per-Look to `design.json`; bake reads the same maps. Per-corner identity uses leg-pair keys so authoring survives chain-edit churn.

### Highways — built from their lanes, never authored *(H-3)*
A motorway/trunk is swept from its lanes and the values in `references/registry.json`. **No handle moves it**: an override is refused, printed, and kept. The land it bounds is sorted at the pour — **verge** (bare grass, no choice) · **junction residual** (building-less, at a ramp end) · **block** (bare highway edge). Each pour prints, by id:
- skeleton: *Interstate status unknown*, two-way motorways · derive `Highway section`: sources, `ASSUMED` lanes, `[U]` values · derive `[H-3 ④]`: verge/JR/block, gores, parcel-vs-building · `[tileGround][H]`: tapers, handoffs.
- ⛔ `NO WIDTH` / `poured before H-3` ⇒ **re-pour the town**. H-3 checks read NOT CHECKED until then.

## Section (was Measure) — the ped-profile tool

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
  end to end). ⚠️ Reaches the map only after a **skeleton pour** — a Survey-exit freeze rewrites
  `shape.json`, not the seed.
- **Strip-material swap** — ctrl-click an LU↔SW strip to flip it.
- **Edit-row vs edit-block** — author one frontage-edge or a whole block.
- **Translucency-focus** — the selected element renders translucent / context opaque (by design, `RIBBONS.md §5`).
- **Revert to Default** — footer button (whole-scene) · **⌃-click a ped handle** = per-edge re-seed to the calculated best-effort (gleaned treelawn-Y/N + ADA defaults). Field-scoped so it never wipes Survey (`SECTION.md §8`). ⭐ **Clears the CAP FLIP too** (fixed 2026-08-06, `d6a95a0b`): `capFlip` inverts the materials at a dead-end cap — a sidewalk↔treelawn swap by another name — and it was in **neither** revert list, so the tool reported success while the flip silently survived and the scene claimed to be at default when it was not. ⚠️ **There is still no PER-CAP revert gesture** — ⌃-click on a cap *is* the flip — so one cap's way back is flipping it twice; the footer button is the only path. Guard: `node checks/claims-revert-field-coverage.mjs` fails if any authored field is missing from both revert lists.

## Stage — the look tool

Materials, color, visibility, shaders, sky, post-FX, neon, camera — the per-Look aesthetic, baked into the slab. Everything here is **WYSIWYG and live**: a tweak shows on screen immediately, and the bake freezes that exact state into `scene.json` (`STAGE.md §3`). Two facts shape every knob below:

- **Every look value is a *time-of-day curve*, not a single number** — the **TodChannel** (`STAGE.md §1`). You drag a slider *at the currently-scrubbed time*, and the channel records the curve, so one Look renders dawn, noon, and deep-night faithfully. A channel left unanimated is a flat scalar (the same value all day).
- **The only deliberate "save" is forking a named Look** ("＋ Save as new Look…"). Every other tweak just autosaves the active Look to `design.json` (~300 ms debounce); there is no "save the bake."
- ⭐ **"Kit Default" is the 0-state Look, and it is deliberately EMPTY** *(2026-09-19)*. It is what a new pour seeds from, so it holds **no town's anything** — no widths, no camera, no sky. It binds no scene and **cannot be baked**; the Stage panel opens it showing the kit's own defaults for every channel. ⛔ It is not a Look to design in, and it cannot be deleted. **A fresh pour therefore opens on kit defaults, not on Lafayette Square's** — which is the point: LS was the default until now, so every town poured before this inherited its look. *(If you want a town's look as a starting point, fork from that town's Look explicitly.)*

The full channel inventory + where each persists is `STAGE.md §1`; the cards below are the operator's-eye view — *which knob is on which card, and how to drive it.*

### How to operate any TOD channel (the universal mechanic)

Every animatable channel shares one drawer, and **the 7 time-of-day slot chips are always visible** (dawn / sunrise / noon / golden / sunset / dusk / night) — there is no "animate" toggle to arm. The live edit target is simply **the slot the playhead is parked on**: that chip is highlighted and its sliders are LIVE. **Edit a value to write that slot's keyframe** — a still-flat channel auto-converts to time-keyed on the first edit (no arming step). **In a gap between slots the playhead is on no slot, so the sliders go read-only**, showing the resolved (tweened) value; **click a chip to scrub the playhead onto that slot** and make it live. Because each slot's time is stamped, editing a value never jogs the timeline — the playhead only moves when you click a chip. **Turn-on / -off speed** (the ramp inputs, in minutes) appear once a channel has ≥1 keyframe — they shape how *sharply* the value crosses between slots: small = snaps on, large = eases in over the long tween (e.g. a lamp tripping on ~30 min before dusk rather than ghosting up all afternoon). *(2026-06-30 — reframed from "transition in/out minutes" jargon to the turn-on/off intent.)* **✕ Clear**: parked on a keyframe → removes *that* keyframe (the value falls back to the tween; removing the last one returns the channel to its flat value); otherwise → clears the whole channel to its flat default. *(2026-06-27 — unified: dropped the "animate/animated" toggle; chips are always on and the playhead's slot is the edit target. The internal animated-vs-flat data shape and the bake are unchanged — `animated` is just no longer surfaced.)* Toggle-type channels lerp 0↔1 between slots; color fields are an HTML color swatch storing a hex string. *(2026-06-28 — nearly every Sky & Light + Post + Lamps channel is now TOD-animatable: this pass promoted **lantern · ambient · exposure · halo · mist · dof (Focus) · warmth · dirMoon · fill** alongside the channels already curve-aware — so the whole frame can ride the day.)* ⚠️ **Converting a flat channel to TOD needs an anchor slot, or it applies globally.** The resolver gives a single-keyframe channel that *one* value at **all** times — so when you turn a still-flat channel into an animated one, first seed an anchor slot (noon or night) with the prior flat value, then author the others off it. Skip the anchor and the first keyframe you write becomes the value for the entire day.

### Light & Sky card

> *Panel reorganized by intent 2026-06-30 (Phase A) — `scratch/LOOK-PANEL-TAXONOMY.md`. Labels below are display-only; data keys (in `code`) unchanged.*

**Sky colour (the dome gradient).** The dome's colour is authored as **sparse grid overrides** — `{hour, band, hex}` triples on a per-season grid (bands = **horizon / low / mid / high / sunGlow**), and the **Sky Builder** is the live tool for placing them. ⚠️ **Overrides key on the CLOCK HOUR, not the TOD slot — and the slot→hour mapping shifts by season** (e.g. summer sunset ≈ hour 20, winter ≈ hour 17). So a sunset colour authored for one season **won't track the slot** in another; author per-season or expect the hue to land at a different point of the day. **Lamps ride a TOD channel on top of an automatic sun-altitude ramp** — photocell behaviour: lamps trip **on** at civil dusk/dawn and **off** near sunrise as the sun clears the horizon, with the Lantern channel (Light Sources card) scaling that automatic turn-on.

**Light & Shadow group** — the directional lights, the soft fill, and how dark the darks read (all TOD). *(Occlusion / Shadow lift / Cast shadows moved here from the old Post card 2026-06-30 — they belong with the lights, by intent.)*
- **Sun light** (`dirSun`) — the directional sun.
- **Moon light** (`dirMoon`) — the directional moon (carries the night).
- **Fill light** (`ambient`) — flat fill light, the same on every surface; the "not-black" lift. *(Was "Ambient.")*
- **Sky fill** (`hemi`) — gradient **skylight**: up-facing surfaces take the **sky-top** colour, down-facing take the **warm horizon** bounce. **Driven by the live sky gradient + strengthened (2026-06-30)** — the lever for *washing surfaces in the sky's colour* (distinct from flat Fill light, which has no shaping). *(Was "Hemisphere.")*
- ⭐ **Cast shadows** (`shadow`) — **Penumbra (m)** `1–60` + **Samples** `4–32`. Penumbra is how wide a shadow edge is **in metres on the ground**; Samples is how many taps pay for it (softer/cleaner ↔ cheaper). ⛔ **THE UNIT CHANGED 2026-09-20 AND THIS IS THE ENTRY THAT SAYS SO.** It used to be a kernel size in **texels**, which only held still because the shadow frustum was hardcoded to ±900 m — one fixed 0.4395 m/texel in every town. The moment the frustum was derived per town the same authored number meant a different real softness in each: huron's `23` became an **83 m smear** across a town whose buildings are 20 m wide, which reads as no edges at all. **Every stored value was migrated ×(1800/4096), so no town's look moved.** ⚠️ For scale, the sun's real penumbra is ~0.0093 × blocker distance — a 10 m wall throws ~9 cm — so a large authored value is usually compensating for something else. ⛔ **No stencil ⇒ no shadows, loudly**: a scene whose size the kit cannot resolve stops casting and logs why rather than inventing a frustum. *(Was the "Shadow" knob under Post›Finish.)*
  - ▶ Debug seams, house `window.__` convention: `?shadowmask=1` · `window.__r3f` · `window.__terrainExag`. ⚠️ `?shadowmask=1` carries a warning earned the hard way — its first cut called `getShadowMask()`, which three defines for Lambert/Phong and **not** `MeshStandardMaterial`, so every ground shader died `VALIDATE_STATUS false` and rendered **uniform white**, which is indistinguishable from a legitimate "everything is lit" reading.
- **Occlusion** (`ao`) — ambient occlusion (N8AO): contact-darkening in crevices. Fields: radius, intensity, distance-falloff. *(Was "AO.")*
- **Shadow lift** (`fill`) — lifts shadow floors (distinct-and-deep ↔ soft-and-open). **Owns the FilmGrade `uToe` uniform** — which is why the Grade Toe slider was removed (Fill overrode it, so it did nothing). *(Was "Fill.")*

**Sky & Air group**
- **Sky brightness** (`skyGain`) — *"how dark is the night sky."* Dims (or lifts) **just the sky dome** on a TOD curve — bands, sun/moon glow, horizon scatter together. Exposure scoped to the sky layer: the global **Exposure** knob (Image card) darkens the *whole frame*, whereas this touches only the dome — so deep night goes genuinely dark while street lamps and lit windows stay where authored. Stars are not affected. LS authors ~1.0 by day dipping to ~0.2 at Night; default 1.0 leaves an unauthored Look unchanged. **Reach for Sky brightness when the *sky* is too bright; Exposure when the *whole image* is.** *(Was "Sky Layer Gain." Note 2026-06-07: bloom no longer auto-boosts at night — author it in the Image **Bloom** channel.)*
- **Mist** — fog density + colour (the FogExp2 the runtime applies). TOD.
- **Halo** — the aerial-perspective glow strength + colour (sky-light bleeding into distance). TOD.

**Night Sky group**
- **Constellations** — toggle the spectral-node constellation overlay (TOD; defaults off, lifts at night).
- **Stars** — brightness multiplier on star visibility (on top of the physical night-fade).

**Neon** — the neon look as one grouped TOD channel: **core / tube / bleed / emissive** intensities, plus the **tube-radius** field. Tube radius (per-Look `tubeRadius`, ~0.1–3.0 m, default 1.0) is the odd one out — unlike the intensity fields it **drives geometry**, so it rebuilds the merged neon mesh on change (step-quantized so a drag doesn't churn). Neon *colour* is set on the Surfaces card's **Neon** tab. *(Phase B will move Neon into the Light Sources card with Bloom + Lamps.)*

### Image card — post-processing *(was "Post")*

> *The post-FX passes below are entries in one declared pipeline manifest (`renderPipeline.jsx`), installed identically in production, Stage, and Preview (2026-06-30). Each knob here = a manifest entry's channel; in Preview the same passes appear as the toggle/cost matrix — no separate Preview render path. Mobile is the manifest's `platform` field (currently drops the desktop-only passes; a future low-bracket, not a fork). Mechanism: `ARCHITECTURE.md §8 "Render pipeline"`.*

All Image channels are TOD. Grouped by intent:

**Tone & Color group**
- **Exposure** — global brightness of the whole frame, a **multiplicative gain** (the master image knob; contrast with Sky brightness, which is sky-only). ⚠️ Because it multiplies, it **can't lift crushed blacks** (near-0 × anything ≈ 0) — for that, reach for **Grade › Brightness** (the additive lift).
- **Warmth** — cool↔warm colour-temperature tint across the image.
- **Grade** — the film grade: **Brightness** · **Saturation** · **Contrast** · **Vignette**. **Brightness** (new 2026-06-30) is the **B of HSB** (Saturation = the "S") — an *additive LIFT* (`c + B·(1−c)`) that raises the black floor while leaving the white point put, so crushed dark surfaces read; it's the lever Exposure structurally can't be. *(The dead **Toe** field was removed — the Shadow lift channel, Light & Sky, owns the FilmGrade `uToe`.)*

**Glow group**
- **Bloom** — glow on bright **contrast** (edges + points of light), not on broad brightness. A *band-pass* off the shared blur ladder: bright local detail (a sharp mip minus a blurrier one) glows, so lamps/neon/glints read as points and a bright sky **backlights** dark objects as a rim, while open sky and flat surfaces don't wash. Fields: intensity (strength), threshold (**how much contrast it takes to glow** — runs LOWER than the old absolute-bright bloom), smoothing (the knee), warm/cool tint. Additive (HDR-correct; SCREEN darkened the HDR-bright sky). *(Owns night glow — see the Sky brightness note. `CustomBloom.jsx`, off `DownsamplePyramid.jsx`.)*

**Lens & Film group**
- **Focus (DoF)** — depth-of-field (`RomanceDoF`). **Single-focal + a hero pocket**: sharp from the camera out to **Focus distance**, then the blur RADIUS grows with depth (the mid/far melts — the LoD cover), picked from the shared blur ladder (a real focus pull, not a haze cross-fade). **Hero softness** gives the designated hero (the Arch) its own gentle blur near its distance — *a little soft, like IRL* — anchored to the live authored hero placement. Fields: On · Blur (mid/far melt) · Focus distance (m — how far the sharp zone reaches; a Hero shot frames everything far, so it wants a big value) · Hero softness · Softness (transition width). **Now a real TOD channel (2026-06-28)** — pull focus per-slot (e.g. a moody soft dawn, crisp noon/sunset). ⚠️ **DoF blur is suppressed in the overhead Browse shot by design** — it only shows in Hero / Street (gated on the camera looking *down*, not its height). *(Debug: `window.__dofDebug = 1` paints the zones green=sharp / red=blur. `RomanceDoF.jsx`, off `DownsamplePyramid.jsx`.)*
- **Grain** — film-grain scale.
- **Antialiasing (SMAA)** — on/off, baked to `scene.json` (default on). An SMAA post-pass at the ULTRA preset. ⚠️ **Near-invisible on desktop by design** — the desktop Canvas already runs 8× MSAA, so SMAA only cleans the *shader-contrast* edges MSAA can't (lit/unlit seams). Its real job is **mobile**, where MSAA is off (`antialias:!IS_MOBILE`) and SMAA is the *only* AA. Also exposed as a toggle in **Preview**'s layer matrix for A/B inspection. *(To witness it on desktop, temporarily disable MSAA so SMAA does all the AA — `Scene.jsx` `antialias`.)* The on/off is a mount/unmount; the `EffectComposer` is keyed so it reconciles on toggle (value-channels stream live, but an effect's *existence* needs the rebuild). `PostProcessing.jsx` / `PreviewPostFx.jsx`.

*(The **Cast shadows** knob — sun shadow-map quality — and **Occlusion** (AO) + **Shadow lift** moved to the **Light & Sky › Light & Shadow** group 2026-06-30; see above.)*

### Surfaces / Materials card

- **Per-layer / per-LU swatch** — pick any map layer or land-use class from the tabbed list (Streets, Blocks, Land Use, Paths, Land Cover, Furniture, Labels, Roofs, Lighting, Building, Neon, Trees, Park, Infra) and set its **Color** (hex swatch) and **Visible** (checkbox). Visibility here is also a bake lever (`BAKE.md §2`). *(Not TOD — a flat per-Look property.)*
- **3D material editor** (for the selected PBR material) — **Roughness**, **Metalness**, a **Texture** dropdown (none / brick variants / stone / stucco / wood / slate / metal) with **Texture Scale** + **Texture Strength** when a texture is chosen, and **Emissive** (colour swatch + intensity).
- **Building palette** — a 16-swatch colour grid that drives the per-building tint mix.
- **Lamp colour** — the **lamp swatch** here (`layerColors.lamp`) is the single source that tints both the lamp lantern and its ground light-pool (see Light Sources card).

### Light Sources card *(was "Lamps")*

The man-made emitters (TOD):
- **Lantern** (`lantern` = **Brightness + Glow**) — the lamp's own light source (lantern / glow orb / bulb), TOD-animatable, operator master × the automatic dusk→night turn-on. **Lantern Brightness also drives the ground light POOL** (the pool *is* the lantern's light on the ground — one slider for both; off by day).
- **Lamp Glow** (`lampGlow` = **Canopy**) — the under-lamp glow on tree foliage.
- **Arch uplights** (`archLight`) — the Gateway Arch's cross-aimed foot uplights: left/right **intensity · colour · cone° · reach**. Moved here from Hero & Horizon 2026-06-30 (a light source, not framing); placement stays on the non-TOD `arch` channel.

The pool is **baked into the ground** (contour-correct), so its *shape* is a bake-time knob (CLI / bake operations, below). **Lamp colour** is the Surfaces lamp swatch (above) — one source tints the lantern **and** the pool. ⚠️ **Open (Phase B):** the lamp is really **three** things — fixture (lantern + aura/Bloom) · ground pool (should be its own knob, not slaved to Lantern) · canopy — and Bloom + Neon should join this card (`scratch/LOOK-PANEL-TAXONOMY.md`).

### Hero & Horizon card

- **Arch placement** (non-TOD) — the Gateway Arch's **Distance**, **Scale**, **Rotation**, **Y-offset**, and **Foot-fade** (where the legs dissolve into the ground). *(The arch **uplights** moved to the Light Sources card 2026-06-30.)*
- **Horizon** (non-TOD) — the horizon disc: **Radius**, **Fade-inner**, **Fade-outer** (how the ground plane dissolves into the far sky).
- ⭐ **The Hero subject picker offers THIS town's own landmarks** *(2026-09-19)*. Survey ▸ Hero lists: the **Neighborhood Centroid** (always — the answer for any installation with no set-piece), the **Gateway Arch** only if this Look installed an `arch` channel, a **backdrop** only if this Look has a baked landscape, and **this installation's own listings**. ⛔ It used to list **Lafayette Square's 87 businesses in every town** — Square One Brewery, in Huron. ⚠️ **A town with no content of its own offers no landmarks**, which is correct: the centroid is the answer, never another town's building. *(A town whose listings exist but aren't reachable yet needs a manifest entry — `src/data/loadInstanceData.js`.)*

### Camera / Shots

- **Hero shot** — an authored camera **bounce**: the camera sweeps a Catmull-Rom path Start → (mids) → End → back, looking at the resolved hero subject. **Start/End are permanent anchors**; insert optional **Mid** keyframes (only mids are deletable). **FOV** is a per-keyframe channel; **Period** sets the bounce duration and an **Ease** toggle (sine / triangle) shapes the sweep. Replays identically in Stage / Preview / production via `heroAnim.js`.
  - ⭐ **EVERY TOWN HAS A HERO CAMERA** *(2026-09-21)*. A town with no landmark still gets a camera path — the resolver answers "no landmark" with the hood centroid.
  - ⭐ **THE FIRST KEYFRAME IS THE ENTRY POSE — on every town, since 2026-09-22.** Landing in Hero puts you at the path start you authored, with its FOV; the fit-the-radius scaffold covers only a town with no keyframes (the kit stores no camera until you save one).
  - ⛔ **A CAMERA CHANGE IS PUBLISHED BY A SCENE BAKE, NOT BY SAVING.** Stage authors keyframes into `design.json`; Preview and production fly `scene.heroKeyframes` out of the **baked slab**. Until `bake-scene` runs, Preview is flying the *old* path and nothing says so. ▶ `node cartograph/bake-scene.js --scene=<id> --look=<id>` (a full Bake does it for you).
  - **Authoring vs. runtime controls** *(2026-06-24; the gate corrected 2026-09-21)*. ⭐ **The orbit controls are free whenever playback is NOT running**, and handed to the flight while it is — the gate is **playing vs. not**, never shot vs. shot. That is the workflow: **fly to a pose first, memorise it second.** ⚠️ The lock still exists and still has a job — `makeDefault` controls write the camera every frame, so if they stayed enabled during a take they would own the camera and the flight would have nothing left to move. On handover back, the controls re-aim their target at the point the camera is actually looking at, so the first drag after a take does not snap. **Click a keyframe dot** (on the timeline) to **author** it: playback pauses, the camera **jumps** to that keyframe, and you orbit freely to reposition — the camera **stays locked on the subject** (the Hero Lock; you're choosing the vantage, not the aim). **Save keyframe** captures the new position + FOV, **re-locks**, and **stays paused on the saved frame** (so you can click the next dot and keep going); press **▶** to watch the motion, or **Cancel / Esc** to discard the orbit. In a gap with playback paused, **+ Add keyframe here** inserts one at the playhead and drops you straight into authoring it. *(Only `{position, fov}` is stored; the subject-aim is applied at runtime — so the look-direction you orbit through is a framing aid, not saved.)*
- **Browse camera** — the overhead default: **Center X / Center Z** (the look-at point; numeric inputs, click-to-edit or drag-to-scrub), **Altitude**, **FOV**, and **Heading** (screen orientation — the one fully-baked camera channel today). ⛔⛔ **THE FRAME IS NOT REMEMBERED, AND AN ATTEMPT TO FIX THAT IS IN THE TREE UNPROVEN (2026-09-09).** Browse's pose is *derived* every time you enter it — handed off from the Designer's live pan/zoom, else fitted to the whole neighbourhood — so **a series of screenshots cannot be made to line up**, and any entry the hand-off does not cover silently gives you the whole-neighbourhood overview with no error. ⚠️ A `browseFrame` design field + the wiring is in the tree: **it DOES record** (the frame lands in `design.json`), but it **does not apply on the Designer → "Stage →" → Browse path**, which is the only path that matters here — the hand-off outranks it by design. Do not rely on it and do not cite it as shipped — `STAGE.md §5.1`.
- **Street camera** — the eye-level shot: **Eye height** and **FOV**.
- **⭐ An embedding page can ASK for a shot by name — `?shot=hero|browse|street` (2026-08-29).** Framed only, and it picks the *starting* shot; everything it frames with is the shot you authored right here. So a marketing page that wants an overhead of the whole neighbourhood frames `?layer=slab&shot=browse`, and **re-framing Browse on this card moves that page** — no edit on the other side. ⛔ **This is why the page may not carry a centre and a zoom of its own:** a framing baked into a site is *this* town's framing, inherited by every town after it, and it forks the thing it embeds. The page sends a name; the slab supplies the geometry. ⛔ An unknown name is **loud in the console** and shows the hero shot — it never silently pretends to be the framing you authored.
- **Stage drag semantics** — Browse is a plan view: drag = pan, wheel = zoom, no orbit. Hero/Street: drag = orbit · **⌥-drag = grab the ground** (the spot under the pen stays under the pen, like dragging a map; height and look direction held) · **⌃/⌘-drag = pan** (right-drag pans too) · middle-drag = dolly · wheel = zoom, so a stylus can make all three moves. **Hero is the exception: its controls are handed to the flight while playback runs, and free the rest of the time** (above). Designer's "Stage →" lands on whichever Stage shot you were last in (`lastStageShot`), so bouncing between Designer and Stage returns you to the same place each time.

### Paths ▸ Shape

- **Alley end-cap dial** — a 3-segment toggle controlling how **all** alleys in the active Look terminate: `square` (flush) / `rounded` (rounded-rectangle pad) / `round` (true semicircle). Stored as `design.alleyCap`. Other path kinds use per-kind defaults and carry no operator surface.

### Terrain ▸ vertical exaggeration

- ⭐ **`terrainExag` — how tall this town's hills are drawn, per town, authored.** Stored as
  `design.terrainExag`; baked into the slab's `scene.json`; the render lerps toward it for the Hero
  shot (Browse draws flat at 0, Street/Planetarium at 1, so this dial is the **Hero ceiling**).
- ⛔ **The kit default is 1 — the neutral value, meaning "draw the ground at the height it is."**
  A town nobody has authored gets the truth, not another town's drama. **Lafayette Square authors
  1.5** and that is LS's data, not a kit constant.
- ⚠️ **Why it exists:** it was one hardcoded `V_EXAG = 1.5` for every town, chosen by looking at
  LS. Relief across the disc, measured 2026-09-20: **LS 35.2 m · HPDM 43.1 m · altadena 1,480.3 m.**
  One multiplier cannot serve a river bluff, a lake plain and the San Gabriels.
- ▶ Read a town's value: `node -e "console.log(require('./public/looks/<look>/design.json').terrainExag ?? 1)"`
- ⛔ **Re-bake the ground after changing it.** The adaptive refinement subdivides where the
  heightfield *bends*, and how much it bends is a function of the exaggeration — so an unbaked
  change leaves the mesh tessellated for the old value (over-dense, or faceted on the hills).
- ⚠️ **No slider yet** — it is authored by editing `design.json`. A Stage control is unbuilt.

### Bake — committing the look to the slab

- **Bake buttons** — Designer's **"Stage →"** = navigate to your last Stage shot immediately, bake async in the background (the slab refreshes when done). Stage's **"↻"** = bake in place, stay put. Both accept **⌥-click to force a full rebuild** (bypass the dirty-check). A small orange dot lights when authoring edits exist since the last bake (indicator only — never disables the action).
- **Tree anchors are part of the pour (2026-08-28; ordered correctly 2026-09-08)** — `tree-anchors` runs **after the tree bake** and re-seats every trunk on the *drawn* ground (otherwise the smooth field, ~1.9 m of float). ⛔ **All-or-nothing:** one wrong `placementKey` discards *every* anchor for that look, silently but for a console line. Trees hovering or sunk after a re-pour ⇒ re-run this, not the tree bake: `node cartograph/bake-tree-anchors.js --look=<id> --scene=<id>`. ▶ `node checks/claims-anchors-follow-the-placements.mjs` — RED today: only LS has an anchor file at all.
- **The pour transcodes the impostor pages, LAST (since 2026-08-29)** — after the placements step, `pack-impostor-ktx2.mjs` encodes every hero + overhead page to KTX2/ETC1S and repoints `trees-atlas.json`. ⛔ **It has to be last and it is not optional:** the atlas step rewrites the manifest from source and hands back `.png`, so a pour that skipped this would silently ship ~4× the impostor VRAM (LS: 282 MB → 1,121 MB) and look exactly like a clean bake, because PNG pages render perfectly on the desktop doing the baking. A pack failure therefore **fails the whole pour** rather than returning a green slab nobody can tell is heavy — `basisu` is a hard requirement (`brew install basis_universal`). ⛔ **The pages must SHIP, and how that is enforced INVERTED on 2026-09-01.** This used to read *"do not gitignore the .ktx2 pages — the deploy is an actions/checkout, so an ignored page is a 404 in the canopy."* The whole baked tree is gitignored now and the pages ship from R2, so tracking has nothing to do with whether the canopy gets them. **The requirement is unchanged; the enforcement moved** — ▶ `node scripts/verify-baked-in-r2.mjs` reads the bucket and names any page that is absent. ▶ `node scratch/claims-every-declared-page-ships.mjs`
- **The pour writes this town's public credits** — a `sources` step reads which inputs are actually on the scene's disk and bakes `public/baked/<look>/sources.json`, which is what the visitor's panel-footer credit and the info panel's **Sources** section render. ⭐ **Nothing to operate on a good day, and the one thing to read on a bad one: it prints what is still OWED.** An input that reached the render under terms the kit cannot state is listed there and is *not* credited — you close that by reading the licence **at the source** and recording it in `cartograph/intake-rows.mjs`'s `licence`. ⛔ **Never fill one in from memory or a search result** — the entry for Microsoft's footprints said ODbL for over a month and the dataset's own `LICENSE` says CDLA Permissive 2.0. ▶ `node cartograph/bake-sources.js --look=<id> --scene=<id>`
- ⛔⛔ **THE POUR'S LAST STEP IS AN UPLOAD, AND IT CAN FAIL THE BAKE (2026-09-01).** `public/baked/` is
  gitignored and served from R2, so **the upload — not a commit — is what carries a pour to a visitor.**
  `scripts/upload-baked-to-r2.mjs` runs at the end of the bake and a failure **fails the whole bake (500)**
  rather than returning a green slab that reached nobody. ⚠️ **And the pour is then live EVERYWHERE
  immediately** — one bucket serves staging and prod at the same URLs, so a re-pour reaches
  lafayette-square.com without a push. That is the settled model (`PREVIEW.md §0.2`: staging is redundant
  for slab-data — **Preview is the gate**), but it is new in mechanism. ▶ `node scripts/verify-baked-in-r2.mjs`
- ### ⭐ **PAINT ORDER IS A BAKE-TIME FLATTEN, NOT A RENDER CONCERN** *(2026-09-21)*
  The Designer is a **2D paint stack** — layers overlap and the order decides what you see, and that
  is correct there; the overlap *is* authoring. **The bake is the 2D→3D crossing, and it is the last
  moment flatness exists**, so it is spent there: the bake walks the paint order top-down, clips
  every layer against the union of everything above it, and emits only what is actually visible.
  - ⇒ **The painted ground becomes one partition on one plane**, so there is no millimetre ladder
    left to tune and nothing to lose to the terrain-chord error that made every such separation
    unwinnable (`ARCHITECTURE.md §8` ZEROTH RULE). The slab is now the Designer's stack **resolved**,
    rather than a separately-edited model — which is why the two agree again.
  - ⭐ **What this changes for you: toggling a layer off is now subtractive at bake.** A hidden layer
    is not flattened in, so **the layers beneath it become visible on the next re-bake** — you are
    painting, not just hiding. ⛔ It takes a **re-bake**; the toggle alone does not move the slab.
  - ⚠️ **Two layers are held out, each for a measured reason.** `water` keeps its own slot **and does
    not cut** — it *tints* rather than replaces, so the ground beneath it must survive to be seen
    through. `stripe` **cuts but keeps its slot**: cutting halved its overlap with asphalt (386 →
    194 m², 10 cm cells in a 500 m window) and did **not** finish it. ⛔ **Cause of that 194 m²
    residual is NOT ESTABLISHED** — the slot is a guard against an unexplained residual, not a
    design choice, and it goes away the day the residual measures zero, not on the grounds that it
    should be zero.
  - ▶ `node checks/claims-coplanar-groups-do-not-overlap.mjs` — asserts both directions: groups
    sharing a Y must not overlap, **and** a group alone on its slot must overlap something (without
    the second half, the broken state — every group on its own slot — passes trivially). ⚠️ Three
    towns (altadena, hipointe-demun, lafayette-square-staging) **cannot re-bake** and still warn:
    they carry no frozen protopolygon because they have not been poured since ① landed. That is a
    **re-pour**, and it is the operator's call.
- **Ground-contact effects** (baked; tune via the bake constants in **CLI / bake operations** below): the **lamp light pools**, the **dark contact rings** under trees + lamps (visible in daylight), and the **tree trunk-base ground blend** (the lowest of each trunk takes on the ground colour beneath it). All three bake into ground textures + sample in the ground/tree shaders — **re-bake to see them**, hard-refresh to pick up the slab.

## Preview — the publish-confidence gate

GPU profiler · device frame · layer-toggle matrix · TOD scrub. Walks the *shipping* render with a profiler strapped on. **The layer-toggle matrix is *ephemeral inspection* ("what am I measuring") — never persisted as policy; "all-on" equals production.** Separately, the operator authors **deployment policy** here: the per-platform channel-listing (desktop vs. mobile inclusion), the one thing Preview writes. Keystone Reference: **`PREVIEW.md`** (the model — what it inspects + how to read the numbers). *(In flight — the virtual-device emulator + device-budget gauges + thermal/memory/transition readouts: `HANDOFF-preview-measurement.md`.)*

### Publish — where the buttons actually push

- **"Publish to Staging"** pushes your working branch to whichever branch `.github/workflows/staging.yml` deploys from. ⛔ It was pinned to a branch nothing had deployed since 2026-08-02, so the button ran, reported success, and staging never moved — a silent no-op at the gate. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` derives both halves from source and fails if they part company again. **Never take the branch from memory or from this page — the check is the answer.**
- ⚠️ **"Promote to Prod" is not a slab publish — it ships the whole branch.** It fast-forwards `main` to your working HEAD, so every commit you are carrying goes to production, not just the baked look. That is a *release*, and it deserves its own moment rather than being reached for while re-pouring.
- **One line per target, and the button carries the state (2026-08-29).** Each button reads **"Publish to Staging"** or, once that site is serving your latest, **"Published to Staging"** — past-tense and inert, because there is nothing left to press. **Visit → sits beside it** and is a property of the look, not of a push you happened to watch. ⛔ **AND THE ADDRESS IS DERIVED FROM THE LOOK YOU SHIPPED (2026-09-21).** It used to be two module constants, so pressing Publish on huron reported `…/lafayette-square-staging/` and `lafayette-square.com` — a truthful "published ✓" handing you another town's address. Now: **staging** is the shared site with your look named on it (`?look=<id>`, verified in a browser to render that town from its own slab) and is marked `*` to say the site's NAME is not yours yet; **production** is the town's own authored `domain` (`src/instances/<map>.js`), and a town that declares none — huron says `domain: null`, "no deploy target yet" — shows **"no address"** with the reason on hover, never a substitute. ▶ `node checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs`. ⭐ **AND THE BUTTON GOES PAST-TENSE ON BOTH ARTIFACTS, NOT ONE (2026-09-21).** A staging publish ships the **slab** *and* the shared **player**, so "Published to Staging" now requires both to be current: the live `scene.json#bakedAt` for the slab, and a build marker at `staging/player/build.json` — the newest source mtime that build came from — for the player. ⛔ **No marker counts as STALE**; an unstamped player is not a current one. ⚠️ It used to require `ahead === 0` against the old staging branch, which stopped being pushed the same day, so the button could never reach its done state however many times it worked (Jacob: *"it's hard to tell"*). ▶ `node checks/claims-the-publish-button-can-say-it-is-done.mjs`. ⚠️ **ONE SHARED STAGING SITE IS TODAY'S STATE, NOT THE DESIGN.** This line used to read *"every town has its own staging site"*, which was never built; it is now **ruled** (2026-09-21, Jacob: one site per Map — the Publish button is the unit) and boarded as `ROADMAP` H-18 ①/④. ⛔ **The state is READ, never remembered:** every mount fetches what each site actually serves (`scene.json#bakedAt`) and compares it to yours. That survives a refresh — the row used to be written only by a button press, so a hard-refresh made it and the Visit link vanish while the deploy was live and fine — and it measures **the artifact being served**, so it stays right when a deploy fails silently, which no commit count does.
- ⛔ **No branch name and no commit counts on this panel** — *"the user shouldn't know about the git"* (Jacob). The git comparison still runs, but only to *gate* Promote when there is nothing to promote; the moment one of those numbers reaches the operator's eye the panel is leaking again.

Unlike Stage, **Preview authors almost nothing** — its knobs set up an *inspection*, not a look. The one thing it will write is deployment policy (below). What persists is the inspection *state* (which device, which layers shown), in `localStorage`, so a reload returns you to the same vantage.

### Device / environment selector — Desktop · Phone-hi · Phone-lo

The top-bar device picker switches the render environment *and* the budget the gauges read against — the cost is benchmarked to **two real reference phones**, not the operator's desktop. Exclusive toggle; persists to `localStorage` (`preview.mode.v1`). Phone modes also draw the canvas inside the phone bezel (below).
- **`phone-hi` = iPhone 16 Pro Max** — Apple A18 Pro (6-core GPU), 8 GB RAM, 6.9″ 2868×1320 (~460 ppi). The best-case ceiling (and the device the PhoneFrame bezel is modeled on).
- **`phone-lo` = Samsung Galaxy A54/A55** — the floor we *guarantee*. Anchored to the weaker A54 (Exynos 1380, Mali-G68 MP5, 8 GB, 6.4″ 2340×1080); the A55 (Exynos 1480, RDNA-based Xclipse 530) is the stronger sibling, so an A54-clean slab covers it.
- **`desktop`** — a 60fps target with a generous-but-present draw/tri ceiling (trips only on a pathological scene / weak laptop GPU).
- **All budgets live in one place: `src/preview/deviceProfiles.js`** — edit the numbers there. ⚠️ Today the device *identities* are set but the per-tier budget *numbers* are **interim** (placeholder) until the Phase-3 virtual-device measurement locks them — don't trust a "ships" verdict for a publish call until they're measured.

### Shot picker — Hero · Browse · Street

Top-bar buttons that move the camera between the three production shots, **gated by production's adjacency graph** (Hero ↔ Browse ↔ Street; there is no direct Hero↔Street edge, so that button greys out from Hero). The **Hero** shot is the same authored bounce, replayed identically here (`heroAnim.js`). Camera drag in each shot mirrors Stage (Browse: LEFT = pan, RIGHT = orbit; Hero/Street: LEFT = orbit, RIGHT = pan); a deliberate drag during the Hero auto-pan interrupts it back to Browse, exactly as production does. Ephemeral.

> **Building x-ray is automatic — there is no toggle to find.** When the camera moves *inside* a building, that building dissolves so you get a clean shot through it instead of a hollow cross-section; roofs you pass over stay solid. It's artifact suppression, not a look channel, so it's wired on with no knob (the old see-through button was removed 2026-06-28). The feel values (dissolve distance 12 m / fade band 9 m) are dev-tunable via `window.__bldgXray(dist, band)`; if they ever need authoring we'll promote them to a real knob. *(As-built: `ARCHITECTURE.md` "Building x-ray.")*

### Time-of-day scrub

The shared **DawnTimeline** — scrub dawn → day → dusk → night to inspect the Look across the day (the same control Stage uses). Ephemeral.

### The layer-toggle matrix — *what am I measuring*

The right panel lists every render layer with a per-layer cost bar; each checkbox gates that layer's `.visible` (never the mount), so **"all on" is the literal shipping cost** (`PREVIEW.md §3`). Toggling a layer off attributes its measured Δ. Inspection state persists to `localStorage` (`preview.layers.v3`) — but this is *measurement* setup, **not** the deployment manifest (those are separate; see below).
- **Scene layers** — Ground (carries the baked lamp-pools / contact-shadows / trunk-blend), Buildings (the slab merged mesh), Trees, Park, Streetlamps, Gateway Arch, Neon, Sky+Sun, Clouds, Atmospheric Fog.
- **Post-FX layers** — N8AO, Bloom, Halo (aerial perspective), Film Grade, Film Grain, SMAA, **DoF** *(WIP)*.
- **Two deliberate default divergences from production** (`DEFAULT_LAYERS`): **Neon is forced all-on** (worst-case profiling, vs. production's TOD-gated neon), and **Bloom defaults off** (only so a reload doesn't burn into a black scene — not because it's broken). Flip them on for true parity.

### Reading the gauges

- **GPU panel** — the numeric tab: a **scene-vs-budget verdict** (one chip per device, green/amber/red against that device's budget), live **frame ms · fps**, **draws / tris** vs. budget, resident **geos / tex / progs**, and a rolling **spike log** (each spike tagged with the gesture that caused it). **Milliseconds are the budget** — draws/tris are context, frame-time is what users feel (`PREVIEW.md §4`).
- **Strip chart** (phone mode) — a rolling work-ratio equalizer against the device budget line, with cluster detection (≥3 events bunched → "stagger" hint) and a hover caret (when stopped) for per-frame detail.
- **Recording mode** (phone mode) — **event** (a trigger arms a ~5 s capture window) vs. **ambient** (a continuous rolling window, triggers disabled). Persists to `localStorage` (`preview.recMode.v1`).
- ⚠️ **Three caveats** when reading per-layer cost (`PREVIEW.md §4`): it's *render* cost, not VRAM; deltas **don't sum** (shared overdraw) — trust the all-on total; neon is forced-on.

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
- **Soft-reload (↻)** — remounts the canvas and re-fetches the baked artifacts (and busts the tree-atlas cache) — the escape hatch when a re-bake didn't show. *(If a Look looks right in Stage but wrong here, it's the bake that didn't propagate — re-bake / soft-reload — never a Preview bug.)*
- ⛔⛔ **AN EYE-GATE TAKEN IN PREVIEW IS TRUSTWORTHY AS OF 2026-09-20 — AND WAS NOT BEFORE.** Preview mounted its nine baked consumers with **no cache-bust token**, so the browser's HTTP cache served the *previous* bake at an unchanging URL. A re-bake was made, the operator looked, reported "unchanged", and the A/B was read backwards — ⭐ **a stale viewer is worse than no viewer, because it makes the operator confidently wrong, and the operator's eye is the gate we trust most.** Now threaded from `scene.bakedAt`, which changes exactly when a bake happens. ⚠️ **The same bug was in production** (a visitor's browser served the previous bake after a deploy) and is fixed the same way. ⚠️ **Treat any Preview verdict recorded before this date as possibly taken on a stale slab.** ▶ `node checks/claims-baked-consumers-get-a-cache-bust.mjs`
- **Trigger bar** (phone mode) — shot-jump + reload buttons that fire a recording span, so a spike is attributable to a specific gesture.

### The pyramid tuner — *in flight* ⏳

Per-device sliders (**Levels · Resolution · Radius**) that tune the **shared downsample pyramid** feeding Bloom + DoF — `Resolution` is the looks↔cost dial (finer mips cost perf). Persists per-environment to `localStorage` (`preview.renderTiers.v1`). ⚠️ **This is part of the in-flight measurement-regime / shared-pyramid arc, not settled doctrine** — the pyramid being shared + re-bracketable per device tier is still being worked out (`HANDOFF-preview-measurement.md`, `[[preview-equals-pyramid-tier-ladder]]`). Document/operate it as provisional; the channel set and where it lives may still move.

### Deployment policy — the one thing Preview writes *(planned)*

The per-platform **inclusion manifest** — *which channels ship to desktop vs. mobile* — is a **cost-driven deployment decision**, so it's authored here at the gate, beside the instrument that responds (`PREVIEW.md §0.2`). ⚠️ **Not yet built** — the editorial surface lands with the v0.2 measurement regime (`HANDOFF-preview-measurement.md`, Phase 3–4). Until then Preview writes nothing; its product is the operator's *verdict* ("ship the slab" / "back to Stage").

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

**Measured on huron:** 71.2 MB archived, **10.2 MB shipped** (median 146 KB, max 598 KB). The worst
case was a 5456×3336 8.5 MB original → 1600×978 at 221 KB. ⚠️ Lafayette Square is the warning: 884 MB
across 297 files with no archive/web distinction at all, and it ships every byte.

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
(`ovt-<GERS>` / `osm-<id>`) to its `…-lst-NNNN` on the first bake; a new business appends, a closed
one's number is never reused, and every listing ships its `source_key`. ⛔ Commit the registry and never
hand-edit it. The bake refuses an authored `id` that would renumber a business the registry numbered.

⭐ **What a visitor sees is three layers:** this file < the Apps Script sheet < the layer operations
publishes (`<ASSET_BASE>live/<look>/listings.json`). A correction made in operations wins over both.
▶ `node checks/claims-a-listing-keeps-its-id.mjs`.

---

## The town calendar — `content/events.json` *(the knob: authored, no UI)*

A town's own happenings — a festival, a fireworks night, a farmers market — live in
`cartograph/data/<scene>/content/events.json`, beside `listings.json`. **Fully authored; there is no
intake and no panel.** Edit the file, re-bake the scene, reload.

⭐ **An event with dates and NO times runs all day, every day, across the range.** That is the point:
it carries the ticker at 3am, when every business in town is shut. Supplying `start_time` *and*
`end_time` makes it clock-dependent again, so omit both unless you mean it.

**The one distinction that matters — what the event is ABOUT, not where it points:**

| | key | behaviour |
|---|---|---|
| `listing_id` set | the listing | the event is **about that place** and **replaces** its open-now ticker entry |
| `listing_id` absent | its own `id` | a **town event**; stands beside the places rather than displacing one |

⛔ **A town event needs a unique `id`** — the bake refuses the scene without one, because every
listing-less event would otherwise collide on a single key and they would overwrite each other.

⭐ **`links_to` is where the event SENDS you** — the sponsor, the venue, whoever you chose. Optional,
authored per event, and never the key: two festivals sponsored by one marina are still two festivals.

⛔ **Every `listing_id`/`links_to` must resolve to a listing in that scene or the bake refuses.**
A listing id is permanent, but a listing can still leave the base; a dead reference
would be a ticker headline that clicks through to nothing.

▶ The file carries its own `_schema` and `_example`. Any `_`-prefixed key is provenance and never
ships. ▶ `node cartograph/bake-content.js --scene=<id>` prints the count, and
`node checks/claims-a-town-event-is-not-clock-dependent.mjs` guards the all-day rule.

---

## CLI / bake operations

- The two-step build: `node skeleton.js` → `node pipeline.js` → `node promote-ribbons.js` → `node bake-ground.js` (the pipeline does **not** re-run the extractor — `[[feedback_skeleton_pipeline_two_step]]`).
- The bake is incremental (dirty-skipped); `?force=1` on the URL (or ⌥-click a bake button) forces a full rebuild.
- **A Bake asks before it re-pours because the pour's CODE changed.** The pour's code inputs are its import closure (`pipeline.js` and everything it imports, the ① mint included). The research registry counts only by content: a value that town's last pour actually read (recorded in its `map.json`) has changed. A new ruling or question prompts nobody. When any of these has changed, the Bake stops and lists them ("This Bake will re-pour <town>"), and runs only on **Re-pour and bake**. An authoring edit re-pours without asking, as before. ▶ `node checks/claims-the-bake-watches-its-code.mjs`
- ### ⛔ **NAME THE TOWN. An unflagged write no longer runs at all.**
  Every script in `cartograph/` that writes an artifact refuses to start until you have named the
  scene. It used to default to `lafayette-square` — so forgetting the flag silently rebuilt LS over
  whatever you thought you were building, which cost a full day on 2026-07-31 and read the whole
  time as "the fix isn't working" rather than "the wrong town is being built."
  - **Two spellings, ONE resolver.** `--scene=<id>` on the command, or `CARTOGRAPH_SCENE=<id>` in
    the environment. Both are read in exactly one place (`cartograph/scene.js`), so they cannot
    disagree — which they did until 2026-09-19, when eight of ten bakers parsed the flag themselves
    and ignored the variable, and an env-named bake quietly rebuilt LS while passing every guard.
    ⛔ Note the `=`: `--scene toy` is not the flag, and you will get the refusal, not a guess.
  - **You will not get a wrong map, you will get an exit.** A writer with no scene prints what it
    refused and why, and exits 2. That is the whole design: an unnamed scene is a question, and the
    kit's rule is that a question is never answered with a plausible-looking default.
  - **Some writers legitimately have no scene to name** — one that is look-keyed, or writes a
    single fixed path. Each says so in its own source, with a reason, and
    `node checks/claims-writers-name-the-scene.mjs` prints every one of them and fails on any
    writer that neither guards nor explains itself. ⛔ Don't keep a list here — run the check; add
    a bake step and it is classified on the next run, with no list to update.
  - ⚠️ Naming the scene is **not** the same as naming the look. `--look=` picks the slab you write
    into, and a mismatched pair is a separate refusal (`cartograph/bake-target.js`).
- **Ground tri-budget — the `GROUND_REFINE` knob** (`bake-ground.js`, the GPU/mobile lever). The flat ground is lifted per-vertex by the terrain at runtime, so it must be subdivided enough to follow the relief. `GROUND_REFINE = "adaptive"` (default) subdivides **only where the terrain bends** — `GROUND_REFINE_TOL_M` (default **0.50 m**) is the max terrain-deviation a coarse triangle may keep before it's split. Lower `tol` = finer mesh + more tris; higher = coarser + fewer. The triangle count per group is in the look's `ground.json` (`groundShape`); `node checks/claims-ground-refinement-does-not-breed-slivers.mjs` bounds it. The split is **longest-edge bisection, conforming across every ground group at once** — crack-free between land use, sidewalk, curb and asphalt, not just within one polygon (2026-09-23). ⚠️ That costs triangles where ribbons take their neighbours' splits, and bake time on a big town; the bake prints both, and refuses to write if a crack survives. CLI overrides (gated on argv, never `process.env`): `--refine=uniform` restores the legacy byte-identical mesh; `--refine-tol=`/`--refine-min-edge=`/`--refine-max-edge=` retune. ⚠️ It calibrates to the town's authored `terrainExag` (above); if you change that, re-bake and re-check the slopes. ⚠️ **After any CLI `bake-ground.js`, run `bake-ground-ao.js` too** — but ⛔ **the failure mode changed 2026-09-20 and it is no longer silent.** It used to rewrite `ground.json` *without* the AO `lightmap` block, so a standalone ground bake shipped flat-lit and nothing said so — **five of seven baked towns had an AO PNG on disk that no manifest pointed at.** Now the ground bake **carries any existing `lightmap` block forward** and stamps a `groundKey`; the AO pass stamps the key it baked against; and the renderer **refuses a mismatched lightmap, naming the re-bake command.** ⚠️ The old staleness gate could not have caught it — the AO pass writes the manifest *before* the PNG, so "ground.json newer than the PNG" meant both "AO is current" and "a ground re-bake just destroyed it"; **an mtime cannot separate those.** ▶ `node checks/claims-the-ao-belongs-to-its-ground.mjs` The full diagnosis + per-material numbers live in `cartograph/_archive/handoffs/HANDOFF-ground-tri-cut-LANDED-2026-06-22.md`.
- **Ground-contact effect knobs (2026-06-22) — where they live, for later tuning / panel promotion.** `bake-ground-ao.js` emits three ground textures and carries the *bake-time* shape constants (edit + re-bake to retune): **lamp pool** — `POOL_RADIUS_M` / `POOL_RING_POS` / `POOL_RING_SHARP` (lower = blurrier ring) / `POOL_SHADOW_FRAC`; **contact shadow** (tree + lamp bases) — `TREE_SHADOW_RADIUS_M` / `TREE_SHADOW_STR`, `LAMP_SHADOW_RADIUS_M` / `LAMP_SHADOW_STR`. The *live* (shader) knobs: **trunk-base ground blend** — `uTrunkBlend` (strength) / `uTrunkBlendTop` (metres up the trunk) in `treeAtlasMaterial.js` (`injectFoliageSway`); **contact-shadow strength** — `uShadowStr` (0.5) in `grassMaterial.js` + `BakedGround` FadeMesh; **pool warm colour** — `vec3(0.80,0.62,0.32)` in both ground shaders. Pool *intensity* + arch *uplight* values are live TOD channels (Lamps / Arch Lighting cards). ⚠️ These are bake-time today — a future arc promotes pool diameter/blur to panel controls (overlap build-up forces baking the shape; see `HANDOFF-channel-variant-cascade.md` neighbours).
- ### ⭐ **A TOWN WHOSE OSM POIs ARE THIN — the external listings base** *(2026-09-20)*
  The listings base is normally derived from OSM POIs, which is excellent where OSM is richly
  mapped and thin where it is not — and a town does not tell you which it is until you have poured
  it. When the OSM base comes back too thin, switch the base rather than hand-authoring a town:
  1. **Acquire** — `node cartograph/fetch-overture-places.js --scene=<id>`. Reads the bbox out of
     the town's own `geography.json`, so there is nothing to configure per town. No credentials, no
     native dependencies, and it pulls only the parquet row groups that intersect the town — not
     the theme. Writes `data/<scene>/raw/overture-places.json`.
  2. **Declare** — put `{ "meta": { "baseSource": "overture" } }` in
     `data/<scene>/content/listings.overrides.json`. ⛔ **The declaration lives in the DATA, never
     in the code** — that is what protects the next town without anyone editing `bake-content.js`.
  3. **Bake** — `node cartograph/bake-content.js --scene=<id>` as usual. The bake prints which
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
- Server edits (`cartograph/serve.js`) require a `carto` restart — the browser + bake scripts auto-pick-up, but the long-lived server does not (`ARCHITECTURE.md`).
- ### ⭐ **THE ASSESSOR BUTTON — giving a town its addresses** *(2026-09-20)*
  A town's **address spine** is what the property atlas is built on: the Society Pages list bare
  buildings **by address**, so a town without one opens nearly empty no matter how good its geometry
  is. OSM `addr:*` carries it in much of the world; in the US the assessor is the well, and it also
  carries what OSM never does — **valuation, zoning, year built, units**.
  1. **Declare the well** — `data/<scene>/sources.json`. It names the endpoint, maps their column
     names onto ours, and — the part that matters — lists the fields the well **does not have**.
     The shape and a worked example are in `cartograph/sources.js`.
  2. **Fetch** — the Extent's **Fetch this view** now runs it for any town with a declaration, and
     reports *undeclared* when there is none. By hand: `CARTOGRAPH_SCENE=<id> node cartograph/fetch-parcels.mjs`
     (`--dry-run` first: it prints the parcel count and one sample row without writing).
  3. **Bake** — `node cartograph/bake-content.js --scene=<id>`. It reports the match rate and, now,
     how much of the town it could **not** classify or address.
  - ⛔ **"No parcels" has THREE meanings and the kit keeps them apart.** *Undeclared* (no
    `sources.json`) means **nobody has looked into it** and shouts; *declared-none* is an honest zero
    with a written reason; *declared* is a real well. ⛔ A town that yields zero because nobody
    searched must never print the same as a town that genuinely has no assessor.
  - ⛔ **A WELL IS USUALLY PARTIAL, AND YOU MUST SAY SO.** Huron's (Ohio's statewide layer) gives
    address and land use and **no valuation, zoning, year built or units** — those live behind a
    per-parcel county lookup that is not an endpoint. Listing them as `absent` makes the roster emit
    **null instead of zero**, so nobody downstream reads "we never had this" as "this is worth $0".
  - ⛔ **A DEAD JOIN NOW FAILS THE BAKE.** Parcels loaded and not one building inside any of them is
    a frame disagreement, not a sparse town — it refuses rather than baking a roster whose every
    address is null. Fix it with `CARTOGRAPH_SCENE=<id> node cartograph/reproject-raw.js`.
  - ⭐ **What you should see:** huron went from *"missing stl_parcels.json — skipping"* and **0 of
    3,678** buildings matched, to **3,576 (97%)**, and from ~98% of the town having no address to
    **3%**. Nothing about huron is in the code; the whole difference is one declaration.
- ### ⭐ **THE WORK QUEUE — which buildings to fill first, and how far down to go** *(2026-09-20)*
  Content hand-work is the one genuinely **unbounded** cost in a town: you cannot do 3,678 buildings
  and there is no honest way to pick 60. The bake now ranks every building from the free signals, so
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
`if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')`. Every copy looked like a
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
other town has been poured since ① landed — so a family of these cannot measure anything elsewhere
however portable they become. Portability ahead of the pour buys capacity nothing can use.

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

⭐ **Why it matters:** `public/baked/` is gitignored, so a fresh clone has no slab. A check that
*crashes* on the missing file is indistinguishable from one that found a defect — it reports ENOENT,
the run goes red, and nobody can tell which. Crashing turns *"I could not look"* into *"I looked and
it was broken."* The summary line now states green / red / **not checked** / blocked / timed out, so
the number that actually matters in CI — **how much did it verify** — is visible every run.

⚠️ **`npm test` in CI is a HOLD, not a gate** — but ⛔ **not for the reason first written here.** That
note claimed a fresh clone scores 36/126 because the slab is gitignored. **The measurement was
wrong:** the clone had never run `npm ci`, so most checks died on a missing `clipper-lib`, not on
missing data. Re-measured with dependencies installed, the gap is about **2 checks, not 47** — CI is
not data-starved. The step is held open because the board carries **~36 genuine red findings that
fail everywhere**, and blocking on those is a scheduling decision, not a CI one.
▶ Re-derive both, never quote them: `npm test` · `T=$(mktemp -d); git clone --depth 1 file://$PWD $T/c; cd $T/c; npm ci; npm test`

## Save → ship — the lifecycle, the git tree, and the troubleshooting door

> **The door + the knobs for "the tree is dirty / how do I save / why is staging stale / it works here but not there."** Written so a future troubleshoot is a *lookup*, not a forensic. The bake *mechanism* is `BAKE.md`; the slab *byte format* is `SLAB-CONTRACT.md`; this is the **operator's** view of save-and-ship. Grounded against `serve.js`, the workflows, and `.gitignore` (verified 2026-06-17).

### Source vs. derived — the one distinction that ends the confusion

Everything in the tree is **one of two things.** Knowing which ends most "is this dirty diff real?" questions on sight.

| | **SOURCE** (you author it — intent) | **DERIVED** (the machine bakes it — a shadow of source) |
|---|---|---|
| **Files** | `public/looks/<id>/design.json` (the SHAPE + Look SSoT — Survey widths/corners + Stage materials/sky) · `clean/overlay.json` (Survey edits) · the raw set (`raw/osm.json`, `survey.json`, `elevation.json`, `measurements.json`) · `neighborhood_boundary.json` | `clean/map.json` · `src/data/ribbons.json` · `public/baked/<id>/shape.json` · `ground.json`+`ground.bin`+`ground.lightmap.png` · `scene.json` · `public/baked/<scene>/trees.json` (trees) · `public/looks/index.json` |
| **Who writes it** | the operator, via the tools (autosave) | the bake (`/looks/:id/bake`, see `BAKE.md §2`) |
| **If you lose it** | gone — it's intent, not regenerable | regenerate it: re-bake from source |
| **Edit it by hand?** | yes — that's authoring (or a curated datum fix, `SURVEY.md`) | **never** — edit the source, re-bake |

**The rule:** to *change* the map, edit **source** and re-bake. A hand-edit to a **derived** file is a shadow-edit — it comes back wrong on the next bake (the same lesson as `RIBBONS §1` / `ORIENTATION` "fix the centerline, not the shadow").

### Why the tree goes dirty — noise vs. real

The geometry bakes are **deterministic**: same source in → byte-identical `ground.bin` / `ribbons.json` / `map.json` / `shape.json` out (everything routes through `writeIfChanged`, `io.js`). So a derived-file diff is one of exactly two things:

- **NOISE — discard it.** Three files carry a `Date.now()` stamp that changes on *every* bake even when nothing semantic moved: `scene.json` (`bakedAt`, `bake-scene.js`), `public/looks/index.json` (`updatedAt`/`bakedAt`, `serve.js`), `public/baked/<scene>/trees.json` (`generatedAt`). A diff that touches **only** those timestamp lines = a no-op re-bake. Throw it away.
- **REAL — decide it.** A diff in the *geometry* of `ground.bin` / `ribbons.json` / `map.json` / `shape.json` means the source genuinely changed (a width edit, a corner, a new survey value). Keep it only if you meant the edit.

> **Fast triage:** `git diff --stat` — if the only changes are `scene.json` / `index.json` / `trees.json` at ~2 lines each, it's pure timestamp noise. If `ground.bin` / `ribbons.json` / `map.json` moved, real geometry changed — look at `design.json` to see which width/corner you (or an autosave) touched.

### Save / discard ceremony

The dev server **autosaves** source on every edit (Survey/Stage debounce → `overlay.json` / `design.json`) and **re-freezes** `shape.json` on Survey-exit — so the tree is *expected* to drift while authoring. Reaching a clean state is deliberate:

- **To discard churn** (the default habit while iterating): from a quiet tree (no active drag), `git restore .` returns to the last commit. Safe — source autosaves are already on disk; this just throws away uncommitted derived churn + unwanted source edits.
- **To save a slab** (you authored something to keep): bake it (⌥-click a bake button = force, or `POST /looks/<id>/bake?force=1`) so the derived artifacts match source, then commit **source + derived together** in one commit (`bake(...)` or `feat(...)`). The slab must travel as a coherent set (`SLAB-CONTRACT §9` rule 1) — never commit a `design.json` edit without its re-baked artifacts, or the deploy ships intent the slab doesn't reflect.
- **⚠️ The dev server reads the *main worktree's* branch.** Work done in an agent worktree is **invisible** on the lit app (`:5173`) until merged into the checked-out branch. "Still not fixed" usually means "not merged yet," not "the fix failed."

### How it ships — local bake → commit → CI serves as-is

**CI does not bake.** Both workflows run `npm ci` + `vite build` (+ `--base` for staging) and publish the checked-out `public/` as static files. There is **no `pipeline.js` / `bake-*.js` in CI.**

⛔⛔ **BUT "WHATEVER SLAB YOU COMMITTED IS WHAT DEPLOYS" IS NO LONGER TRUE (2026-09-01), AND ACTING ON IT SHIPS NOTHING.** `public/baked/` is gitignored and served from **R2** (`PUBLISH.md §6`). Two consequences that pull in opposite directions, so hold both:
- **The slab needs no commit and no push.** The bake's last step uploads it and it is live on staging *and* prod immediately. "Bake + commit before you push" is retired for geometry.
- **Everything else still does.** `design.json`, `looks/index.json`, `ribbons.json` and the OG image are tracked and ship the old way.

⭐ **So a stale *slab* is now impossible-by-push and possible-by-upload:** if a pour looks stale, the question is no longer "did I commit it" but "did it reach the bucket" — ▶ `node scripts/verify-baked-in-r2.mjs`.

| Branch | Workflow | Deploys to |
|---|---|---|
| `main` | `deploy.yml` | **lafayette-square.com (PROD)** |
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
| Staging/prod shows **stale geometry** | ⛔ **The old answer ("you didn't bake+commit before push") is retired.** The slab is served from R2, not from the deploy — a commit has nothing to do with it. ▶ `node scripts/verify-baked-in-r2.mjs` reads the bucket and names what is absent or the wrong size. ⛔ **It defaults to PROD keys — to check a staging pour, prefix the base:** `ASSET_BASE=https://assets.theward.online/staging/ node scripts/verify-baked-in-r2.mjs --look=<look>`. If the bucket is current, it is a **browser/CDN cache**: hard-refresh (`PUBLISH.md §6` — TTL 300 s). |
| **A pour looks like it did nothing** | The bake fails loudly (500) when its R2 upload fails, so check the bake's own response first. A green bake means the bucket has it. |
| **Bake returns 500: "the slab reaches nobody — N of 915 objects FAILED"** | R2 hands back a transient 500 on a small fraction of puts. Since 2026-09-04 each put **retries 4× with backoff**, so a survivor of that is a real failure — read the key it names. ⛔ Don't re-run the whole pour to fix one object: the upload is **incremental**, so re-running only re-puts what actually differs (~15 s when nothing does). |
| **Blank map in a fresh clone / new machine** | `public/baked/` is not in the repo. `cp .env.example .env` and set `VITE_ASSET_BASE` (`README §Local development`). ⛔ **But comment it out again before you author**, or Stage/Preview will show you R2's slab instead of the one you just baked. |
| Wrong in **Survey**, right in **Section/bake** | The **live-load path**, not the frozen geometry — measure-resolution / overlay / the vite bundle (`ARCHITECTURE.md §2.1`). |
| Section shows **no change** after a CLI bake | The `shape.json` cache-buster (`?t=freezeTag`, `BlockGeometryV2Debug`) — a CLI bake can't bump client state. Exit Survey (autosave-freeze) or click **Bake** to bump it. |
| A **baked artifact looks wrong** | First ask "is this the *live re-stroke's* defect, faithfully captured?" — the bake is the messenger, not the bug (`BAKE.md §4`). Diagnose **upstream** (the live construction), never patch the output. |
| Proxy / node render disagrees with the app | **The operator's eye is the gate** (`[[feedback_proxy_render_is_not_the_operator_eye]]`). The proxy misleads in both directions — trust the lit app. |
| A SHAPE/curb silhouette is wrong | Upstream — Survey · skeleton · prebake. *How a ribbon bends* is Section (FILL). Name the layer before you fix (`CLAUDE.md` route gate · `PIPELINE §5 (the Wall)`). |
| **Bloom (or another post effect) suddenly looks broken / no glow** right after you toggled **DoF or SMAA** | An **HMR artifact, not a real bug.** The `EffectComposer` is keyed `fx-${smaaOn}-${dofOn}`, so toggling DoF/SMAA rebuilds the composer and Vite HMR can leave it detached → **hard-refresh the page.** Don't chase a DoF↔Bloom coupling — they share the pyramid by design. |
| **Trees don't show in Browse** | Known render "wake-up" — **nudge any look dial** and they pop in. It's the render/cull layer, not a look knob (tracked, unresolved). |

### `VITE_ASSET_BASE` — where the slab is read from *(the one env knob you will actually touch)*

| | |
|---|---|
| **Unset** (default) | falls back to `BASE_URL` → **whatever is on local disk** under `public/baked/`. |
| **Set** | `https://assets.theward.online/` → the published slab in R2. |
| Where prod/staging set it | a GitHub Actions **variable** (not a secret), read by both workflows. |
| Where you set it | `.env` (see `.env.example`). |

⭐ **The fork that matters, and it is easy to get backwards:**
- **Viewing** the map (fresh clone, no local bake) → **SET** it, or you get a map with no ground, buildings or trees.
- **Authoring** (Stage → Bake → Preview) → **COMMENT IT OUT**, or you will pour a scene and then inspect R2's *older* copy. That reads exactly like a bake that didn't propagate — the confusion `PREVIEW.md §7` warns about ("a wrong Preview is a wrong bake"), except the bake was fine.

⛔ **There is deliberately no automatic fallback between the two.** A missing asset 404s loudly rather than resolving to something that renders, because a broken local bake that silently looks fine is the failure this whole arrangement exists to prevent.

### Named levers (deliberate)

- **The save ceremony is the Preview "Publish" panel** — one button commits the scoped slab pathspecs only, then pushes. Use it instead of eyeballing the dirty tree. It runs on DEV-ONLY git endpoints in `cartograph/serve.js` and the panel **hides when the backend is unreachable**, so a deployed Preview can never touch prod. ⚠️ **For a slab-data publish, staging is redundant — push straight to prod:** Preview already renders the slab in production's exact tree, so it *is* the gate. Staging-first still applies to **code / structural** changes. Home: `PREVIEW.md §0.2`.
- **⏳ Chosen but unbuilt — kill the timestamp noise.** Make `scene.json` / `index.json` / `trees.json` omit or stabilize their `Date.now()` fields so a no-op re-bake is byte-identical and the tree stops going dirty for free. *(Companion, also unbuilt: a reproducibility gate — a CI/pre-push check that the committed slab equals a fresh bake from source, to catch a stale slab before it ships.)* Tracked in `BACKLOG.md`.

*Provenance: Boz 2026-06-01 (seed); populated 2026-06-14 from the FEATURES operator-knob migration; **save→ship lifecycle + troubleshooting door added 2026-06-17** (the forensic-to-lookup conversion); **Stage + Preview expanded to the full code-grounded knob master list 2026-06-26** (pyramid tuner + inclusion manifest flagged in-flight); **Extent / no-CLI intake→pour flow documented 2026-07-04; rewritten to the INCLUSION-POLYGON procedure + the three-sizes/two-centers model 2026-07-23** (the canon sweep — step 5 had still carried the retracted "the circle IS the boundary" model, which was on the routing path and was actively mistraining agents; design of record `EXTENT-DESIGN.md`). The operator-manual counterpoint to FEATURES.*
