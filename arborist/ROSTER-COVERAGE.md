# LS Roster Coverage — seeding & QC tracker (LIVING DOC)

> **Purpose.** A living worklist for seeding the Grove with a representation of every tree option we have, measured against the **Lafayette Square** roster. Boz fills the derivable columns (chassis we have, recommended recipe, provenance, gaps). **Jacob QCs** in the Salon, marks status, and notes what to re-obtain. This doc is expected to drift — update it as models are bought, compositions are tuned, and QC verdicts land.
>
> Snapshot taken **2026-05-25** from: `src/data/park_trees.json` (roster, 756 placements / 89 raw species), `public/trees/_chassis/*.meta.json` (46 source species), `arborist/leaf-pack-bindings.json` (10 packs), `public/textures/bark/` (5 refs). Re-derive any time the chassis library or roster changes.

---

## Legend

**Provenance** — *what kind of representation this is* (not a quality rating):
- 🟢 **literal** — the chassis IS the species (sugar maple model → sugar maple).
- 🟡 **composite** — a *cousin* chassis dressed with tuned leaves / bark / height to *read as* the target species.
- 🔴 **gap** — no chassis and no acceptable cousin → obtain a model.

**QC status** (Jacob fills): ⬜ not yet seeded · 🌱 seeded, unreviewed · ✅ QC pass · ⚠️ usable but wants work · 🔁 obtain a better model.

**Bark** — I can't see the textures, so bark picks below are *guesses to QC*. Refs available: `Bark003 Bark004 Bark007 Bark012 Bark015`. `Bark007` is the established Sugar-Maple/Oak default.

**Leaf packs available:** `palmate lobed heart serrate_ovate ovate ovate_large lanceolate long_needle elm_autumn oak_autumn`. Named morphology gaps (no pack yet): `fan` (ginkgo), `compound` (ash/walnut), `fine_compound` (honeylocust), `palmate_compound` (buckeye), `tulip` (tuliptree), `scale` (juniper/cypress/baldcypress), `short_needle` (spruce/fir/holly).

---

## ⚠️ Two findings to note before seeding

1. **`src/data/park_species_map.json` is stale** — dated `2026-04-29`, *before* the chassis library existed. The recipes below supersede it; refreshing that file is a natural byproduct once these recipes are QC'd.
2. **Roster names are messy** — duplicates by casing/word-order need merging before any automation. Canonicalized merges applied below: `Oak, Pin`+`(restricted use)` = 46 · `Cypress, Bald`+`Baldcypress` = 25 · `sycamore, American`+`(restricted use)` = 20 · `serviceberry, downy`+`downy serviceberry` = 18 · `Redbud`+`redbud, Oklahoma` = 25.

---

## §1 — SEED LIST (roster species we can cover with what we have)

Ordered by placement count. Seed these into the Grove first; QC top-down (visual weight follows count).

| # | Roster species | Cnt | Prov | Chassis (`source.species`, variants) | Leaf pack | Bark? | Height m | QC |
|---|---|--:|:--:|---|---|---|--:|:--:|
| 1 | Maple, Sugar | 88 | 🟢 | `acer_saccharum` ×18 | palmate | Bark007 | 5–14 | ⬜ |
| 2 | Maple, Silver | 48 | 🟡 | `acer_saccharum` (cousin) ×18 | palmate | Bark007 | 12–16 | ⬜ |
| 3 | Oak, Pin | 46 | 🟡 | `quercus_alba` ×4 | lobed | Bark007 | 14–17 | ⬜ |
| 4 | Maple, Red | 33 | 🟢 | `acer_rubrum` ×3 | palmate / lobed | Bark007 | 12–16 | ⬜ |
| 5 | sycamore, American | 20 | 🟡 | `platanus_acerifolia` ×14 (London plane, close) | palmate | Bark004? | 17–28 | ⬜ |
| 6 | Birch | 19 | 🟢 | `betula_pendula` ×5 / `betula_papyrifera` ×4 | serrate_ovate | Bark012? (white) | 8–25 | ⬜ |
| 7 | oak, northern red | 15 | 🟡 | `quercus_alba` (cousin) ×4 | lobed / oak_autumn | Bark007 | 14–17 | ⬜ |
| 8 | Dogwood, Flowering | 15 | 🟡 | `candicands` ×12 (ornamental) | ovate | Bark003? | 6–11 | ⬜ |
| 9 | Oak, Willow | 13 | 🟡 | `quercus_alba` (cousin) ×4 | lobed | Bark007 | 14–17 | ⬜ |
| 10 | Pine, Austrian | 13 | 🟡 | `pinus_sp` ×5 | long_needle | Bark015? | 11–24 | ⬜ |
| 11 | Linden, American | 13 | 🟢 | `tilia_americana` ×**1** ⚠️thin | heart | Bark007 | 31 | ⬜ |
| 12 | Linden, Littleleaf | 13 | 🟡 | `tilia_americana` (cousin) ×1 | heart | Bark007 | 31 | ⬜ |
| 13 | Pine, White | 13 | 🟡 | `pinus_sp` (cousin) ×5 | long_needle | Bark015? | 11–24 | ⬜ |
| 14 | Hackberry | 13 | 🟡 | `generic_leaf_tree` ×2 / `fagus_sylvatica` ×4 | serrate_ovate | Bark004? | 17–22 | ⬜ |
| 15 | juniper, Chinese | 10 | 🟡 | `juniperus_hollywood` ×4 / `juniperus_occidentalis` ×1 | long_needle (scale gap) | Bark015? | 4–15 | ⬜ |
| 16 | oak, bur | 9 | 🟡 | `quercus_alba` (cousin) ×4 | lobed | Bark007 | 14–17 | ⬜ |
| 17 | Pine, Scotch | 8 | 🟡 | `pinus_sp` (cousin) ×5 | long_needle | Bark015? | 11–24 | ⬜ |
| 18 | Zelkova, Japanese | 8 | 🟡 | `fagus_sylvatica` ×4 / `generic_leaf_tree` ×2 | serrate_ovate | Bark004? | 17–22 | ⬜ |
| 19 | Elm, American | 7 | 🟡 | `fagus_sylvatica` / `generic_leaf_tree` | serrate_ovate / elm_autumn | Bark004? | 17–22 | ⬜ |
| 20 | Cottonwood, Eastern | 7 | 🟡 | `populus_canescens` ×12 / `populus_alba_fall` ×4 | ovate / heart | Bark012? | 6–14 | ⬜ |
| 21 | Blackgum | 6 | 🟢 | `nyssa_sylvatica` ×6 | ovate | Bark007 | 8–11 | ⬜ |
| 22 | Pagoda Dogwood | 6 | 🟡 | `candicands` ×12 | ovate | Bark003? | 6–11 | ⬜ |
| 23 | Pear, Callery | 6 | 🟡 | `candicands` ×12 (ornamental) | ovate | Bark003? | 6–11 | ⬜ |
| 24 | locust, black | 5 | 🟢 | `robinia_pseudoacacia` ×4 | serrate_ovate (compound gap) | Bark004? | 7–10 | ⬜ |
| 25 | Maple, Hedge | 5 | 🟡 | `acer_rubrum` (cousin) ×3 | palmate | Bark007 | 12–16 | ⬜ |
| 26 | honeylocust, thornless | 4 | 🟢 | `gleditsia_triacanthos` ×12 | serrate_ovate (fine_compound gap) | Bark004? | 13–17 | ⬜ |
| 27 | Oak, White | 2 | 🟢 | `quercus_alba` ×4 | lobed | Bark007 | 14–17 | ⬜ |
| 28 | Oak, Sawtooth / Water / English / Shingle | 2–3 ea | 🟡 | `quercus_alba` (cousin) ×4 | lobed | Bark007 | 14–17 | ⬜ |
| 29 | magnolia, saucer | 4 | 🟡 | `candicands` ×12 | ovate_large | Bark003? | 6–11 | ⬜ |
| 30 | mulberry, red | 3 | 🟡 | `candicands` / `generic_leaf_tree` | ovate_large | Bark004? | 6–11 | ⬜ |
| 31 | Spruce, Norway | 2 | 🟡 | `blue_spruce_winter` ×6 | long_needle (short_needle gap) | Bark015? | 21–36 | ⬜ |
| 32 | Willow, Weeping | 2 | 🟢 | `salix_babylonica` ×5 / `salix_alba` ×6 | lanceolate | Bark012? | 3–6 | ⬜ |
| 33 | persimmon, common | 2 | 🟡 | `nyssa_sylvatica` / `candicands` | ovate | Bark007 | 8–11 | ⬜ |
| 34 | Cherry, Yoshino | 2 | 🟡 | `candicands` ×12 (ornamental) | ovate | Bark003? | 6–11 | ⬜ |
| 35 | Elm, Siberian | 2 | 🟡 | `fagus_sylvatica` / `generic_leaf_tree` | serrate_ovate | Bark004? | 17–22 | ⬜ |

**Extra in-library options not above:** `acer_saccharum_multistem` ×2 (specimen multistem — Sugar Maple clumps), `acer_saccharum_procedural` ×5 (procedural maple variants), `quercus_winter_fall` ×5 (winter/bare oak — seasonal Look use), `populus_tremuloides` ×5 (quaking aspen — no roster need but a clean light chassis), `pine_corona` ×3 (small pine), `abies_concolor` ×2 (white fir), `callitropsis_nootkatensis` ×13 / `cupressus_sempervirens` ×13 (Alaska cedar / Italian cypress — evergreen verticals).

---

## §2 — GAPS (roster species with no acceptable fit → OBTAIN)

Ranked by placement count. These are the shopping list. Today they fall to weak generic/ornamental fillers.

| Roster species | Cnt | Why no fit | Nearest stand-in today | Acquire note |
|---|--:|---|---|---|
| **Ash, Green** | 50 | no `fraxinus`; pinnate-**compound** leaf gap | none good | **top priority** — 50 placements, no cousin reads right |
| **Sweetgum** | 27 | no `liquidambar`; star-shaped leaf | maple (wrong) | distinctive; needs a real model |
| **Cypress, Bald** | 25 | no `taxodium`; deciduous conifer, buttressed base, scale leaf | Italian cypress (wrong silhouette) | wetland signature tree; needs real model |
| **Redbud** | 25 | no `cercis`; small, heart leaf, spring magenta | `candicands` (weak) | understory; heart pack exists — composite *possible*, model better |
| **Crabapple, Flowering** | 28 | no `malus`; small ornamental, blossom | `candicands` (weak) | understory cluster; QC the candicands composite first |
| **Tuliptree** | 18 | no `liriodendron`; **tulip** leaf gap, tall straight | none | big tree, distinctive; needs model |
| **serviceberry, downy** | 18 | no `amelanchier`; multi-stem understory | `candicands` (weak) | understory cluster |
| **Sweetgum / Tuliptree / Ash** share | — | compound/star/tulip leaf packs all missing | — | acquiring models likely brings leaf textures too |
| Walnut, Black | 5 | compound leaf gap | none | low count; defer |
| Coffeetree, Kentucky | 4 | bipinnate compound | none | low count; defer |
| Buckeye, Ohio | 4 | palmate_compound gap | none | low count; defer |
| Ginkgo | 6 | fan leaf gap | none | distinctive but low count; G.2 procedural hero was the old plan |
| Tree of Heaven | 5 | compound | none | invasive; low priority |
| Chestnut, Chinese / Catalpa / goldenraintree / Holly Am. / hawthorn / Amur corktree / filbert / pecan / smoketree / possumhaw / Witch-hazel | 2–5 ea | various; mostly understory/compound | generic/ornamental fillers | long tail — composite-or-defer, decide during QC |

---

## §3 — Acquisition shortlist (my read; QC will refine)

Split by whether a usable cousin exists at all, so the initial roster has the right trees in realistic proportions.

### §3a — 🔴 NO cousin — acquire before the initial roster (ranked by realism impact)

| Priority | Species | Cnt | Why no stand-in |
|--:|---|--:|---|
| 1 | **Green Ash** | 50 | 2nd-commonest tree in the park; no `fraxinus`, compound leaf, no acceptable substitute. Biggest realism hole. |
| 2 | **Bald Cypress** | 25 | nominal cousins (`cupressus`/`callitropsis`) are a skinny column + weeping cedar — visually wrong for a broad buttressed deciduous conifer. |
| 3 | **Sweetgum** | 27 | no `liquidambar`; star leaf + pyramidal form, no stand-in. |
| 4 | **Tuliptree** | 18 | no `liriodendron`; tall straight trunk, tulip leaf. |
| — | Walnut (5) · Tree-of-Heaven (5) · Buckeye (4) · Coffeetree (4) · Chinese Chestnut (4) · Ginkgo (6) | low | compound/fan leaves, no cousin — defer or accept crude until count justifies. |

### §3b — 🟡 WEAK cousin — have something stretched (upgrade when able)

- **Ornamental understory — ~98 placements on ONE `candicands` chassis:** Crabapple (28) + Redbud (25) + Serviceberry (18) + Dogwood (15) + Pear (6) + Cherry (2) + saucer Magnolia (4). Worst value-per-model in the roster; 1–2 good small-flowering-tree models lift the whole eye-level layer. *QC the candicands composite first — may pass for some.*
- Hackberry (13) / Elm (9) / Zelkova (8) → `generic_leaf_tree`/`fagus` — serviceable, not great.

> Note: buying models for Ash / Sweetgum / Tuliptree likely closes the matching **leaf-pack gaps** (compound / star / tulip) at the same time.

---

## §4 — How to seed (workflow)

1. For each §1 row: open Salon → pick the chassis → bind the leaf pack + bark + set height/scale → adopt → name it for the target species → set provenance (🟢/🟡).
2. **Refresh the routing map.** `src/data/park_species_map.json` (stale, 2026-04-29) is what `bake-trees.js#pickVariant` uses to fan the **89 messy park-names → the ~25–30 published library species**. You don't seed 89 species — you seed the distinct library species and the *map* routes Pin/Willow/Bur Oak all onto `quercus_alba`, etc. **Seeding is NOT "done" until the map routes every park-name onto a seeded species** (or a deliberate filler) — else the bake substitutes the wrong tree (or none). Hand-curated ("no auto-guess gets it right"); Brief 24's coverage join surfaces current-routing-vs-available so you can refresh it fast.
3. Re-publish (stages to library) → **Grove bake** (ships to slab) so it appears in LS. The bake's `unifyAtlases` **gangs every roster species' bark + leaf cards into one master atlas**, sha1-deduped — so ~25–30 species reuse the same 10 leaf packs + 5 bark refs and the atlas stays compact (one shared material/program, Bloom-stable). Adding species is nearly free; once the roster settles you can *raise* `bake-look.js#CONTENT_CAP` for fidelity.
4. Click through in the Salon / Grove, mark QC status in this doc, and flag 🔁 for anything that needs a real model.
5. Gaps (§2) → obtain models → re-run the chassis survey → re-derive this doc.

**Open question for Boz to wire next (not done yet):** a `provenance: 'literal' | 'composite'` + `targetSpecies` field on the composition so the literal-vs-composite call travels to the slab and this doc can be regenerated from data instead of hand-maintained (filed as **Brief 25**). Chassis species reassignment ("Generic Garden Tree" → "Weeping Willow") lives in curation `speciesOverride` (**Brief 26**) and re-homes a chassis into a species' coverage. The Salon picker `Look only` toggle (Brief 26) makes the unlabeled bundle-splits reachable to relabel.

---

## §6 — Known stale state (found 2026-05-25 via the Grove coverage view)

The published library is rich (**69 species** in `public/trees/`), but the **Look roster** (`public/looks/lafayette-square/design.json#/trees`) — what the Grove gallery *and* the slab actually render — is a **stale 8-species / 20-entry subset** (`cedar_generic`, `broadleaf_rt3`, `generic_tree_2`, `acer_saccharum_procedural`, `acer_saccharum`, …). It predates the Brief 20/23 chassis corrections and was never re-seeded.

- **🔴 `acer_saccharum` publishes as the OLD FOREST** — `public/trees/acer_saccharum/manifest.json` is 1 variant, the 17-trunk merged group-shot from a prior LiDAR/Scan pass, NOT the 18 corrected singles (`acer_saccharum_a`–`_u`) now in the chassis library. So the Grove renders a forest where Sugar Maple should be. **Fix: re-publish `acer_saccharum` from a single chassis (kills the forest publish).**
- **The roster needs a full re-seed** from the corrected library: compose the ~25–30 intended library species in the Salon → re-publish → re-seed `design.json#/trees` → refresh `park_species_map.json` (§4 step 2) → Grove bake. The coverage view is the punch-list; Brief 24's clickable rows (addendum) open the Salon per species to do it.
- Not a Grove code bug — the Grove faithfully renders the roster; the roster *data* + the `acer_saccharum` forest publish are stale.

## §5 — Changelog
- **2026-05-25 (later)** — Logged the stale-roster finding (§6): published library rich (69) but Look roster a stale 8-species subset; `acer_saccharum` published as the old forest, not the corrected singles. Surfaced by the shipped Brief 24 coverage view (Cadastre).

- **2026-05-25** — Boz seeded the doc from the 2026-05-25 chassis library (241 chassis / 46 source species) + the 756-placement roster. Recipes are first-pass; bark picks unverified (can't see textures). Awaiting Jacob's QC pass.
