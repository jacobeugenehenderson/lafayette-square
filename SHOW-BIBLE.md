# The Show Bible — the master package

**Status: v1 (2026-06-15) — the productization deliverable of the forensic-audit campaign.** The one doc that frames the *whole* project for the three audiences who need it: **Marketing** (you can do this), **Fundraising** (here are all the moving pieces), **Engineering** (what it is, how you reach it, how to fix it). It is a **synthesis + index**, not a new source of truth — each section points to the canonical home and aggregates it for its audience.

> **Provenance.** Built from the four pathologist walks (`scratch/audit-{cartograph,arborist,ls-app,docs}.md`), their aggregation (`AUDIT-MATRIX.md` "THE MASTER MATRIX"), the per-app pitches (`*/FEATURES.md`), the pipeline + architecture canon, and the productization seed (`plans/front-front-end-and-productization.md`). The three purposes are defined there (`§"three documentation purposes"`).
>
> ⚠️ **Honesty note.** The *structure* and the *engineering/fundraising* content are drafted from the audited record. The **marketing voice is Jacob's to sharpen** — the per-app product sheets (the `FEATURES.md` docs) are the sales-voice SSoT; this doc aggregates their claims, it doesn't replace them. A capability that reads as nonsense here is a **dead-code flag**, not just a copy nit (the campaign's vestigial-detector).

---

## 0. The product stack — what is actually the product

Three product tiers + one access surface (`plans/front-front-end-and-productization.md §"product stack"`):

1. **The Cartograph = the FACTORY.** The authoring suite (with **Arborist** + **Meteorologist** as internal / à-la-carte modules) that *produces slabs*. **This is the licensable product.** (Lafayette Square is the deliverable *to Jacob*; in market terms the Cartograph is the product.)
2. **The Slab = the portable PRODUCT / FORMAT.** A baked `scene.json` + bins — flat, fortified, dumb, fast. "Theoretically anyone can build whatever they want on it." Governed by the render-vs-content boundary (the slab carries content; the consumer brings rendering). Spec: `SLAB-CONTRACT.md`.
3. **Consumers = what's built on a slab.** **LS is reference consumer #1**; there could be N.
4. **API = programmatic access** (developer-facing + internal). The proto-API already exists — the three `serve.js` backends serve `/api/*`. Only possible over a single-source-of-truth, documented system → **the cleanup *is* API-enablement.**

> **One technical spine — de-hardwire + single-source-of-truth + document — feeds all four surfaces.** The audit asked of every hardcoded value + endpoint: what does exposing it cleanly unlock — a setting (tier 1), a slab field (tier 2), an API route (tier 4)? **The cleanup IS the productization, seen through four lenses.**

---

## 1. MARKETING — "you can do this and this" (the per-app product sheets)

The kit is a set of **standalone, à-la-carte apps**. Each has its own product sheet (its `FEATURES.md`) that **stands alone** — what it is, why it's special, what you can do today. This section is the marquee; the sheet is the detail.

### Cartograph — the neighborhood factory
*Pour a real 3D neighborhood from real city data — beautiful, and built to run on a phone.* You feed it OpenStreetMap + official parcels + operator-measured street widths + ML building footprints, fortified against high-res aerials; it traces a clean street frame, dresses it with curbs/sidewalks/tree-lawns, lets you author the look, and bakes a slab the public app stands on. **The next neighborhood pours from the same kit, by a different operator, with almost no hand-work.** → **`cartograph/FEATURES.md`** · the plain-language intro is `ORIENTATION.md`.

- **Survey** — author the hardscape shape (widths, caps, corner radius) against the photo.
- **Section** — author the pedestrian cross-section (sidewalk, tree-lawn, ADA corners) inward off the frozen curb.
- **Stage** — author the *look* (materials, sky, lighting, neon, camera) and bake the slab. → `cartograph/STAGE.md`.
- **Preview** — stress-test the slab (GPU profiler, phone-aspect frame, per-layer cost) before it ships.

### Arborist — the species library + tree bake
*Real trees — the actual species.* A per-species library that bakes tree meshes + leaf-anchor data + photo-PBR bark, so a neighborhood's canopy is the actual species at true botanical scale. Trees render as full meshes today; the impostor arc that makes dense canopies phone-light is built and parked — the next work, not a shipped claim. → **`arborist/FEATURES.md`** · `arborist/SPEC.md`.

### Meteorologist — the living sky
*The neighborhood breathes with the real weather.* The sky is the **actual sky over the actual place** — a live feed drives clouds, sun, and effects at the true cadence; authored as a continuous look across **(Condition × Degrees)**, not a slideshow; **authored on the same stage that ships.** → **`meteorologist/FEATURES.md`** · `meteorologist/WEATHER-MODEL.md`.

### Lafayette Square — the reference consumer
*A public 3D neighborhood you can walk, claim, and run.* Visitors browse overhead and at street level; residents claim their building and post; business owners (guardians) edit their listing; couriers (Cary) run a request-and-dispatch system; townies check in. The consumer surface that proves the slab. → **`ls/FEATURES.md`**.

### The Slab — the format, as a product
*A flat, fortified, portable neighborhood anyone can render.* The boundary product: cartograph publishes it, LS (or any consumer) trusts it cold. → **`SLAB-CONTRACT.md`**.

> **Capability-as-detector.** Every "you can do X" above is also a liveness check: if a claim reads as nonsense ("marry a man in South America in one click"), it flags dead code. The audits ran this lens per item — see the master matrix.

---

## 2. FUNDRAISING — "here are all the moving pieces" (the master map)

### What we're building, in one breath
A **kit for pouring 3D neighborhoods.** Real city data in → a **slab** (flat, fast, fortified) the public app stands on like a foundation. Lafayette Square is the first off the line; the *next* pours from the same kit, by a different operator, with almost no hand-work. **Aesthetics and performance are co-equal and non-negotiable** — beautiful *and* built to run on a phone. (`ORIENTATION.md`.)

### The architecture — helpers publish artifacts; the runtime composes them
Each helper publishes **one canonical artifact**; the slab is the boundary; the runtime consumes the slab, never the raw sources (`README.md §"Architecture at a glance"`).

| Helper | Publishes | Consumed by |
|---|---|---|
| **Cartograph** | `public/baked/<id>/*` (the slab: ground/buildings/lamps/scene) | LS runtime |
| **Arborist** | `public/trees/<species>/{glb, tips, manifest}` | runtime InstancedTrees |
| **Meteorologist** | `public/clouds/{presets, almanac}.json` | runtime Atmosphere |

### The factory line (the pipeline)
Raw data flows downhill; each stage freezes a thing the next trusts (`PIPELINE.md`, `ORIENTATION.md §"dependency chain"`):
`intake → skeleton → prebake → survey → ⟦THE WALL⟧ → section → bake → THE SLAB → the public app`.
The hard-won doctrine: *the skeleton is the first bake · chains die at the wall · the curb is a concentric offset of the centerline · every output is a best guess, and everything is overridable* (`NEIGHBORHOOD-INPUTS §0.0`).

### The inventory at a glance
The forensic audit walked every rendering environment (Designer · Toy · Stage · Preview · Production) across all domains and inventoried **~108 classified capabilities** (the three code domains; plus 86 docs): **~58 keep · ~31 fix · ~10 queued-for-removal**. The dev-doc spine is healthy; the cruft is contained and tagged. Full rollup + per-item detail: **`AUDIT-MATRIX.md` "THE MASTER MATRIX"** → `scratch/audit-*.md`.

### The inputs are real, not guessed
OpenStreetMap geometry · City of St. Louis parcels + right-of-way + land-use (municipal) · operator-measured street widths (61/68 LS streets) · ML building footprints · Mapillary facades · elevation DEM — all fortified against max-res aerials. A generic 3D map extrudes a default city; ours is grounded in the actual record, block by block. (`cartograph/INTAKE.md`.)

### Where it stands (the v1 line)
LOOK is authored; the open work is the SHAPE campaign (make the skeleton produce correct street geometry *automatically* so the 35 hand-fixes can be deleted → kit-correct on town #2). The **removal freeze** holds: nothing classified `remove` is cut until v1 ships. (`cartograph/BACKLOG.md`.)

---

## 3. ENGINEERING — "what it is / how you reach it / how to fix it"

### How you reach any piece (the routing)
One canonical reading order, every session: **`ORIENTATION.md`** (the plain-language mental model) → **`README.md §⭐ START HERE`** (the settled conclusion per topic + the cross-cutting feature index "where does X live") → **the topic canon** it names. (`BOZ.md` is the coordinator's doc, summoned only when you're Boz.)

### What it is, per stage (the authoritative homes)
Each pipeline stage has ONE deep home: `INTAKE` · **`SKELETON`** (the frame) · `PREBAKE` · `SURVEY` (SHAPE) · `WALL` (the freeze) · **`SECTION`** (FILL) · `BAKE` · `STAGE` (look). Geometry doctrine: **`RIBBONS.md`** (the tile model). Execution spine: **`PIPELINE.md`**. The doc system itself (3 kinds × 3 registers) is `BOZ.md §0`–`§3`.

### How to fix / troubleshoot
- **First diagnostic: "is this chains again?"** A wrong silhouette is upstream (skeleton/survey); how the ribbon *bends* is Section. The fix is to move the wall earlier, never patch chains deeper. (`PIPELINE §Wall`.)
- **The derivation chain:** centerline → polygon → ribbon. Fix at the centerline; patching the shadow comes right back. (`RIBBONS §1`, `SKELETON §3.5`.)
- **The eye is the gate.** Proxy renders mislead on this map; verify map-wide, zoomed-out, on the operator's eye (`feedback_proxy_render_is_not_the_operator_eye`).
- **The correctness suite** automates the operator's eye — one RED-until-true invariant per bug-class; the detector is the deliverable. (`POLYGON-FIRST §5`.)
- **The open fix queue + blocked-on knots** (what's broken, what's stuck behind it): `AUDIT-MATRIX.md` "THE MASTER MATRIX" ⓷.

### The proto-API
The three `serve.js` backends already serve `/api/*` (cartograph Looks/bake · meteorologist presets/almanac · arborist library). The audit inventoried them (master matrix ⓶ Tier-4); formalizing over the cleaned single-source-of-truth is the tier-4 horizon.

---

## 4. The productization roadmap (the horizons)

The de-hardwiring inventory *is* the productization spec, seen through four lenses (master matrix ⓶, `plans/front-front-end-and-productization.md`):

- **Tier 1 — the front-front-end (settings / intake screen).** What turns "our LS instance" into "a thing someone else configures." The Tier-1 register *is* the first draft of the intake screen: **geography** (lat/lon, SunCalc anchor) · basemap source · brand/theme tokens · default Look · device profile · per-instance contact.
- **Tier 2 — slab-completeness (the format).** Most channels are slab-fields-done; the open gaps: landmark pin anchors, the `scene.clouds` channel, mobile profile, camera framing, per-Look tree-bake path, the zoning→category map.
- **Tier 4 — the API.** Formalize the `serve.js` endpoint inventory into a documented route table.
- **The deferred removal queue** — assembled (master matrix ⓵); 🧊 executes in ONE window **after v1 ships**.
- **Open productization questions** (`plans/ §"Open"`): intake UX, the settings surface (per-instance vs per-Look), auth/tenancy, à-la-carte packaging.

---

## Status & maintenance

- **v1 drafted 2026-06-15.** This is the campaign's productization deliverable (the "Show Bible" step 2 of `AUDIT-MATRIX.md` named).
- **The per-app `FEATURES.md` docs are the marketing SSoT** — sharpen the sales voice there; this doc aggregates.
- **Remaining campaign steps** (`cartograph/BACKLOG.md §"Forensic audit → Show Bible"`): execute the removal queue (post-v1) · route the Tier-1/2/4 register into `plans/` · re-audit the held ribbons/corners exclusion zone (now the tile model landed) · build out `OPERATIONS.md` (the stalled operator register) as T3 authoring lands.
- **Keep it honest:** when a per-app pitch or a productization tier changes at its home, update the one-liner here in the same sweep (the accord rule, `BOZ §3`). A stale Show Bible mistrains every audience it serves.
