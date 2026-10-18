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

## 2 · The rule (the ladder the kit already uses: authored → data → town norm → kit)

The street's cross-section, from the road edge to the property line, is decided per edge, in this order:
1. **Authored** (`blockCustoms`, Survey/Section) always wins.
2. **The data:**
   - **the parcel line is the back of the street.** No ped band reaches past the property line the assessor
     records, and the band's total depth is at most the distance from the curb to it.
   - **The road's width tag** (OSM `width`, and `lanes`) sizes the carriageway where present.
   - **The street's type:** a `living_street` / `pedestrian` way gets no curb and no treelawn by default (the
     curbless flush slope that already exists, `OPERATIONS` "Curb cuts"). OSM sidewalk/kerb tags, already seeded
     per street side by `stampCustomWidths`, keep their place.
3. **The town's norm** (`norms.json`), e.g. a commercial core with no treelawn.
4. **The kit default.**

⛔ Absent data says so **by name, per pour** (no parcels for this town · no width tag on this street). It never
silently becomes the kit default. ⛔ Never a per-street exception list. ⭐ Mono-width still holds within an edge
(`PIPELINE §6`); what changes is the total depth the data allows.

## 3 · Answer before building, against the code, and report to Boz

a. **Right-of-way parcels.** Alleys lie about 99% inside parcels on PTown and JH, which hints that some parcel layers
   include the street itself as a parcel. Find out how to tell a ROW parcel from a lot by the data (its own class
   code or tag, never by shape), per town, before any parcel is read as the back of the street.
b. **Which towns have parcels at all**, from which source, and what the pour prints for a town without them.
c. **What OSM `width` means** on each town's streets (carriageway or whole ROW), measured against the parcels, and why
   Commercial Street paints 8.0 m against a width-6 tag. Read where the carriageway width is decided and name the
   code site.
d. **Where in the chain each input enters.** ① stays width-free (`PIPELINE` step 3). The road width is ②'s offset
   (`pavementHW`), the band depth is ③'s. Say which frozen record carries the parcel line to ③. Per the second
   wall (`PIPELINE §6a`), it travels as data on the edge, not as a lookup by distance.
e. **The authoring overlap:** on LS and HPDM, list the edges where authored widths already differ from what the data
   would give, so the operator's decisions are visible and never overwritten.

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
