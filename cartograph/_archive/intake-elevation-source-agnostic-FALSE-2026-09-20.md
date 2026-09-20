# DIARY — "bake-terrain is source-agnostic — ANY GeoTIFF" was never true

*Excised from the live corpus 2026-09-20. Kept because a WRONG VERIFICATION is a lesson, and
because the sentence had been read and trusted for two months.*

## The text, verbatim, as it stood

`cartograph/intake-rows.mjs`, the elevation row:
```js
// Verified 2026-07-20: bake-terrain.js is source-agnostic — it samples ANY
// GeoTIFF against the scene geography. USGS appears only in comments and an
// error string. ⚠️ The no-data sentinel IS USGS-specific and wants checking
// per source (`BRIEF §5.6`).
acquisition: { kind: ACQUIRE.SOURCE, note: 'USGS 3DEP for the US; any GeoTIFF elsewhere' },
```
The same claim also stood in that file's **header example** (*"obtained from any GeoTIFF"*) and — worst
— on the **operator-facing Sources panel**, `SourcesPanel.jsx`, as a named source:
`{ name: 'any GeoTIFF', note: 'the reader is source-agnostic' }`.

## Why it is false — three ways, all found on one day

`bake-terrain.js` requires **ONE tile, in LAT/LON, covering the scene**:
1. **One file.** It opens a single `raw/elevation.tif`. Nothing mosaics. Huron straddles two 1 m tiles.
2. **Degrees.** It reads `image.getOrigin()` / `getResolution()` as lon/lat. Every USGS **1 metre**
   product is **UTM** — metres. A UTM tile is refused by the containment gate added the same day.
3. **Coverage.** Before `5ab6e555` the pixel window was CLAMPED (`Math.max(0,…)`/`Math.min(tifW,…)`),
   so a wrong-region tile did not error — it baked the tile's edge pixels. The acquire instruction
   *also* hardcoded Lafayette Square's tile (`n39w091`), so following the tool's own advice put
   **St. Louis's terrain into an Ohio lakeshore town, silently.**

## ⭐ What the wrong verification cost, concretely

The row said only *where* to get it. It never said **which resolution**, and nobody knew a choice
existed. We fetched **1/3 arc-second, ~10 m** — which smooths anything narrower than ~20 m.

Jacob, describing his own town: *"when you walk out Francesca's back door when you get to the big
rock wall it's a drop from her yard to the water"* — **15–20 ft.** Measured across all 2,064,969
samples of the resulting bake, mean elevation walking inland from the waterline:

```
 5 m inland  0.9 ft      30 m inland  1.5 ft      60 m inland  2.3 ft
```

⛔ **A 2 ft rise over 200 feet. The seawall is not smeared — it is absent.** USGS **1 m** lidar covers
the same ground (`OH_Statewide_Phase1_2019_B19`, two tiles) at ~100× the density, and the kit cannot
ingest it. ⇒ `docs/briefs/BRIEF-terrain-resolution.md`.

## ⭐⭐ The lesson, which is why this file exists

**A doc that OVERSTATES the code is a bug lying in the open** (`CLAUDE.md`'s smell detector). This one
was stamped **"Verified"** with a date, which is what made it durable: a reader who checks the receipt
finds a receipt, and stops. **The verification was real and it asked the wrong question** — it checked
whether *USGS* appeared in the code, found it only in comments and an error string, and concluded the
reader was general. ⛔ **Absence of a vendor name is not evidence of generality.**

⇒ **An `acquisition` note that says only WHERE to get a thing has answered the easy question.** It owes
the DECISION POINTS the operator will hit: resolution and what it buys · how the tile is chosen ·
whether a town can straddle · which CRS the reader accepts · and what the code actually requires
versus what the row claims. **Every one of those cost real time on 2026-09-20.**

⚠️ **And elevation is only the row we caught.** Auditing every other `acquisition` note for the same
shape of overstatement is the open half of `BRIEF-terrain-resolution.md §4`.
