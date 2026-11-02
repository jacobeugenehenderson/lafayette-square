# The chain's names, 2026-11-01 — the superseded wording

Jacob named the whole chain on 2026-11-01: three functions, **Stage · Preview · Publish**, holding twelve steps,
**01 Extent · 02 Intake · 03 Skeleton · 04 Survey · 05 Seal · 06 Section · 07 Foundry · 08 Slab · 09 Look · 10 Preview ·
11 Publish · 12 Promote**. A naming pass (Sigil; Boz's rulings, Zob's co-sign) made these the only names in the operator UI and
the operator and marketer registers. Code identifiers, routes, CLI flags and file names keep their words. The developer
canon is not swept; README §START HERE carries one glossary line for it. ▶ `node checks/claims-the-chain-has-one-set-of-names.mjs --mutants`

## Old word → new word

| Old | New | Note |
|---|---|---|
| Bake · Re-bake · rebuild · baking (Extent's Bake, Stage's ↻ and banner Bake, Publish's bake) | the Foundry · run the Foundry · a Foundry run | the Arborist's grove bake keeps its own term (Boz) |
| pour · Pour map · Re-pour | the Foundry · run every step | Layer 0's "the kit pours neighbourhoods" stays |
| Re-pour and bake · Re-pour and publish | Run every step · Run every step and publish | the consent (`?repour=1`) unchanged |
| the slab | the Slab | the deliverable, step 08 |
| map · town (the working object) | scene | Jacob; the real place stays "town" |
| the Data Wall · the Wall · shape freeze | the Seal | step 05 |
| SOFT fetch · light pass · HARD fetch · heavy pass · "HARD fetch = the SEAL" | the outline fetch · the full fetch | `--pass=light\|heavy` stays |
| Measure (Section's tab) | Section | |
| Stage (the look-authoring step) · "Stage →" | Look · "Look →" | Stage is now only the function |
| Stage's ↻ | a **Foundry** button | ↻ now means only Preview's Reload |
| raw step ids in banners (skeleton, coast, pipeline…) | words, through `src/lib/stepWords.js` | "The Foundry owes N steps" |
| `cartograph/BAKE.md` | `cartograph/FOUNDRY.md` | git mv, every pointer repointed |

## The false sentences this pass corrected, verbatim

**OPERATIONS.md** (Stage → never bakes, since 2026-10-04):
- `- **Bake buttons** — Designer's **"Stage →"** = bake, then enter Stage on the opening keyframe. Stage's **"↻"** = bake in place, stay put. Both accept **⌥-click to force a full rebuild** (bypass the dirty-check). A small orange dot lights when authoring edits exist since the last bake (indicator only — never disables the action).`
- `- **Authoring** (Stage → Bake → Preview) → **COMMENT IT OUT**, or you will pour a scene and then inspect R2's *older* copy.`

**FOUNDRY.md** (was BAKE.md):
- §0: `Designer's "Stage →" fires it implicitly in the background; Stage's "↻" re-fires it in place.`
- §1 Outputs: `⛔ **Written there, but PUBLISHED to R2** — the tree is gitignored and the pour's last step uploads it (below)` (Publish uploads it; a Foundry run never does)

**PREVIEW.md**:
- §0.1: ``The bake's manifest step carries it into `manifest.deployment`.`` (Publish accepts the deployment panel's settings)
- §0 item 1: `Byte-for-byte still holds — the pour uploads what it just wrote and fails loudly if it cannot`
- the gate callout: ``but a bake writes only `staging/`, and production is a separate Promote per town``
- §5 step 2: ``2. **Bake** — one button freezes `design.json` → `scene.json` and pours the geometry/AO into the slab (`FOUNDRY.md`). Stage's "↻" re-fires it in place; Designer's "Stage →" fires it implicitly.``

**cartograph/README.md**:
- §Editor: `Going Designer → Stage silently re-bakes the active Look so the rendered scene reflects the latest geometry.`
- §Authoring loop: `3. Click **Stage** → silent re-bake of the full bundle → land in Hero.`

**cartograph/FEATURES.md**:
- `**The Bake is the slab pour** — the publish moment for cartograph.` (Publish is step 11)
- ``| **Bake** (action) | Slab pour — publishes to `public/baked/<look>/` ``

**README.md**:
- Prebake row: ``⛔ **Section, Measure and the neutral Design view do NOT** — they consume the baked `shape.json`, so a re-bake *does* change what those three show.`` (Measure is Section: two views, not three)
- Extent row: `**HARD fetch = the SEAL** (freezes the soft fetch, bakes the skeleton) → **Bake**.`
- tools list: `- **Stage** — the **LOOK / slab**: … **bakes the slab (wall #2, store dies).** … *(… Stage is the 3D look environment + the slab pour.)*`
- §Section: `perf/D6d + Measure→Section rename remain` (in the docs it is done; only code names remain)
- `**Pipeline order (Jacob's):** `intake → skeleton → prebake → survey → ⟦WALL⟧ → section → bake → stage`` (now the twelve steps)
