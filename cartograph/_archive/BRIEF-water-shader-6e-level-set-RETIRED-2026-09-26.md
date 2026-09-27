# RETIRED 2026-09-26 — BRIEF-water-shader §6e, "the y=0 level set is not the shoreline"

> Moved to the Diary by Strand (Jacob: "a final pass … clean out, not layer on").
> **Why retired:** its numbers predate the datum fix (`cdd41f6e`): the DEM under the water now reads the water's
> own level (depth 0.09 m at p5–p95 on huron and provincetown — the sheet's slot lift). Its "real path"
> (distance-to-ARC, a per-vertex attribute + schema bump) was superseded by Jacob's ruling for REAL depth
> (`docs/briefs/BRIEF-bathymetry.md`), and its "the waterline is where the terrain crosses y = 0" by the ruling
> that the drawn water's edge IS the mapped shoreline (`docs/briefs/BRIEF-the-shore-is-closed.md`).
> Kept for the lesson it carries: the DEM hydro-flattens water; any depth ramp without bathymetry is fabricated.

## 6e. ⛔⛔ THE y=0 LEVEL SET IS NOT THE SHORELINE — §6d IS TRUE, THE INFERENCE FROM IT WAS NOT

> **Measured by Fathom, 2026-09-20, per-sample on huron's DEM** — 2,064,969 samples, every 3rd on
> both axes, split by the water ring:
>
> |  | n | min | p5 | p50 | p95 | max |
> |---|---|---|---|---|---|---|
> | **under water** | 86,008 | 0.00 | 0.03 | 0.55 | 1.20 | **3.31** |
> | **on land** | 143,433 | **1.14** | 1.24 | 9.21 | 15.43 | 23.60 |

⭐ **The two populations OVERLAP and the land never reaches zero.** `bake-terrain` does normalize
local-min to 0 and the local min IS in the lake — §6d is correct about the **datum**. But the
clamped lake bed is a **noisy shelf spanning 0–3.3 m**, not a flat zero: ONE sample sets the datum
and the rest of the lake sits above it, interleaved with the low land.
⇒ A band built on the y=0 crossing paints **in open water**, near wherever the single deepest
sample fell, and paints **nothing at the actual shore**.

⭐ **AND IT CONFIRMS ⑤ HARDER THAN THIS BRIEF DID.** Under the water the DEM goes **UP** — median
0.55 m, max 3.31 m. There is no bathymetry; the DEM clamps the body and then wanders.
⛔ **Any depth ramp is fabricated**, and the shader must say so at the ramp.

### ▶ THE REAL PATH — a signal that already exists, and its cost
`cartograph/coastline.mjs:139-148` returns **`arcs` SEPARATELY from `rings`**: the arc is the TRUE
shoreline polyline; the ring is that arc plus its closure along the bb edge.
⇒ **distance-to-ARC is a correct signed shore distance, and it is BLIND to the fetch envelope**,
because the envelope closure is not in `arcs`. ⭐ That disposes of §5's "beach in the middle of
Lake Erie" using an object the producer already builds. (The stencil disc rim is a second false
edge and is likewise not an arc.)
⛔ **ITS COST, AND WHY FATHOM STOPPED RATHER THAN BUILD IT:** consuming it needs a **per-vertex
attribute** on the water group, and the slab's `.bin` is `[all positions][all indices]` with no
attribute slot. **That is a slab SCHEMA change for a look feature** — not a call to make inside a
water brief (`claims-no-slab-outlives-its-schema` exists for this reason).
▶ **Bounded next dispatch:** persist the arcs · add the attribute · bump the schema. **Jacob's call.**

### The cause, ruled
**ASPIRATION, not rot** — and the excision is surgical. ⛔ **§6d stays; it is Jacob's own correction
and it is true.** What died is the ⑤-adjacent claim that the shoreline came FREE with it — an intent
never verified against the raster, derived from `baseElev 173.24` vs Lake Erie's ~173.5 m, which is a
correct fact about the **datum** and not about the **level set**.
**The shoreline is still wanted. What is dead is the free way of getting it.**

⛔ **The coordinator was about to write "water must be seated like the buildings." That would have
been wrong and it would have produced a lake that undulates.** Recorded because the next reader will
have the same instinct — everything else on the surface needed lifting that day, and water did not.

### ⭐⭐⭐ AND IT HANDS §5 ITS SHORELINE FOR FREE — BUT NOT ITS DEPTH
**THE WATERLINE IS WHERE THE TERRAIN CROSSES y = 0.** Not a polygon to fetch, not a ring to walk —
a contour of a field we already bake. ⇒ §5's *"can a signed distance-to-shore be produced"* has a
better answer than the 1,899-point ring: **the shore is a level-set of the heightfield**, and it is
correct even where the OSM ring is clipped by the fetch envelope. ⭐ **That also disposes of §5's
worst trap — "a beach in the middle of Lake Erie" — because the envelope edge is not a zero crossing.**

⚠️ **BUT DEPTH IS STILL NOT AVAILABLE, AND NOW WE KNOW WHY.** Measured: only **16.3%** of huron's
2,064,969 terrain samples lie within 0.5 m of zero, against a lake that is **35.5% of the disc.**
⇒ **The USGS DEM CLAMPS the water body rather than sounding it. There is no bathymetry in the source.**
⭐ So the honest split, and it should shape the whole build:
- **shoreline falloff — AVAILABLE AND FREE.** Build it.
- **true depth-driven subsurface scattering — NOT AVAILABLE.** Any depth ramp would be **fabricated
  from distance-from-shore**, which is a LOOK, not a measurement. ⛔ **Fabricate it if Jacob wants the
  effect — but say in the code that it is fabricated.** A plausible depth that is not depth is this
  project's signature defect.

### ⭐⭐ AND THE SHORELINE BAND OWES A SECOND THING: **WHAT IS UNDER THE WATER IS DRAWN AT FULL STRENGTH**
*(Measured 2026-09-25 from the revetment side; it corroborates the clamp above and adds its consequence.)*
The clamp is sharper than the 16.3% figure suggests: over 2,064,969 samples huron's **minimum is
−0.107 m**. 40% of samples are nominally "below water" and every one of them is within 11 cm of it —
a flat sheet, which is what a LAND product gives for a water body.
⛔ **Meanwhile the water is drawn with a FLAT CONSTANT ALPHA and no depth term at all**
(`waterMaterial.js`: `transparent: true, opacity: 0.78, depthWrite: false`). Everything beneath the
surface is blended identically whether it is 5 cm down or 5 m down — which is why submerged geometry
reads as a hard silhouette rather than as something underwater.
⚠️ **`uTurbidity` IS NOT THE CLARITY KNOB.** It is a SKY parameter, passed only to `skyDomeColor` for
the dome reflection. Anyone reaching for it to tint the water will be editing the sky.
- **What is actually under there, measured:** the revetment descends to **35% of the crest height**
  below the waterline (`revetmentDrape.js` `U_HI = 1.35`) — median 0.55 m, max 1.80 m on huron — and
  building foundations reach **3–5 m** down, because `FOUNDATION_BELOW_GRADE_M = 8` on every building
  (89.1% of huron's 3,678 buildings cross the waterline). On land the opaque ground hides both; over
  water there is no ground, so both are simply visible. ▶ `node scratch/revetment-toe-founding.mjs`
- ⭐⭐ **RULED BY JACOB (2026-09-24): ONE MECHANISM, AND IT IS THE WATER'S.** *"we see thru the water
  so I think fading out the bottom edge would make it appear it's disappearing into the water. Also,
  we see the building foundations thru the water as well."* ⇒ anything below the surface **fades to
  ZERO** by its depth below it — a water property, not a per-object hack, and the stone toe then needs
  no invented founding depth.
- ⛔ **THE FADE DEPTH MUST NOT BE A CONSTANT.** `U_HI = 1.35` is the cautionary tale: a unitless band
  fraction whose value in metres is stable only because the crest is (Class D #8's sibling —
  `BRIEF-ls-bleed-excision §1`). ⭐ There is a real per-water-body physical quantity that means
  exactly *"the depth at which an object stops being visible"* — the **Secchi depth** — and it is
  acquirable: the Water Quality Portal (EPA + USGS) serves it by bbox, and LABELS each station's
  water body, so attribution needs no geometry. Cape Cod Bay reads a median of 5.20 m over 5 estuary
  stations; huron's Lake Erie has 2 readings, 1.40 m and 2.57 m.
  ⚠️ ⛔ **OPEN, AWAITING JACOB:** what an UNMONITORED water body gets. A typed default there is the
  same Class D again. ⛔ And a site's readings must be reduced by median with n and spread carried —
  one Cape Cod pond alone spans 0.28–8.75 m across four dates, so `min`/`max`/`latest` is not a clarity.

