# Diary — INTAKE-CATALOGUE §0, the nine LS-bleed sites (as of 2026-07-20 … 2026-09-20)

Retired from the live catalogue 2026-09-25 (Wellhead). Every site is closed: 1–4 `b12627c8` · 5 ruled closed by Jacob (2026-09-20) · 6 `e688555c` · 7 `adc03f32` · 8 `1ffc64fa` + `8fd1bfcd` (legal by declaration) · 9 2026-09-20, completed by `3d29da6a` + `9a2f84c3`. The live register is `docs/briefs/BRIEF-ls-bleed-excision.md`.

## 0. ⛔ THE HEADLINE FINDING — the LS-bleed is the kit's systemic defect

Every domain found it independently, without being told the others existed. **Absence does not degrade
to nothing — it degrades to Lafayette Square.** That is a direct violation of the aspirational model
("the system just doesn't show them"): a bleed doesn't show a *missing* feature, it shows *someone
else's*.

**Nine verified sites** — full detail + the excision plan in **`docs/briefs/BRIEF-ls-bleed-excision.md`**.

| # | Site | What bleeds | Severity |
|---|---|---|---|
| 1 | `cartograph/bake-lamps.js:99` | LS's 80 lamps into any town with no lamp data | HIGH |
| 2 | `arborist/bake-trees.js:427` | LS's `park_census.json` — another town bakes LS's trees under its own name | HIGH |
| 3 | `arborist/bake-trees.js:430` | LS's species map — foreign species routed through a St-Louis collapse table | HIGH |
| 4 | `arborist/bake-trees.js:69,688` | **module-level, unconditional** — LS's lamp positions stamp `lampGlow` on **every tree of every scene**, evaluated in that scene's own frame. No override flag exists. Same file as #1, entering by a second independent door | MED (night-only, cosmetic) |
| 5 | `src/instance.js:47` | `INSTANCES[lookId] \|\| INSTANCES[DEFAULT_LOOK]` — an unregistered look silently wears LS's identity, geography, park label and tax rate. ⛔ **Worse than catalogued: it CASCADES INTO SIX RENDER SITES** (2026-07-21) | HIGH |

> ⛔ **Bleed #5 is not only an identity bleed — expanded 2026-07-21.** Six render gates test
> `INSTANCE.lookId === 'lafayette-square'`, so an unregistered look flips **all six at once**:
> `Scene.jsx:860` (the Gateway Arch) · `LafayettePark.jsx:848` (park lake, grotto, bridge, fence) ·
> `LafayettePark.jsx:803` (park title) · `StreetLights.jsx:74` (LS's 80 lamps) · `lampLightmap.js:23`
> (their baked pools) · `LafayetteScene.jsx:106` (LS's per-building overrides). Jacob previewed Łódź
> and found **the St. Louis Gateway Arch standing in it, over Lafayette Park's water**. Every gate was
> correct; the identity beneath them was wrong. Registering an instance file for that scene fixed it
> (`103d7224`) — which **proved the diagnosis** before the scene was excised and the file went with it
> (2026-09-19). ⚠️ **`altadena` and `toy` are still unregistered and still carry this** — `ls
> src/instances/` is the check, and it is the whole remaining population.
| 6 | `cartograph/pipeline/hydrate-anchor-cards.js:28` | **LS's latitude (38.616°N) → every town's sky.** See §3.0 | HIGH — **live and wrong on Łódź today** |
| 7 | `cartograph/bake-content.js:118` | *(FIXED `adc03f32`)* MSBF-only join → no OSM pour joined any geometry | — |
| 8 | `InfoModal.jsx` / `LegalPage.jsx` | LS prose + **State of Missouri governing law** rendered on a Polish deployment | HIGH — legal, not cosmetic |
| 9 | `bake-content.js#loadParcels` + `#loadLandUseCodes` | *(FIXED 2026-09-20)* **St. Louis FILENAMES in the reader** — `stl_parcels.json` / `stlco_parcels.json` / `county-land-use-codes.csv` — so every other town matched 0 parcels forever. The bleed was in the ACQUISITION path, which is why no render gate could catch it. Towns declare their wells now (`data/<scene>/sources.json`, `§4.2`); huron went **0% → 97%** parcel match with no code change | — |

**Recommended schema consequence** (Cambium): the manifest's absent-state column must be a hard
three-way — `honest-zero` / `documented-fallback` / **`⛔ LS-BLEED`**.

**The good pattern to copy**, already in-repo: `cartograph/tree-bake-inputs.mjs` returns `null` on a
missing census — *"an HONEST ZERO, not an error"* — and `bake-trees.js:408` defaults `heroLook` to
`null → mapName` with the comment *"never a literal 'lafayette-square', which would tier a poured
scene's trees against LS's camera in LS's coordinate frame (garbage)."* Someone already fixed this
class here; #4 is the one they missed **in the same file**.

---

