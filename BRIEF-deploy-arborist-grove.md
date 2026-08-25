# BRIEF — deploy the Arborist against the pipeline: pour an actual grove

You are a **fresh agent**. Read `CLAUDE.md`, then `ORIENTATION.md`, then
`arborist/ORIENTATION.md` and `arborist/ARCHITECTURE.md §The species pipeline`.
⛔ **This brief's premises are CLAIMS, not facts.** Confirm each against the code and say
what you found before building. If the code contradicts this brief, **STOP AND FLAG IT.**

## The goal, in Jacob's words

> *"We are trying to finally finish the foundation so we can finally publish an actual grove."*

The foundation is done. **Your job is the grove**, not the foundation.

## Where things stand — measured 2026-08-25, re-derive before trusting

```
node -e "import('./arborist/roster-coverage.js').then(async m=>console.log((await m.computeCoverage()).summary))"
```
- 167 roster species · **6,767 placements** · 33 dossiers covering **74.8%** of placements
- **composed (green): 9** · gap 18 · notAvailable 17

⭐⭐ **THE ONE NUMBER THAT SHOULD SHAPE YOUR PLAN:** across the 33 dossiered species,
part slots read **have 88 · stretch 5 · gap 6**. The parts almost all EXIST. The distance
from here to a grove is the **composition gesture in the Salon**, not procurement — which
is the Arborist's own doctrine (`ORIENTATION.md`: coverage comes from composition).
⛔ So if your plan is "acquire more assets", you have misread the board. Confirm those
numbers first; if they hold, the work is authoring and baking.

## ⛔ HARD CONSTRAINTS — read before touching anything

- ⛔⛔ **theward.online has a spotlight on the solo tree. Jacob must be able to show the
  site at any moment.** Do not leave the tree broken between commits. **Look at it before
  and after every change**: `http://localhost:5173/arborist?view=fullmonte&at=13:00`.
- ⭐ **THE OPERATOR'S EYE IS THE GATE.** A passing check is not a rendered tree
  (`feedback_proxy_render_is_not_the_operator_eye`). Proxy renders mislead on this map.
- ⛔ **`design.json` is the operator's live authored state.** `git checkout --` on it is a
  DELETE. The Stage autosaves Jacob's edits into it while you work.
- ⛔ **Shared worktree — never `git add -A`.** Stage only files you touched. Four untracked
  `scratch/hero-*.mjs` belong to another session; leave them.
- ⛔ **Do not spawn a dev server** — reuse the running one (`npm run dev`; arborist on 3334).
- ⛔ **`hydrate-dossiers.mjs` and `mint-dossiers.mjs` both WRITE `arborist/dossiers/`.**
  Back the directory up before any `--write`.
- ⚠️ **46 commits are unpushed and staging deploys on push to `land-use-derivation`**
  (read `.github/workflows/staging.yml`, never quote it). Pushing DEPLOYS. Jacob's call.

## ⛔ WHAT IS NOT A DEFECT — you will trip on all four

- **~112 `contested` cells are the PRODUCT.** Jacob ruled 2026-08-25: *publish the
  disagreement, the operator settles it.* Sources disagreeing is not a bug; an unfilled
  cell is not a gap.
- **A cell without `sourced: true` is Jacob's authoring.** Never propose changing one.
- **`claims-verify-taxon` exits 1 ON PURPOSE** — the SelecTree fallback is the one known
  open defect. Do not silence it.
- **`chassis.orientation` / `chassis.spread` are deliberately absent from `MATCH_AXES`** —
  recorded, not matched.

## The work

### 1. Confirm the board, then compose in demand order
Species are worked by **placement count** — that is the whole argument for what comes next.
The Salon's Chassis/Bark/Leaves rail (`src/arborist/SalonWorkstage.jsx`) is where a species
becomes composed. ⭐ **Settle the contested axes as you go** — the rail publishes each
disagreement with the sources that claimed it and `askedAs` (which FIELD each source
answered), and settling drops `sourced` so it is never re-derived.

### 2. Bake, then LOOK
`POST /grove/bake?look=<name>` is the ship-to-slab. `arborist/bake-trees.js` rebuilds
`public/baked/lafayette-square/trees.json`, which `InstancedTrees` fetches at runtime.
⚠️ A slab baked before a dossier change shows the OLD trees — a clean full bake is the fix.
⛔ **Pass `--look` or you get a phantom look** (`feedback_bake_ground_scene_clobbers_default_look`).

### 3. Troubleshoot placement with the eye, not the numbers
Expect this to be where the time goes. ⭐ **Name the layer before you fix**: is it the
dossier (what the tree IS), the matcher (which parts were chosen), the bake (what reached
the slab), or the render? Patching the wrong layer is this repo's recurring waste.

## Commands
```
node scratch/claims-axis-keys-resolve.mjs        # 7 stores: ids, enum values, scalar units
node scratch/claims-verify-taxon.mjs             # ⚠️ RED ON PURPOSE
node scratch/claims-dossier-writers-agree.mjs    # one vocabulary + order independence
node scratch/claims-cutover-casualties.mjs
node scratch/claims-reference-credits.mjs        # plate credits, generated

node arborist/hydrate-dossiers.mjs               # dry run; --write; --in <file>
node arborist/mint-dossiers.mjs                  # dry run; --write; --in <file>
node scratch/dossier-harvest.mjs --from <rank> --out <file>   # ⛔ TRUNCATES without --out
```
⛔ **Run checks BARE.** `$?` after a pipe reads the pipe's last command, not the check.

## Working rules
- ⭐ **A number that moves when nothing should have moved it is the strongest signal here.**
  Two of the worst defects found in this subsystem surfaced exactly that way.
- ⭐ **Poison the input; mutate the guard.** And **verify the mutation LANDED** before
  believing an exit code — a mutation that never applied reads as a passing check.
- ⛔ **Never write the EXPLANATION of a number — only the number.** If the mechanism is not
  measured, write **"cause not established"** and stop.
- ⛔ **A confident wrong cause is worse than silence, because it DISPATCHES SOMEONE.** Two
  instances were found in this subsystem in one day. If you cannot name the cause, say so.

## Still open, and they are Jacob's
1. **A store-discovery check.** Axis ids live in **nine** places, each found one at a time
   by accident. The current guard uses a hand list of three producers — better than
   nothing, the same shape as the list that grew to nine. Left deliberately.
2. **The UTD field-name mapping.** `FIELD_MAP` asks for `crown_base_height`; the harvest
   emits `CrnBase_median`. Seven UTD fields sit unmapped (126 obs, 18 species) including
   `TreeHt_median` — a fourth height source alongside the three columns already split.
   The rename is trivial; deciding what it MEANS is not.
