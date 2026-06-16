# Median polygon spec (Cambour III, 2026-06-15) — inset the frozen ring inner-edge-to-inner-edge

## Diagnosis (pinned)
The teardrop/stadium Jacob sees = **the frozen median RING** (`ribbons.medians[kind:'median'].ring`), built **chain-to-chain** in `derive.js stamp:3321` (`ring=[...ta,...tb.reverse()]` from the raw chains), with the nose-trim tapering the ends → teardrop. Cambour II's `3a` fixed the carriageway WIDTHS (the green grass fill), but left the RING chain-to-chain → blue frozen ring (fat stadium) disagrees with the green grass (narrow). The median tile's curb is fine (the carriageway asphalt-difference). **Fix = the ring construction only; every consumer (medianClipFor→isMedianTile→st.med) settles once the ring is right.** Fix-at-source, frozen by the Wall, no Section/tileGround change.

## The construction (minimal, reuses the proven loop-median offset)
- **2a — scope:** at the pair loop top (`derive.js:3210`): `const surveyHW = survey[A.name]?.pavementHalfWidth || survey[B.name]?.pavementHalfWidth || correctedSurvey[A.name]?.pavementHalfWidth || 0; const halfPav = surveyHW/2`. (RAW survey, same datum as `3a`; `survey`/`correctedSurvey` are module-scope `:1211/:1214`.)
- **2b — inset:** in `stamp` (`:3312`), add an `inset` param (`inset = kind==='median' ? halfPav : 0`). When `inset>0`, **Clipper-inset** the chain-to-chain lens `[...ta,...tb.reverse()]` inward by `inset` (reuse the loop-median pattern at `:3391` — `ClipperOffset`, `ArcTolerance`, `toClipper`, `SCALE`, **`jtMiter`**, `etClosedPolygon`, `Execute(out, -inset*SCALE)`, pick largest ring). This insets both long sides AND pulls the noses in → a **blunt symmetric nose** for free (kills the teardrop). Width = `chainGap − 2·halfPav = chainGap − surveyHW` by construction = the fill formula. ⛔ **Only `kind:'median'`** — `kind:'merge'` (crossing boxes, transition tapers) stays chain-to-chain asphalt (`inset=0`, byte-identical).
- **2c — floor:** test the **POST-inset** ring against `MIN_MED_AREA=25 m²` (`:3322` guard, moved post-inset). Collapse → emit NO median (the carriageways' asphalt fills the gap → `medClip=[]` → `isMedianTile=false` → normal road). **This kills the Lafayette phantom teardrop** (`chainGap − surveyHW ≤ 0` everywhere → no ring).

## The median tile curb = option (a), NO change
The carriageways' asphalt (`surveyHW/2` inboard each) fills the tile; the median's inner curb = the carriageway inner edges (the `legacyBlock` `differenceRings([tile.ring], aFill)` carve, `tileGround.js:2447`, the D6a exclusion at `:2435`). `st.med` is just the grass. Once the frozen ring is inner-edge, grass + curb + ring all agree. **No first-class median iA, no tileGround change.**

## Freeze + Section: no change (the ring rode the freeze path; it was just wrong). IX-safe (construction-time inset; stored chains / `intersections.ix` / `extractFaces` untouched; the median tile stays the emergent chain-to-chain face, only its grass sub-region shrinks).

## Change map (Boz)
| locus | change |
|---|---|
| `derive.js:3210` | + `surveyHW`/`halfPav` |
| `derive.js:3312` `stamp` sig | + `inset` param; `inset = kind==='median' ? halfPav : 0` |
| `derive.js:3321` `ring` | `inset>0` → Clipper-inset the lens by `inset` (jtMiter, `:3391` pattern), largest ring; else keep chain-to-chain |
| `derive.js:3322` area guard | test POST-inset ring vs `MIN_MED_AREA=25` → collapse ⇒ no median (Lafayette floor) |
| `tileGround.js` | NO change |
| `shape.json` | re-freeze after rebuild (Jacob's go) |

## Acceptance (Jacob's eye, lit Survey curb view): S-Jefferson = clean symmetric strip with BLUNT noses (blue ring hugs green grass); Lafayette = NO median (no ring, no phantom teardrop); Park small strip; Chouteau/Geyer none. Pre-check: `scratch/verge-sites.mjs` (blue ring should hug green, vanish on Lafayette). Rebuild-gated.

## Locks: two-carriageway no-merge (merges stay chain-to-chain) · concentric FILL (Section unchanged) · custom>OSM>AASHTO (widths untouched) · fix-at-source · frozen-by-Section.
