# Tree docs — superseded 2026-09-25 by the likely-grove ruling (FIA by county)

> Retired for CURRENCY. Live: arborist/ARCHITECTURE.md "THE LIKELY GROVE"; TREE-INTAKE §5 item 4; INTAKE-CATALOGUE "Species routing map".

## arborist/ARCHITECTURE — the heroTierQC incident (2026-08-28)

> ### ⛔⛔ AND THE EYE-GATE WAS BLIND TO THE ONLY TIER IT EXISTS TO CHECK
> `?heroTierQC=1`'s magenta was wired ONLY into `injectImpostorBillboard` — the **KILLED** octahedral
> impostor, zero instances on every slab — while a comment claimed it covered the captured billboards.
> So the QC view painted nothing and **the absence of magenta read as the absence of IMPOSTORS**,
> costing most of a session. Now on `injectHeroImpostorStamp`, where the live tier is.
> ⭐ **An instrument's silence is not evidence of absence — prove it REACHES the thing first.**
>

## TREE-INTAKE §5.4 — the hand-authored rule and the huron worked example

4. `…15-derive-tree-mix.py` — derives the roster + map + mix from whatever census exists (the `EXACT`/`keyword_collapse` table is STL-flavored — audit it per region). **If no municipal census, the mix is HAND-AUTHORED**, and the rest of this item is what that seed is *for*, because getting it wrong is silent.
   > *Worked example — huron, 2026-09-20: **13 / 7 / 2** of 22 named species.* ⭐ The 7 dossier-only
   > (N. red oak, honeylocust, hackberry, redbud, serviceberry, ginkgo, white pine) **are the point** —
   > they became 3,174 placements of visible demand the operator can now see ranked.

## INTAKE-CATALOGUE — the hand-writing procedure

| **Species routing map** | `tree-species-map.json` (+ `tree-mix.json` shares) | every placement resolving to a real library species | honest zero: routing is EMPTY, never LS's map (`bake-trees.js`, "Refusing to route through LS's map") | **DERIVED** from the census histogram by `scripts/15`. ⚠️ But the collapse table inside it is **hand-authored and St-Louis-flavored**; `TREE-INTAKE.md §5.4`: *"If no municipal census, the mix needs a hand-authored seed — audit the table per region."* **Procedure where none exists:** the city's approved street-tree planting list + USDA hardiness zone + a state extension urban-tree guide → hand-write a ~18-species mix with weights |


---

## Moved 2026-10-04 from `arborist/FEATURES.md` §Grove (Grain): the 2026-08-28 re-bake notice

Superseded by the live `CAPTURE_FORMAT` paragraph there; the incident it records:

⛔ **RE-BAKE EVERY LOOK BAKED BEFORE 2026-08-28.** The impostor capture measured the tree's height in the un-scaled chassis frame while the camera framed and clipped in world metres, so **stored card heights are wrong** (`maple_silver` shipped 29.7 m for a 21.0 m tree; HPDM's `picea_abies` 681 m) and any species whose GLB node scale is **under 1** lost its top band and could not capture at all — it went missing from Browse with no error. Fixed at the capture. ⛔ **BUT "one Bake → Slab per Look clears it" IS FALSE, and this line said it for a week.** The Grove bakes DIRTY species only (drain-on-bake), and `captureKey` fingerprints the tree's *inputs* — canopy dims, bark records, hero dials. It deliberately carries **no notion of the capture CODE's version**, so a record shot in the pre-fix frame is indistinguishable from a current one and is skipped forever. Measured 2026-09-03: LS was re-baked that afternoon and still carried 3 pre-fix records — `quercus_alba`'s overhead pages had not been rewritten since 08-25. ✅ **FIXED 2026-09-03 — `CAPTURE_FORMAT` in `src/arborist/captureKey.js`.** A per-pool format version is folded into the fingerprint, so bumping it makes every affected record dirty **by construction**, in every town, on the next ordinary bake — no skip list, no per-town note, no operator who has to know to press ⟳. ⛔ **Bump it whenever the capture CODE changes what a page contains or how a stored measure is framed**; that is the whole contract. A bump re-shoots that pool once, including records that happened to be fine — correct, because we cannot tell post-hoc which code shot which record, and that missing information *was* the defect. The ⟳ gesture stays for what a fingerprint genuinely cannot see (a suspect asset on disk, a half-written capture). ▶ `node checks/claims-the-capture-frame-is-the-clip-frame.mjs` says which Looks still carry pre-fix records.


---

## Moved 2026-10-04 from `arborist/ARCHITECTURE.md` (Grain): the per-carrier wind floor

Closed by the Look's Tree Wind channel (`treeWind`):

> ⭐ **AMPLITUDE IS FREE.** `window.__setHeroWindFloor(v)` is a uniform multiply — a coarser
> grid is compensated by turning the floor UP, never by more triangles.
> ⚠️ **OWED: the floor is two bare constants** — `heroWindFloor = 1.0`, `browseWindFloor = 1.5`
> in `treeAtlasMaterial.js`, with no per-town authoring. A windier town cannot say so
> (`CLAUDE.md` Layer 0 q1). It wants to be an authored channel, forkable per shot.


---

## Moved 2026-10-05 from `arborist/ARCHITECTURE.md` (Grain): the rustle floor's old uniform

- **Rustle floor is `injectFoliageSway` (ADR S3).** Always-on, ~5 mm leaf-tip noise gated by `uRustleAmplitude`. Operator-stated 2026-05-22: "very subtle 'rustle' as the 'floor' for ambient 'life'." Wind sway composes additively on top. Calm-weather scene shows rustle floor only; storm swamps it.

(`uRustleAmplitude` was retired with `treeSwayUniforms`, be900ca1; the Amplitude · Pocket · Frequency knobs that followed were removed 2026-10-05.)
