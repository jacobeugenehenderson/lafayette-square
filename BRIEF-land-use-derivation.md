# BRIEF — Land use is invented for most of the map. Derive it instead.

**Status: DISPATCH-READY — re-verified against live code 2026-07-31.** Boz drafted 2026-07-21 from the HPDM bald-blocks investigation with Jacob; **Jacob dispatches.** Fresh-agent brief (identity + bounds below). Detail-home for the ROADMAP blocking-defect line; strike both together when it lands.

> ✅ **Every load-bearing claim re-checked 2026-07-31, ten days on — all still true.** `pickLuFromHash` is **live** (`tileGround.js:3079`, `return best || pickLuFromHash(...)`) · `derive.js:1020` still reads **only** `stl_parcels.json`, the line number unmoved · the County file **exists and is unread** (a **28 MB** `stlco_parcels.json` in HPDM's `raw/`) · `blockLandUse` is **0 entries** in *both* looks, so the authored escape hatch genuinely never fires · `luForRing` (`tileGround.js:3069`) behaves exactly as described: authored check → one interior point → hash.
>
> ⚠️ **Serialization is CLEAR as of 2026-07-31 night.** The A03/A06 agent was in `src/lib/tileGround.js` and has handed back with a clean tree. **Re-confirm nobody is in `derive.js` or `tileGround.js` before you start** — this brief rewrites the land-use join in both.

**Agent: FRESH.** The forensic below replaces the discovery; there is no prior session-context worth inheriting. ⚠️ **Serialize against anything touching `cartograph/derive.js` or `src/lib/tileGround.js`** — this brief rewrites the land-use join in both (`feedback_load_bearing_files_serial_dispatch`). ⚠️ **`derive.js` is the 4,607-line god-file whose `deriveLayers()` is a single ~3,465-line function (ROADMAP C9a).** You are making a *surgical* change inside it, **not** the decomposition refactor — that is a separate, deliberate, eye-gated arc. Do not start it.

**You are replacing a random number generator with real data.** For the majority of blocks in both shipped neighborhoods, the land use that drives grass colour, treelawn colour and tree placement is not derived from anything — it is invented by a weighted hash. The data needed to do it properly is, for the most part, already fetched and sitting on disk unread.

> ⛔ **Before you write code, run the routing gate in `CLAUDE.md`** — `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon. At minimum read `cartograph/INTAKE.md` (provenance SSOT), `cartograph/SECTION.md §2` (what LU *is* — the flooded remainder), `cartograph/RIBBONS.md §1` (the derivation chain), and `cartograph/lu-policy.mjs` (landed 2026-07-21 — the soft/hard policy layer that sits **downstream** of you). **Do not rebuild the model from grep.** Cite what you read.

---

## 1. The finding

Jacob, looking at the HPDM render: *"we have whole areas which have no trees (or grass) because they look to be mismarked or something"* — then, at a large green area rendered as hardscape: **"The verdant greenbelt is *not* 'Vacant'."**

He was right, and it is worse than mismarking. **Nothing ever classified it.**

`luForRing` (`src/lib/tileGround.js:2793`) decides a whole block's land use from **one interior point** tested against parcel faces. If that point misses — which is what happens on large campus, park and greenbelt blocks that aren't parcelled like houses — it falls through to `pickLuFromHash` (`src/lib/buildBlockGeometryV2.js`), whose own comment reads:

```js
// Weighted random LU palette for unauthored blocks. Distribution tuned to
// read as "a real neighborhood with anomalies" — residential dominant,
// commercial secondary, edge cases sparse. Sums to 100.
const LU_WEIGHTS = [
  ['residential', 50], ['commercial', 15], ['vacant', 8],
  ['vacant-commercial', 5], ['parking', 7], ['institutional', 5],
  ['recreation', 7], ['industrial', 3],
]
```

The greenbelt rolled `vacant` at 8%. And because `commercial`+`parking`+`industrial` = **25%**, a quarter of all unmatched blocks roll hardscape → no trees, no grass, grey.

**The authored escape hatch never fires.** `luForRing` checks `blockLandUse[bk]` first, but `blockLandUse` is **0 entries in both `public/looks/lafayette-square/design.json` and `public/looks/hipointe-demun/design.json`** (verified 2026-07-21). Nothing overrides the hash anywhere.

### Measured (2026-07-21)

| scene | blocks with INVENTED land use | share of area |
|---|---|---|
| **lafayette-square** (production) | 54/87 (62%) | 42% |
| **hipointe-demun** | 103/180 (57%) | 62% |

*Approximate — centroid stands in for `ringInteriorPoint`; the magnitude is not in doubt, and the `blockLandUse` = 0 finding is exact. **Re-measure properly as your first step** (see §5).*

### Why this is more than a render bug

`ORIENTATION.md` and `cartograph/FEATURES.md` both lead with **"the inputs are real, not guessed… a generic 3D map extrudes a default city; ours is grounded in the actual record, block by block."** Land use is currently the counter-example, and it is live on `lafayette-square.com`. Either the code becomes true to the claim (this brief) or the claim gets corrected — the two-way punchlist in `ACCORDANCE-REVIEW.md`. **We are doing the former.**

---

## 2. The root cause for HPDM — one unread file

`cartograph/derive.js:1020`:

```js
const parcelPath = join(RAW_DIR, 'stl_parcels.json')
```

It reads **only the City file.** The comment immediately below says *"Parcels are St. Louis City/County only"* — the author believed both were covered. They are not.

`raw/stlco_parcels.json` — **14,597 St. Louis County parcels** — is fetched (`scripts/03b-fetch-stlco-parcels.py`), reprojected (`cartograph/reproject-raw.js:72`), and read by `cartograph/bake-content.js:141`. **It is never opened by the code that builds land-use faces.**

**HPDM spans the City/County line. DeMun is in the County.** That is the entire bald half.

```
raw/stl_parcels.json     8,806   (City)   → read by derive.js
raw/stlco_parcels.json  14,597   (County) → IGNORED by derive.js
clean/map.json           2,340 parcels
```

### ⚠️ The taxonomies differ — reading the file is NOT enough

| | codes | most common |
|---|---|---|
| **City** | 4-digit | `1110` ×4605, `1115` ×878, `1010` ×774, `5000` ×518 |
| **County** | 3-digit | `110` ×11392, `115` ×1782, `910` ×460, `601` ×126 |

`derive.js`'s mapper is City-only (`c >= 1010 && c <= 1019 → 'vacant'`, `c >= 1300 && c <= 1399 → 'institutional'`, …). County `110` — 11,392 residential parcels — falls through **every** range. Naively unioning the files maps the entire County half wrong, which is worse than today because it would look plausible.

**`cartograph/bake-content.js` (~line 300+) already has county-aware code handling. Read it and reuse its mapping rather than inventing a second one** (`BOZ.md §3` — one home per fact). If the two mappers must stay separate, say so explicitly in a comment at both sites.

---

## 3. What to build — a ladder, phased

Jacob's framing. Each rung is a *better* source than the one below; fall down the ladder, never to a hash.

### Phase 1 — County parcels (do this first; it may be most of the fix)
1. `derive.js` reads **both** parcel files, jurisdiction-tagged.
2. Jurisdiction-aware code→LU mapping (reuse `bake-content.js`).
3. Re-pour + re-bake HPDM. **STOP. Eye-gate with Jacob before Phase 2.**

Phase 1 is independently valuable and independently verifiable. It may clear most of the grey on its own. **Do not roll it into Phase 2.**

### Phase 2 — Delete the hash
4. **Area-weighted join, not a point sample.** A block's LU = the dominant parcel use *by overlap area*. A 211,000 m² block currently gets one probe. (Largest HPDM tile: 520,409 m².)
5. **No overlapping parcel → `unknown`**, never an invented plausible class.
6. **Delete `pickLuFromHash` from the live path.** Leave the function only if something else imports it — check, and if nothing does, delete it outright (`feedback_remove_functionality_excise_knobs_wiring_docs`: knobs *and* wiring *and* docs).
7. Make a gap read as a gap: `unknown` should be plantable and neutral-green, so missing data looks missing rather than paved. **Coordinate the colour with Jacob — palette is Stage/look authoring, his call, not yours.**

### Phase 3 — Building-derived LU (the portable rung; **sequence AFTER Phases 1–2 land and are eye-gated** — do not begin it in the same pass)
Jacob's idea, and the right answer for the kit: **parcels are a US-municipal luxury; buildings are global.** Łódź has no assessor.

- Validated: `centrum` (OSM-sourced) carries rich tags — `apartments` ×694, `office` ×49, `retail` ×39, `garages` ×42, `university` ×17, `school` ×16, `commercial` ×12, plus `amenity=place_of_worship|restaurant|townhall|theatre`.
- ⚠️ **HPDM cannot use this today.** Its buildings are Microsoft ML footprints — `building=yes` on all 1,281, no semantics — and its `raw/osm.json` is **empty (0 elements)**. A tagged-building path for HPDM needs an OSM re-fetch + spatial join onto the MSBF geometry. Scope that separately; do not silently re-fetch.
- **A block with no buildings at all is open land** → soft/green. A verdant greenbelt *is* the absence of buildings. That is signal, not a gap.

---

## 4. What is already done — do NOT redo

**`cartograph/lu-policy.mjs` landed 2026-07-21.** It is the soft/hard policy layer *downstream* of you: which LU classes are plantable, per-scene overridable, with an unrecognized class defaulting **plantable-and-loud** rather than silently hardscape, plus `checkLuVocabulary()` as the detector. `forbidden-surface.mjs` consumes it; `PLANTABLE_LU` is now a derived view, not the policy.

**Your job is to give it correct classes to act on.** Do not widen the allow-list to paper over a bad join — that is the symptom-patch this brief exists to replace.

It already earned its keep: the detector caught `median` (the emergent divided-road face, in neither the parcel data nor `bake-ground.js`'s vocabulary) worth 2,709 HPDM trees. **`median` is flagged for Jacob's eye — it may over-plant narrow strips. Do not treat it as settled.**

HPDM's trees were re-baked at 8,383 (from 4,335) against the widened policy. **Your re-bake supersedes that number; expect it to move.**

---

## 5. Definition of done

- [ ] **First: re-measure the invented-LU share properly**, using `ringInteriorPoint` (not centroid), on both scenes. Report before/after. If the real number is far off 62%/57%, say so loudly and re-scope before building.
- [ ] Phase 1 lands; HPDM re-poured + re-baked; **Jacob's eye on the render** — the DeMun half carries real land use and the greenbelt is green.
- [ ] Phase 2 lands; `pickLuFromHash` is out of the live path; invented-LU share is ~0 where parcel data exists, and honestly `unknown` where it doesn't.
- [ ] **LS is re-baked ONLY with Jacob's explicit go-ahead.** It is eye-gated production and this change moves ~62% of its blocks. Surface the diff; do not ship it on your own judgement.
- [ ] The claim in `ORIENTATION.md` / `cartograph/FEATURES.md` is now true, or a note is filed in `ACCORDANCE-REVIEW.md` saying which part still isn't.
- [ ] `cartograph/DOC-CODE-COHERENCE.md` gets the `derive.js:1021` comment corrected (it claimed City/County; it was City-only).

**DoD is Jacob's eye on the real render, never a proxy** (`feedback_proxy_render_is_not_the_operator_eye`). A tree-count or a percentage is evidence, not a gate.

---

## 6. Bounds — what NOT to do

- ⛔ **Do not decompose `deriveLayers()`.** Surgical change only (ROADMAP C9a is its own arc).
- ⛔ **Do not re-bake LS without Jacob's say-so.** Production, eye-gated, ~62% of blocks affected.
- ⛔ **Do not recolour the Look.** The LU palette is Stage authoring — Jacob's call.
- ⛔ **Do not widen `PLANTABLE_LU` / `lu-policy.mjs`** to make blocks green. Fix the join.
- ⛔ **Do not re-fetch OSM for HPDM** as a side effect of Phase 3. Scope it, surface it, then ask.
- ⛔ **Do not `git restore public/baked/**`** — the working tree is generally the more correct one, and a re-bake is cheaper than a lost artifact. (Boz clobbered an uncommitted HPDM `trees.json` this way on 2026-07-21; recoverable only because it was reproducible.)
- **Surface scope drift** the moment you find this is bigger than described (`feedback_surface_scope_drift`).

---

*Drafted 2026-07-21 (Boz + Jacob) from the HPDM bald-blocks investigation. Sits downstream of `cartograph/lu-policy.mjs` (landed same day). Detail-home for the ROADMAP line; strike both together when it lands.*
