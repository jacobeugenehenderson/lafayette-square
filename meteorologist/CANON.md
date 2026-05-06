# Teapot canon — what's in, what's out, why

The initial preset library at `public/clouds/presets.json`. Sourced from the WMO International Cloud Atlas (https://cloudatlas.wmo.int) plus practical fog/haze and v1.x precipitation stubs.

**Total: 52 entries.**
- 38 cloud presets (the 10 WMO genera × visually-distinct species)
- 4 fog/haze presets
- 1 `clear_sky` marker
- 9 v1.x stubs (rain ×4, snow ×3, lightning ×2)

## Inclusion principle

**One preset per visually-distinct archetype.** Where a WMO species changes the cloud's silhouette materially, it gets its own preset. Where two varieties differ only in opacity/density (e.g. translucidus vs. opacus) they each get one because that distinction matters at a Hero-shot scale and the Almanac dispatches on it. Where a variety is a layout pattern (radiatus, undulatus, intortus, vertebratus) it's a `modifiers` flag on the parent, NOT a separate preset — those are layered compositionally in the shader rather than authored as new morphologies.

**TOD lighting is NOT a preset axis.** No `cumulus_sunset_warm` or `cirrus_dawn_pink`. The Almanac directive's `sun` and `lightDome` blocks handle TOD on top of any cloud preset — same morphology, different sun. Doubling the canon for TOD would be combinatorial waste.

## What's in (by altitude band)

### High clouds (5–13 km)
- **Cirrus**: fibratus, uncinus, spissatus, castellanus, floccus
- **Cirrocumulus**: stratiformis (mackerel), lenticularis, floccus, castellanus
- **Cirrostratus**: fibratus, nebulosus, duplicatus

### Mid clouds (2–7 km)
- **Altocumulus**: stratiformis, lenticularis, castellanus, floccus, translucidus, opacus, lacunosus
- **Altostratus**: translucidus, opacus

### Mid-low
- **Nimbostratus** (no species — single rain-bearing sheet)

### Low clouds (0–2 km)
- **Stratocumulus**: stratiformis, castellanus, lenticularis, perlucidus, opacus, volutus (roll)
- **Stratus**: nebulosus, fractus (scud), opacus

### Convective (vertical)
- **Cumulus**: humilis, mediocris, congestus, fractus
- **Cumulonimbus**: calvus (no anvil), capillatus (with anvil), mammatus (with pouches)

### Surface / atmospheric
- `fog_ground`, `fog_valley`, `haze_summer`, `haze_smoke`
- `clear_sky` (marker; coverage 0)

### v1.x stubs (`enabled: false`)
- `rain_light`, `rain_moderate`, `rain_heavy`, `rain_squall`
- `snow_calm`, `snow_heavy`, `snow_blizzard`
- `lightning_intracloud`, `lightning_cloud_ground`

## What's out (and why)

| Excluded | Reason |
|---|---|
| `*_radiatus` (parallel streets) | Layout pattern, becomes a shader modifier on the parent |
| `*_undulatus` (rippled) | Layout pattern, modifier |
| `*_intortus`, `*_vertebratus` | Cirrus-specific layout, modifiers |
| `cirrus_radiatus` | Pattern not morphology |
| Most `_duplicatus` (two-layer) | Almanac can directly stack two presets in a directive blend; preset duplication for "two of these" is redundant. Kept `cirrostratus_duplicatus` as a single example. |
| `_perlucidus` for Ac | Visually similar to translucidus at altitude; collapsed |
| `cumulonimbus arcus` (shelf cloud) | Modifier on Cb (`arcus` is in the schema's modifier enum) |
| `funnel cloud / tuba` | Modifier (`tuba`) |
| TOD-flavored variants | Lighting is the directive's job; see "Inclusion principle" above |
| `_volutus` for As | Extremely rare; kept only `stratocumulus_volutus` |
| `pyrocumulus`, `homogenitus`, `silvagenitus` (special clouds) | Modifier flags reserved in schema; the underlying genus is what's authored |

## Modifier enum (in schema, layered by shader)

`incus`, `mamma`, `virga`, `praecipitatio`, `arcus`, `tuba`, `pileus`, `velum`, `pannus`, `fluctus`, `asperitas`, `cavum`, `cataractagenitus`, `flammagenitus`, `homogenitus`, `silvagenitus`.

Two presets in the Teapot carry modifiers as authored defaults: `cumulonimbus_capillatus` (`incus`) and `cumulonimbus_mammatus` (`incus`, `mamma`). The Almanac may override on a per-rule basis if needed (v1.x).

## Parameter conventions

All cloud presets carry the same 13 required params (see `pipeline/schema/preset.schema.json`). Notable conventions:

- **`baseAlt` reflects the cloud's altitude band**, not Hero camera FOV. The shader projects from world coordinates.
- **`thickness` up to 18 km** to accommodate real cumulonimbus. Most clouds are 200–2000 m.
- **`coverage`** is the *fraction of the slab volume that contains cloud*, not sky-fraction. A high-coverage cumulus preset is still spatially clumpy because of warp.
- **`warpAmp` ≥ 250 m → cauliflower lobing** (cumuliform character). `warpAmp ≤ 100 m` → smooth (stratiform character). This is the single biggest morphology lever after coverage.
- **`octaves` 4–6 for structured clouds, 2–3 for sheets**. Above 6 the phone shader will lag.
- **Lighting params (`sunScatter`, `edgeSilver`, `shadowStrength`, `ambientFloor`)** are tuned per-preset for the cloud's *intrinsic* character — thin clouds get high silver-lining, thick storms get high shadow-strength. Almanac TOD lighting layers atop these; doesn't replace them.

## How to revise

The values in `presets.json` are **first-pass scaffolds**. The Tuner is where they get tuned against the actual shader; expect every numeric to move. The IDs and overall roster are the contract — those are sticky once the Almanac references them. If you want to add or remove an entry, do it before the Almanac grows past trivial size.

## References

- WMO International Cloud Atlas: https://cloudatlas.wmo.int/en/clouds-genera.html
- WMO classification primer (genus / species / variety / accessory / supplementary feature): https://cloudatlas.wmo.int/en/classifications-of-clouds.html
