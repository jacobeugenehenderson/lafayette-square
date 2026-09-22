<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node checks/claims-a-brief-declares-how-it-dies.mjs --list will call this DONE on the
  level-body check, and that is now GREEN — ⛔ but §4 (audit every acquisition note for the same
  overstatement, and report the count) has NOT been done, and that was Jacob's explicit ask. This
  brief dies when §4's audit is reported, not when the ingest works.
-->

# BRIEF — THE GOOD ELEVATION EXISTS AND THE PIPELINE CANNOT READ IT

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ WHAT PROVOKED IT — and the operator's eye beat the data
> Jacob, describing his own town: *"when you walk out Francesca's back door when you get to the big
> rock wall it's a drop from her yard to the water"* — **15–20 ft, in many places.**
>
> ### ⛔⛔ RE-SCOPED 2026-09-21 — THE PROVOKING MEASUREMENT WAS WRONG, AND THE REAL DEFECT IS BETTER
> This brief opened on *"the elevation we baked does not contain it — a 2 ft rise over 200 feet, no
> wall at all."* **That is false**, re-derived from the same shipped artifact the morning after it
> was written. The bank IS in the bake, at close to full height.
> ▶ `node scratch/huron-shore-transect/bake-gradient.mjs` · the excised text and the lesson:
> `cartograph/_archive/shore-wall-absent-premise-FALSE-2026-09-21.md`
>
> ⭐⭐ **WHAT IS ACTUALLY WRONG IS THE WATERLINE, NOT THE BANK — and that is a stronger reason to
> want 1 m, not a weaker one.** Two things, both measured, both new:
> 1. **The lake has more than one surface in our own heightfield.** `bake-terrain` normalizes to
>    local-min = 0 and `BakedGround` reasons that on a lakeshore town the local minimum IS the lake.
>    huron's 10 m source carries Lake Erie hydro-flattened at several elevations, so the minimum
>    lands on the wrong patch and the drawn lake sits below its own bed over most of its area.
>    ▶ `node checks/claims-a-level-body-has-one-surface.mjs` — **RED on huron today.**
> 2. **A 10 m cell straddling the shore averages land and water, so the shore edge stands proud of
>    its own lake.** The 1 m lidar puts the land AT the water, which is what a shoreline is.
>    ▶ `node scratch/huron-shore-transect/two-sources.mjs`
>
> ⇒ **The payoff §3 demanded is therefore ANSWERED, and it is not "recover a missing bank".** It is
> *the water's edge is in the wrong place, vertically and horizontally* — and everything we ever
> put on a shore (revetment, dock, beach, waterline band) inherits that error and makes it
> permanent.
>
> ### ✅ THE INGEST LANDED 2026-09-21. **`node checks/claims-a-level-body-has-one-surface.mjs` IS GREEN.**
> `bake-terrain` now reads **several** tiles, in **lat/lon or UTM** (the CRS off the tile's own
> GeoKeys, refusing any EPSG it cannot name), at the **overview level matching the output grid**, and
> from **URLs by HTTP range request** — ⭐ huron bakes from 1 m lidar in ~6 s with **nothing
> downloaded**. The datum derives to the same 174.44 m from the 1 m source as from the 10 m one, now
> with **98.7%** of the body agreeing instead of 32.7%.
> | | 10 m source | 1 m source |
> |---|---|---|
> | lake bed spread (IQR) | 1.174 m | **0.000 m — one surface** |
> | shoreline seam, median | 0.56 m | **0.44 m** |
> | datum agreement | 32.7% | **98.7%** |
> ⛔ **What is still OPEN is §4**, and it is the half Jacob asked for by name: audit every other
> `acquisition` note for the same overstatement and **report the count**. The elevation row itself is
> rewritten; the others are not. ⭐ **`BRIEF-boulder-revetment` is UNBLOCKED.**

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.**

## 3. ⭐⭐ THE DATA EXISTS. WE FETCHED THE COARSE ONE.

We acquired **USGS 3DEP 1/3 arc-second — ~10 m per sample.** Queried today against huron's bbox via
the TNM Access API, **1-metre lidar also covers it:**
⇒ ⭐ **~100× the sample density**, and a shore edge ~2 samples wide at 10 m is ~20 at 1 m.
⛔ **DO NOT TRUST A TILE LIST WRITTEN INTO A DOC — this one was already wrong.** It named two tiles;
the re-query on 2026-09-21 returns **four** (huron straddles both axes), ~940 MB in total. ▶ Re-query
every time, and read the count off the result:
`curl "https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=<W,S,E,N>"`

### ⛔ THREE REASONS THE PIPELINE CANNOT INGEST IT TODAY
1. **FOUR TILES — the brief said two and the API says four.** `bake-terrain` reads **one**
   `raw/elevation.tif`. ⚠️ The straddle *warning* added 2026-09-20 (`5ab6e555`) fires for 1°×1°
   naming and **does not mosaic** — it tells you one file cannot cover you and stops. ⭐ Derive the
   tile set from the bbox; never carry a list.
2. ⛔⛔ **A DIFFERENT COORDINATE SYSTEM.** *"1 Meter 17"* is **UTM zone 17N — metres, not degrees.**
   `bake-terrain` reads `image.getOrigin()` / `getResolution()` and treats them as lon/lat. ⭐ The
   containment check added today would **correctly refuse** a UTM tile (its extent will not contain a
   lat/lon bbox) — **so it fails safe, loudly, rather than baking nonsense. Verify that before you
   change anything: it is the check earning its keep, not a bug.**
3. **Volume — and this one is SMALLER than it looks.** ⭐ **Measured 2026-09-21: the tiles never
   have to land on disk.** `geotiff`'s `fromUrl` does HTTP range reads against the USGS S3 bucket and
   pulls an arbitrary window in about a second; every measurement in `scratch/huron-shore-transect/`
   was taken that way, against all four tiles, with nothing downloaded. ▶ Establish whether the BAKE
   can read the same way before designing an acquisition-and-mosaic step for ~940 MB.
   ⚠️ Still open and unchanged: the 5 m output grid is already 2,064,969 samples / 8 MB, so **decide
   what output resolution is wanted** rather than assuming 1 m in ⇒ 1 m out.

### ✅ THE PAYOFF IS ESTABLISHED — 2026-09-21, and it came out the third way
This section used to say *"pull one tile by hand, measure whether a 15–20 ft rise is actually there,
and say so either way."* **Done.** Neither branch it offered was right:
- The rise **is** there, on the lidar AND in the shipped 10 m-sourced bake, which agree closely on the
  bank's HEIGHT. So this brief is not recovering a missing landform.
- What 1 m buys is the **EDGE**: the bank climbs in a couple of metres on the lidar and takes ten to
  fifteen on the bake, and the coarse cell pushes the waterline itself up and inland.
⇒ ⭐ **`BRIEF-boulder-revetment` moves from *"invent a missing edge"* to *"decorate an edge that
exists"* — its own second branch — and the stone stops having to carry terrain shape.**
▶ `node scratch/huron-shore-transect/shore2.mjs` (the shore, both sources) ·
  `node scratch/huron-shore-transect/profiles.mjs` (the cross-sections, printed) ·
  `node scratch/huron-shore-transect/walls.mjs` (every tagged wall feature)

## 4. ⛔⛔ THE SECOND HALF, AND JACOB ASKED FOR IT EXPLICITLY — **THE INTAKE ROW SHOULD HAVE WARNED US**

> *"we need to improve the docs and the inputs and intake so that we can have already covered these
> 'will be needed' steps ahead of time."*

`cartograph/intake-rows.mjs:310-320`, the entire elevation row's acquisition guidance:
```js
acquisition: { kind: ACQUIRE.SOURCE, note: 'USGS 3DEP for the US; any GeoTIFF elsewhere' },
// Verified 2026-07-20: bake-terrain.js is source-agnostic — it samples ANY
// GeoTIFF against the scene geography.
```
⛔⛔ **"SOURCE-AGNOSTIC — ANY GEOTIFF" IS FALSE, AND TODAY DISPROVED IT THREE TIMES.** The reader
assumes **degrees**, **one tile**, and a **lat/lon origin**. ⭐ That is `CLAUDE.md`'s smell detector
exactly: **a doc that OVERSTATES the code is a bug lying in the open** — and it is why nobody knew any
of this until they walked into it, one wall at a time.

### ⭐ WHAT AN INTAKE ROW OWES A PERSON — the general fix, not just this row
An acquisition note that says only *where to get it* has answered the easy question. ▶ **It must
carry the DECISION POINTS the operator will hit**, because every one of these cost real time today:
| owed | today's cost |
|---|---|
| **WHICH RESOLUTION, and what it buys** | we took 10 m without knowing 1 m existed; lost the WATER'S EDGE (not the bank — see the re-scope) |
| **HOW THE TILE IS CHOSEN** | hardcoded to LS's `n39w091` until `5ab6e555` |
| **WHETHER A TOWN CAN STRADDLE TILES** | discovered by the API returning several — and the count written down here was itself wrong |
| **WHICH CRS THE READER ACCEPTS** | discovered by reading the code, after downloading |
| **WHAT THE CODE ACTUALLY REQUIRES** vs what the row claims | the false "any GeoTIFF" |

⛔ **Do NOT fix only the elevation row.** ▶ **Audit every `acquisition` note in `intake-rows.mjs`
against its consumer and ask: does this promise more generality than the code delivers?** ⭐ Elevation
is the one we caught. **Report how many others make the same shape of claim** — that count is the
real deliverable of §4, and it may be the more valuable half of this brief.
⚠️ **And prune while you are there** (`CLAUDE.md`): a row that gains decision points should lose
whatever prose it carries that a command could answer instead.

## 5. ⛔ Can the instrument SEE the change?
✅ **The one that matters now EXISTS and is RED**, written 2026-09-21 with the re-scope:
▶ `node checks/claims-a-level-body-has-one-surface.mjs` — *a water body is a level surface, so the
heightfield beneath it must be ONE surface and the drawn mesh must sit on it.* Its tolerance is the
coplanar stack, read out of `bake-ground.js`; it carries its own mutation test because huron is the
only town with water and nothing in the corpus can show it going green.
▶ **Still worth writing:** *the baked step size matches what the source can actually support* — a 1 m
source resampled to a 5 m grid throws away 96% of what was fetched, silently.
⚠️ **AND MUTATION-TEST THE UTM REFUSAL** — feed a UTM tile, prove it refuses by name. That check
exists as of `5ab6e555` and has never been exercised against a real UTM file.
**Eye-gate:** huron's shoreline in Hero, ⛔ **against the current bake as the control.** ⚠️ The question
is NOT "does the bank appear" — it is in both. It is **does the land meet the water**, which is what
Jacob was looking at on 2026-09-21 ("gashes in the seam") and what the check above measures.

## 6. Write/commit bounds
**In bounds:** `cartograph/bake-terrain.js` (multi-tile + CRS + **the water datum**) · a mosaic/reproject
acquisition step · `cartograph/intake-rows.mjs` (the row AND the audit) · `cartograph/INTAKE.md` · the checks.
⭐ **The water datum is explicitly yours now:** normalizing to local-min is what seats the lake, and it is
wrong when the source carries the body at more than one elevation.
⛔ **OUT:** the boulder revetment (`BRIEF-boulder-revetment.md` — it WAITS on your answer) · the water
shader · `V_EXAG`/`terrainExag` (that is `BRIEF-ls-bleed-excision` site 15).
⚠️ **huron is the only safe town to re-bake terrain on.** ⛔ LS, HPDM and altadena have working
terrain from the coarse source; **re-fetching theirs is a separate decision and not yours.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. ✅ **The transect is measured and the payoff is stated** (2026-09-21, above). It is the EDGE, not the bank.
2. huron bakes from 1 m lidar — four tiles, correct CRS — and **`node checks/claims-a-level-body-has-one-surface.mjs` goes green**, which is the falsifiable form of "the water's edge is in the right place".
3. The elevation row tells the next person **resolution, tiling, CRS and what the reader truly accepts.**
4. ⭐ **Every other `acquisition` note is audited for the same overstatement, and the count is reported.**
5. The UTM refusal has been **seen to fire** against a real UTM file.

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON *(Jacob, 2026-09-20)*
>
> ⛔ **"Does it look good" is not an eye-gate.** A first pour being ugly is fine and expected; do not
> tune. ▶ **The gate is: is the element PRESENT and CORRECT** — does it arrive, is it seated, did the
> count change. ⛔ **The one exception is the real risk here:** a WRONG element that looks PLAUSIBLE —
> *"the map is lying and nothing says so."* ⭐ **This brief is entirely inside that exception.** Land
> that does not meet its water looks like a bank; it renders beautifully and it is false.
>
> *(The gate's second half — "state the parameters this feature needs authored" — does not apply:
> terrain has no authored parameters and this brief must not invent any. Its full text, and the
> answer to it, are in `BRIEF-boulder-revetment.md`, which is where the question was live.)*
