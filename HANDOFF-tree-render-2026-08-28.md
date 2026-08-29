# HANDOFF — the tree render, 2026-08-28

> **State:** the neighbourhood renders. Jacob, on a phone: *"there's a stunning moment when you glance
> at the phone and you realize the trees are 'real'."* Gauge blue in Browse, blue→green in Hero, well
> inside budget. **Nine commits, `36c8ded8` → `3b857caa`.** This is the ledger of what was wrong, what
> is fixed, and what is still open — read the OPEN section first if you are picking up.

## ⭐⭐⭐ THE PATTERN OF THE DAY, AND IT IS THE MOST TRANSFERABLE THING HERE

**Six instruments reported ABSENCE when the truth was ERROR.** Every one cost real time, and in each
case the system already held the information:

| instrument | said | truth |
|---|---|---|
| `?heroTierQC=1` magenta | no impostors | wired to the KILLED octahedral material; 4,867 were drawing |
| the anchor guard | (nothing) | length mismatch discarded **every** anchor, silently, for a month |
| `heroCulled` in the census | (buried mid-string) | its two *lesser* siblings each had a ⛔ warn |
| Preview's blank map | slab broken | three layers toggled off in `localStorage` |
| `bake-trees` flat scale | (nothing) | 69.4% of placements at 1:1; only a MODULE failure warned |
| the Grove arrival bake | "tapers to near-zero" | true of the captures, false of the 43 s roster bake |

⛔ **Prove an instrument REACHES the thing before trusting its silence.** One grep: does the
tint/counter/guard bind to the live path, or to a retired sibling? A dead-code twin is the classic trap.
`[[feedback_an_instrument_that_lies_toward_nothing_is_there]]`

## ✅ FIXED

1. **The impostors were never missing — they were underground.** `y: 0` in the slab is a **sentinel**
   ("look it up"), read as a value. 4,867 hero cards sat under 2.6–34.8 m of terrain. The mesh path
   survived only because it falls back on `undefined`, which a sentinel cannot counterfeit. `4486d0dc`
2. **Then still sunk — the exag is an animated per-shot tween.** Browse draws the ground FLAT
   (`targetExag → 0`); a matrix-baked `raw × V_EXAG` is right only in Hero, up to **52 m** adrift in
   Browse. The lift now runs in the vertex shader off the live `uExag`, exactly as the mesh path always
   did. **You cannot bake a tween.** `2aaca5ca` · `c309d89a`
3. **The QC eye-gate was blind to the only tier it exists to check** — magenta on the killed material.
   Fixed on `injectHeroImpostorStamp`. `4486d0dc`
4. **The cull is retired only in foundation mode, and said nothing.** A look with no
   `heroImpostorBySpecies` drops `heroTier: 'cull'` placements over ground that still carries a
   contact-shadow ring for all of them — *"circles without trees."* Now loud. `36c8ded8`
5. **The Salon's green light described inputs, not output.** Now counts whether the impostor actually
   exported. ⛔ **Four states, not five** — Jacob's rule: *all parts assigned → green; missing something
   → yellow.* `341c5e0a`
6. **The slab's cache-bust key only advanced when the `scene` step was dirty.** Stage passes its own
   `bakeLastMs` and was immune; **Preview and PRODUCTION** were pinned to a stale key and served the
   previous slab from cache, unshakeably. `7f07f950`
7. **Browse never swapped in Preview** — `useOverheadMode` read `viewMode`, which Preview deliberately
   never drives. The overhead discs had *never once rendered* there. `99b46e1a`
8. **Size variety: 31% → 100% of placements.** The USDA band was in every dossier under an unread axis
   (`size_20yr`/`size_max`). `oak_white` had no dossier at all — harvested and minted. `92e713bd`
9. **The Grove re-baked on every arrival.** `?ifDirty=1`; buttons still force. `d1599c06`
10. **The phantom slab excised** — a 745-tree corpse a fixed bug used to write. `f3a8ec46`

## ⛔ OPEN — in the order I would take them

0. ⛔⛔ **THE CAPTURE-FRAME FIX HAS NOT PROPAGATED, AND IT WILL NOT ON ITS OWN** *(2026-08-29)*.
   The code is right and `maple_silver` proves it — that species could never bake an overhead
   before and now carries 3 bands. But every ALREADY-captured species still holds its pre-fix
   height (LS 20 findings, HPDM 16): **drain-on-bake re-captures only what is DIRTY, and dirty
   means the `captureKey` fingerprint moved.** The fix changed the *measurement*, not the
   fingerprint, so the drain skips every one of them. ▶ Remedy today: the Grove's explicit
   buttons still FORCE — use those, not the arrival bake. ⭐ Remedy for the kit: **fold a version
   of the capture code into `captureKey`**, or every future capture fix fails silently the same
   way and looks landed. ▶ `node scratch/claims-the-capture-frame-is-the-clip-frame.mjs`

1–2. ✅ **The `maple_silver` overhead capture and the duplicate-identity class — CLOSED 2026-08-28,
   and RETIRED from this list 2026-08-29** to `cartograph/_archive/HANDOFF-tree-render-closed-2026-08-29.md`.
   ⛔ They sat here marked ✅ for a day, which is the anti-pattern `CLAUDE.md` names: a resolved item
   left in an OPEN list is read as work by everyone who scans it. Live homes: the capture-frame rule
   is enforced by `scratch/claims-the-capture-frame-is-the-clip-frame.mjs` (and what is still owed on
   it is item 0 above); the twin rule is in `arborist/FEATURES` ▸ the roster light.

3. **`acer_saccharum`'s 123 m card** — its GLB is 65 × 106 m and 10.4 m tall: a merged **group shot**
   (`ROADMAP B7`). 251 placements each throwing a city-block-sized billboard. Its dossier says
   `canopyRadiusM: 9` against a measured 60 — trusting the authored radius may be a cheap interim.
4. **Per-layer card grid + figure-8** *(Jacob's design)* — only the FRONT leaf shell needs to flutter;
   under shell and bark can be flat cards on randomised figure-8 paths. **11.68M → 3.97M tris (2.9×)**,
   or 1.48M at front-grid 12 (8×), with no silhouette loss. `grid` is already a parameter.
5. **Nine species with no size band** repair staging (42.2% flat) and HPDM (33.8%) at once —
   `platanus_acerifolia`, `betula_pendula`, `magnolia_sp`, `cupressus_sempervirens`,
   `acer_saccharum_multistem`, `pseudotsuga_menziesii`, `picea_abies`, `abies_concolor`,
   `salix_babylonica`. Path proven tonight: add a `ROWS` entry → harvest → `mint-dossiers --write`.
6. **`size_urban` / `size_natural`** — the sources answer different questions (street 60 ft vs forest
   120 ft). Data already harvested for all 34. ⭐ The selector belongs on the **installation**, not the
   species. `BACKLOG.md` 2026-08-28. **Needs a standup** (touches the rubric keystone).
7. **Smaller:** LS's tree anchors are stale (4,995 vs 5,146) so trees seat on the smooth field, not the
   drawn ground · `bake-ao` bakes shadows from only the 280 MESH trees, so 4,866 cast none · staging
   ships 1,889 culled trees · the Supabase CORS loop (`x-device-hash`) breaks chat · shell
   value-separation for dark trees (front 1.0 / back 0.6 is *multiplicative*, so it collapses on dark
   species — push apart around the midpoint instead).

## ▶ THE CHECKS WRITTEN TODAY — run these before believing anything

```
node scratch/claims-every-shadowed-placement-renders.mjs      # rings without trees, per look
node scratch/claims-the-roster-light-tells-the-truth.mjs      # green-but-unexported / placed-but-unexported
node scratch/claims-the-slab-freshness-key-is-not-stale.mjs   # bakedAt vs artifact mtimes
node scratch/claims-every-placed-asset-has-a-size-band.mjs    # flat 1:1 scale, ranked by PLACED demand
node scratch/claims-the-capture-frame-is-the-clip-frame.mjs   # band cuts outside the tree; pre-fix card heights
node scratch/claims-every-declared-page-ships.mjs             # declared pages + GLBs that never reach the deploy
```
*(the last one written 2026-08-29, when the KTX2 pool landed — it is the check that
would have caught both the six untracked pages and the gitignored `.ktx2` pool.)*
Each **pins** the runtime rule it models and exits 2 on drift rather than reporting green off a rule
that moved. ⛔ `ksi-y-m-yn` rows are **noise** — the Polish pours are dead until deliberately resurrected.

## ⚠️ TWO THINGS I GOT WRONG, SO YOU DON'T REPEAT THEM

- **I told Jacob no impostors were rendering, with confidence.** 4,867 were. I believed a code comment
  over the code — the exact failure `CLAUDE.md` names — *while working from that doc.*
- **I proposed re-storing the Salon's mesh/impostor bars as intent instead of row indices.** Wrong: the
  bar is a free quantity the operator drags by eye against the lights, so a row index is correct, and
  "it didn't survive a re-pour" is not a problem when re-setting it is two drags. **That was calling
  the operator's authoring a defect** — Layer 0 Q3, and I did not ask it.
