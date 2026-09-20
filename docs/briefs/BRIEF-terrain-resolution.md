<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node cartograph/bake-terrain.js --scene=huron && node -e "const t=require('./cartograph/data/huron/clean/terrain.json');process.exit(t.stepX<=2?0:1)"
-->

# BRIEF — THE GOOD ELEVATION EXISTS AND THE PIPELINE CANNOT READ IT

*Written 2026-09-20 by the coordinator seat.*

> ### ⭐ WHAT PROVOKED IT — and the operator's eye beat the data
> Jacob, describing his own town: *"when you walk out Francesca's back door when you get to the big
> rock wall it's a drop from her yard to the water"* — **15–20 ft, in many places.**
>
> **The elevation we baked does not contain it.** Measured across huron's 2,064,969 samples, mean
> elevation walking inland from the waterline:
> ```
>  5 m inland   0.9 ft        30 m inland   1.5 ft        60 m inland   2.3 ft
> ```
> ⛔ **A 2 ft rise over 200 feet.** Not a smeared wall — **no wall at all.**

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.**

## 3. ⭐⭐ THE DATA EXISTS. WE FETCHED THE COARSE ONE.

We acquired **USGS 3DEP 1/3 arc-second — ~10 m per sample.** Queried today against huron's bbox via
the TNM Access API, **1-metre lidar also covers it:**
```
USGS 1 Meter 17 x36y459  OH_Statewide_Phase1_2019_B19   GeoTIFF  212 MB
USGS 1 Meter 17 x37y459  OH_Statewide_Phase1_2019_B19   GeoTIFF   87 MB
```
⇒ ⭐ **~100× the sample density.** A 15–20 ft bank is **~2 samples wide at 10 m and ~20 at 1 m** —
the difference between invisible and crisp. ▶ Re-query; do not trust this listing:
`curl "https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=<W,S,E,N>"`

### ⛔ THREE REASONS THE PIPELINE CANNOT INGEST IT TODAY
1. **TWO TILES.** huron straddles `x36y459` and `x37y459`. `bake-terrain` reads **one**
   `raw/elevation.tif`. ⚠️ The straddle *warning* added today (`5ab6e555`) fires for 1°×1° naming and
   **does not mosaic** — it tells you one file cannot cover you and stops.
2. ⛔⛔ **A DIFFERENT COORDINATE SYSTEM.** *"1 Meter 17"* is **UTM zone 17N — metres, not degrees.**
   `bake-terrain` reads `image.getOrigin()` / `getResolution()` and treats them as lon/lat. ⭐ The
   containment check added today would **correctly refuse** a UTM tile (its extent will not contain a
   lat/lon bbox) — **so it fails safe, loudly, rather than baking nonsense. Verify that before you
   change anything: it is the check earning its keep, not a bug.**
3. **Volume.** 299 MB of source at 1 m over a 7.2 km span. ⚠️ The 5 m output grid is already
   2,064,969 samples / 8 MB; **decide what output resolution is actually wanted** before assuming
   1 m in ⇒ 1 m out.

⚠️ **AND ESTABLISH THE PAYOFF BEFORE BUILDING THE INGEST.** ⛔ Do not assume the wall appears. ▶ Pull
one tile by hand, sample a transect across Francesca's stretch of shore, and **measure whether a
15–20 ft rise is actually there.** ⭐ If it is, this brief is worth its cost and `BRIEF-boulder-revetment`
changes from *"invent a missing edge"* to *"decorate an edge that exists."* **If it is NOT, say so —
that is a finding, and it means huron's shore is genuinely low and the wall is a structure to place,
not a landform to recover.**

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
| **WHICH RESOLUTION, and what it buys** | we took 10 m without knowing 1 m existed; lost the shore |
| **HOW THE TILE IS CHOSEN** | hardcoded to LS's `n39w091` until `5ab6e555` |
| **WHETHER A TOWN CAN STRADDLE TILES** | discovered by the API returning two |
| **WHICH CRS THE READER ACCEPTS** | discovered by reading the code, after downloading |
| **WHAT THE CODE ACTUALLY REQUIRES** vs what the row claims | the false "any GeoTIFF" |

⛔ **Do NOT fix only the elevation row.** ▶ **Audit every `acquisition` note in `intake-rows.mjs`
against its consumer and ask: does this promise more generality than the code delivers?** ⭐ Elevation
is the one we caught. **Report how many others make the same shape of claim** — that count is the
real deliverable of §4, and it may be the more valuable half of this brief.
⚠️ **And prune while you are there** (`CLAUDE.md`): a row that gains decision points should lose
whatever prose it carries that a command could answer instead.

## 5. ⛔ Can the instrument SEE the change?
✅ **Yes, and it is unusually clean:** `clean/terrain.json` records the grid and step; the bake prints
`elevation range … misses filled: N`.
▶ **The check worth writing:** *the baked step size matches what the source can actually support* —
⛔ a 1 m source resampled to a 5 m grid is throwing away 96% of what was downloaded, silently, and
nothing says so today.
⚠️ **AND MUTATION-TEST THE UTM REFUSAL** — feed a UTM tile, prove it refuses by name. That check
exists as of `5ab6e555` and has never been exercised against a real UTM file.
**Eye-gate:** huron's shoreline in Hero, ⛔ **against the 10 m bake as the control** — the question is
whether the bank appears, and only a before/after answers it.

## 6. Write/commit bounds
**In bounds:** `cartograph/bake-terrain.js` (multi-tile + CRS) · a mosaic/reproject acquisition step ·
`cartograph/intake-rows.mjs` (the row AND the audit) · `cartograph/INTAKE.md` · the new check.
⛔ **OUT:** the boulder revetment (`BRIEF-boulder-revetment.md` — it WAITS on your answer) · the water
shader · `V_EXAG`/`terrainExag` (that is `BRIEF-ls-bleed-excision` site 15).
⚠️ **huron is the only safe town to re-bake terrain on.** ⛔ LS, HPDM and altadena have working
terrain from the coarse source; **re-fetching theirs is a separate decision and not yours.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. The transect is measured and **the payoff is stated either way, before the ingest is built.**
2. If it pays: huron bakes from 1 m lidar — multi-tile, correct CRS — and **Francesca's wall is in the heightfield.**
3. The elevation row tells the next person **resolution, tiling, CRS and what the reader truly accepts.**
4. ⭐ **Every other `acquisition` note is audited for the same overstatement, and the count is reported.**
5. The UTM refusal has been **seen to fire** against a real UTM file.
