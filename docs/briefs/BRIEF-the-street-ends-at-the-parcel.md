# BRIEF — the street ends at the parcel

*Jacob, 2026-10-18; written by Boz. Queued for Lath after the narrow-block walk item (`RIBBONS §3.5`, be585d5c).*

## 0 · What Jacob asked, in his words

- *"There are lots of places where building footprints sit on top of grass or sidewalk unrealistically; sometimes
  curbs and even asphalt."*
- *"There are many places with weird or built-up sidewalks that don't follow the usual 'treelawn sidewalk' setup … In
  PTown, especially on Commercial Street, there is no meaningful 'sidewalk' or curbs, and especially not green tree lawn."*

## 1 · What was measured (read-only census, the served slabs, authoring as served)

▶ `node scratch/footprint-census/census.mjs` · `summarize.mjs` · `commercial.mjs` · `parcelcheck.mjs`, and the full
report at `scratch/footprint-census/REPORT.md`. ⛔ Quote these numbers only with the command beside them.

- **The parcels line up with the map:** 99–100% of footprint area lies inside an assessor parcel, in every town.
- **Mostly the band, not the building:** most of the building area that sits on painted street ground is still inside
  its own parcel. The painted ped band (and, in places, the road) runs onto parcel land.
- **It ranks by town in the same order as the band's overrun:** painted sidewalk inside parcels goes from JH 5% to
  PTown 76%, and buildings on street paint go from JH 0.6% to PTown 34.9%.
- **Commercial Street, PTown:** 6 of its 7 ways are `highway=living_street`, `lanes=1`, `width` 6 or 9.1, and none
  carries a sidewalk or kerb tag. The kit paints all of it as an 8.0 m carriageway, a 0.15 m curb, 1.5 m of
  treelawn and 1.5 m of sidewalk, putting the property line 7.15 m from the centreline. The parcel line sits at a
  median of 3.4–3.9 m.
- **Some footprints are wrong too:** where an MSBF footprint intrudes, it usually reaches ≥1 m further than its OSM
  twin. That fits roof lean, but it is not established. A few deep cases are unexplained, e.g. HPDM `msbf-9265` with
  509 m² on asphalt. ▶ `cartograph/BACKLOG.md` "Lot-anchored footprint geometry (parallax)" is the standing home for
  the footprint side. ⛔ That is NOT this brief.

- **The sidewalk data, per town** (▶ `node scratch/sidewalk-evidence/census.mjs <scene>`, REPORT.md beside it):
  - **How much exists.** OSM sidewalk ways cover JH 74% of frontage, LS 53%, HPDM 49%, and PTown and Huron only 5–7%. Road ways carrying a `sidewalk*` tag: JH 48% of road length, elsewhere 1–16%. No `kerb*` tag on any road way.
  - **What the pour reads today.** The only data rung is LS's hand survey; nothing reads OSM's `sidewalk=*`.
  - **An intake gap.** LS's and HPDM's `osm.json` carry no crossing NODES (no `pois` key), so that evidence was never fetched there.
  - **Corner style.** The data decides it on 0.1–15% of junction corners. Where it does on LS, it says mostly diagonal (78 to 6), which matches LS's authored norm.

- **What the code does with the data today** (Lath, 2026-10-18, read against the code):
  - **The sidewalk rung is LS only, and per street NAME.** `skeleton.js` `stampCustomWidths` reads `raw/survey.json`; only LS has one. OSM `footway=sidewalk` ways serve only to pick which of a name's two survey values goes to which chain side, by perpendicular distance (`chainSidewalkDistances`, the A15 proximity recovery the containment rung replaces; delete it when that lands). Nothing reads `sidewalk=*` or `kerb*` on a road way.
  - **The width tag is never read.** Nothing in `skeleton.js` or `derive.js` reads OSM `width`. The carriageway is `seedSection`'s lanes × the class's lane, plus two parking lanes on residential. A class with no `STD_SECTION` row (e.g. `living_street`) becomes `residential` silently, so Commercial Street (`lanes=1`) paints 1 × 10 ft + 2 × 8 ft = 7.92 m.
  - **`width` means different things by town** (▶ `node scratch/footprint-census/width-vs-parcels.mjs <scene>`, tag ÷ the parcel-to-parcel gap): PTown residential p50 0.77 and tertiary p50 0.87, near the carriageway; HPDM residential (9 segments) p50 1.82 and JH (58) p50 1.60, tags of 29–31 m on 16–18 m gaps (feet entered as metres would fit; not established). LS has no width tags.
  - **Street ROW is not a parcel anywhere** (▶ `node scratch/footprint-census/row-parcels.mjs <scene>`, 5 m samples of OSM centrelines): 90–98% of street samples lie in no parcel on every town. JH's alleys lie 72% inside `01` one/two-family lots, so they are drives within lots, not ROW parcels. The codes that do hold street centrelines are the ROW candidates, to be read by each source's own vocabulary: STL `5000` (HPDM 5.7% of streets, 86.5% of pedestrian ways), Huron `400: Com-Vacant Land` (5.1%), PTown `9000`, JH `07` (Transportation & Utility). MassGIS L3 publishes a `POLY_TYPE` that marks ROW polygons, but `states/ma.mjs` fetches only `LOC_ID`, `SITE_ADDR` and `USE_CODE` (the field's presence at the endpoint not verified here).

## 2 · The rule (the ladder the kit already uses: authored → data → town norm → kit)

The street's cross-section, from the road edge to the property line, is decided per edge, in this order:
1. **Authored** (`blockCustoms`, Survey/Section) always wins.
2. **The data:**
   - **the parcel line is the back of the street — only where the street lies in the GAP between parcels** (its ROW). No
     ped band reaches past that property line, and the band's total depth is at most the distance from the curb to it.
     ⛔ A way inside a lot (JH's alleys run 72% inside one/two-family lots: a private drive) has no parcel line for a
     back; the lot line there is the drive's neighbour's, not the street's (Boz, 2026-10-18). ROW-ness is read off the
     DATA (MassGIS `POLY_TYPE`; each other source's own land-use code book), never off shape.
   - **The road's width tag** (OSM `width`, and `lanes`) sizes the carriageway where present — behind a per-town sanity
     rung: a tag WIDER than its parcel-to-parcel gap is disbelieved, by name, per pour (Boz, 2026-10-18). What the tag
     means differs by town (§1); "feet entered as metres" stays not established until a source shows it.
   - **The street's type:** a `living_street` / `pedestrian` way gets no curb and no treelawn by default (the
     curbless flush slope that already exists, `OPERATIONS` "Curb cuts"). OSM sidewalk evidence enters per FACE by
     containment (a `footway=sidewalk` way inside the tile's ring and within one owner's band rects — Boz, 2026-10-18),
     with `sidewalk=*`/`kerb*` tags on the road way. *(Today none of it is read: §1.)*
3. **The town's norm** (`norms.json`), e.g. a commercial core with no treelawn.
4. **The kit default.**

⛔ Absent data says so **by name, per pour** (no parcels for this town · no width tag on this street). It never
silently becomes the kit default. ⛔ Never a per-street exception list. ⭐ Mono-width still holds within an edge
(`PIPELINE §6`); what changes is the total depth the data allows.

## 3 · Answer before building, against the code, and report to Boz

a. **Right-of-way parcels.** Alleys lie about 99% inside parcels on PTown and JH, which hints that some parcel layers
   include the street itself as a parcel. Find out how to tell a ROW parcel from a lot by the data (its own class
   code or tag, never by shape), per town, before any parcel is read as the back of the street.
   *(Measured, Lath 2026-10-18, ▶ `row-parcels.mjs`: street ROW is in no parcel layer — 90–98% of street samples lie in no
   parcel; by centreline JH's alleys are 87.5% inside parcels, mostly lots. CANDIDATE ROW codes, each to be CONFIRMED
   against its source's own code book, never by geometry: St. Louis `5000` · Huron `400: Com-Vacant Land` · PTown `9000` ·
   JH `07`. MassGIS L3 serves `POLY_TYPE` (FEE 6,578 · TAX 3 in PTown's bbox, no ROW) and `USE_DESC`; the fetch reads
   neither yet.)*
b. **Which towns have parcels at all**, from which source, and what the pour prints for a town without them.
   *(Answered, Lath 2026-10-18: all five, from LS/HPDM St. Louis City + County · PTown MassGIS L3 · Huron Ohio statewide ·
   JH MapPLUTO. `derive.js` "Loading parcels": a declared well with no file throws; DECLARED-NONE prints its reason; a town
   with NO declaration warns and pours on. ⛔ **Part of this build (Boz, ruled):** an undeclared town REFUSES the pour by
   name — declare a well, or DECLARED-NONE with its reason. derive.js access is cleared when the build is dispatched.)*
c. **What OSM `width` means** on each town's streets (carriageway or whole ROW), measured against the parcels, and why
   Commercial Street paints 8.0 m against a width-6 tag. Read where the carriageway width is decided and name the
   code site.
d. **Where in the chain each input enters.** ① stays width-free (`PIPELINE` step 3). The road width is ②'s offset
   (`pavementHW`), the band depth is ③'s. Say which frozen record carries the parcel line to ③. Per the second
   wall (`PIPELINE §6a`), it travels as data on the edge, not as a lookup by distance.
e. **Authored widths are ground truth.** Jacob: *"street widths are only ever edited against the aerial photo to
   represent reality."* So every authored edge (LS, HPDM) is a measured answer, and it never gets overwritten. It is
   also the **test set for the data rung**. On those edges, how close do the parcel line and the width tag come to
   the authored width? Report the error distribution per source. That is how we learn whether the data can be
   trusted on a town nobody has authored. Where they disagree, the data is wrong, never the authoring.

## 4 · The check (the deliverable)

`checks/claims-the-street-ends-at-the-parcel.mjs`, which reads the parcels and the painted partition. It fails on
any ped band past its edge's property line that no authoring put there, and names each edge. Mutation-test it. It
counts, per town, the buildings on street paint before and after.

## 5 · Done when

- §3 is answered and Boz has ruled on anything it raises.
- The rule is built from the frozen record, with the check green on all five towns, or each red edge named and owned.
- Pictures for Jacob of Commercial Street and the five worst sites per town, before and after, with the images beside
  the HTML.
- Register: `OPERATIONS` (what the pour now reads, and how to override it) and `FEATURES` (the street follows the
  property line).
