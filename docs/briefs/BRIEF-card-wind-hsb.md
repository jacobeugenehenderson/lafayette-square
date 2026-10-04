<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: the card wind is one amplitude/pocket/frequency triple per Look, forked per shot, and `browseWindFloor`/`heroWindFloor` and the two card gains are gone; a gust reaches a visible floor of N screen pixels at each tree's own depth, and zero extra in calm; the pixel probe reads the live gains and passes on LS and Huron Browse and Hero; checks green and mutation-tested; Jacob has eyed a calm day and a gusty day in Browse and Hero.
-->

# BRIEF — Card wind: one amplitude · pocket · frequency per Look, and a gust you can see

**Boz the Younger drafted this 2026-10-04; Jacob dispatches.**

## Who you are, and the bounds

**Agent: WARM → Grain.** Grain built the overhead bands on the wind sheet (`fc2c8145`) and the mesh trees on it
(`be900ca1`), and co-wrote the proposal this brief carries out. **Gale** builds the two sheet helpers (below); agree the
seam with Gale before either of you writes it (`ListAgents` → `SendMessage`).
- The tree card shaders and the Look channel. ⛔ No pours or bakes. `node scripts/bake-in-flight.mjs` before saving anything
  the dev servers import, and announce saves before a browser bake is running (a save hot-reloads another agent's page).
  Ports 5173 / 5180. Commit only your own paths.
- A kit change reaches the Ward at the next batched pin move; Jacob confirms the push and publish.
- **Three-part fix** (`CLAUDE.md`). Registers: `cartograph/OPERATIONS.md` (the Look's wind knobs) · `cartograph/FEATURES.md`
  · `arborist/ARCHITECTURE.md` (excise its "OWED: the floor is two bare constants" note when this closes it).

## What Jacob approved (2026-10-04, all three; ROADMAP "Card wind: brightness · saturation · hue")

1. **One triple per Look, forked per shot through the channel path, like Canopy Light.** It **replaces**
   `browseWindFloor`, `heroWindFloor` and the two gains. **Named in wave terms** (Jacob, 2026-10-04, final, relayed by Gale;
   not Brightness/Saturation/Hue, and "Pocket" replaced "Depth"):
   - **Amplitude** = how far the trees move overall.
   - **Pocket** = how much the motion gathers where the gusts are, versus the steady sway everywhere. Panel hint, one
     line: *"how much the motion gathers where the gusts are."* ⛔ It is **not** the size of the gust pockets; that is the
     weather's `gustShape`, in the one cable.
   - **Frequency** = lean versus flutter: moves the motion toward the fast end (flutter) or the slow end (crown lean).
     ⛔ It must **not** speed up a single motion, or the name lies.
   ⛔ **No "Send a gust" button:** *"We should just hand tune it"* — Jacob tunes these by eye against the real weather.
2. **A per-tree visible floor of N screen pixels — a minimum on Pocket's gust term**, converted to metres at each tree's own depth (`windMetresForPixels`,
   in Gale's sheet chunk; there is no single metres-per-pixel, because it varies with depth). Shared later with grass and
   water.
3. **The floor applies to the gust excess only**, scaled by the town's own gust amplitude through `windGustAt(xz)` =
   clamp((|felt| − base) / gustAmp, 0, 1). Zero in calm, full at a peak, and no threshold constant.
**N is set by Jacob's eye.** It lives in the Look with a neutral default, never as a kit constant.

## Why (Gale, `909e4867`, `scratch/wind-sheet/px-per-shot.js`)

LS Preview, desktop 1695×1659, forecast 0.8 m/s with gusts +3.0. **Computed from the live scene, not frame-measured.**
Crown-top motion, median [p10–p90]:

| | always-on sway | gust-peak lean | gust-peak flutter |
|---|---|---|---|
| Browse (floor 1.5, 0.27 m/px) | 1.15 px [1.13–1.17] | 0.68 [0.67–0.69] | 0.57 [0.56–0.58] |
| Hero (floor 1.0, 0.30 m/px) | 0.67 [0.54–1.31] | 0.58 [0.47–1.13] | 0.49 [0.39–0.95] |

A gust adds about 0.6 px at its peak, which is sub-pixel, and in Browse the always-on sway is about 1.7× the gust.
⛔ Phones and other towns are **unmeasured**.

## The code today (read by Boz 2026-10-04; confirm before you trust it)

| what | where |
|---|---|
| the two floors, bare constants, with `window.__set…WindFloor` dials | `src/components/treeAtlasMaterial.js:1711–1716` |
| the two gains, m of motion per m/s of felt wind | `treeAtlasMaterial.js:1635` (`CARD_LEAN_GAIN_M_PER_MPS`), `:1636` (`CARD_FLUTTER_GAIN_M_PER_MPS`) |
| where floor and gain combine (lean, flutter) | `treeAtlasMaterial.js:1661`, `:1666` |
| how a floor reaches a shader; the browse and hero binds | `treeAtlasMaterial.js:1738` (`bindCardWindUniforms`), `:2085`, `:2146` |
| ⚠️ `injectOverheadWiggle` binds with **no** floor (defaults to 1.0) | `treeAtlasMaterial.js:1747` — say whether that carrier is live |
| the precedent channel: Canopy Light | `src/cartograph/stores/useCartographStore.js:402` (`_grp('canopy', …)`), `:1418` · editor `src/cartograph/CartographSurfaces.jsx:538` · runtime default `src/components/OverheadTrees.jsx:40` (`kitDayChannel('canopy')`) · `src/components/Town.jsx:182` · `src/cartograph/CartographApp.jsx:747` |
| the wind sheet, where Gale's helpers go | `src/lib/windSheet.js` (`bindWindSheet` :141) |

## The chain

- **Trusts:** the wind sheet as the one authority (`checks/claims-the-wind-has-one-authority.mjs`) · the live camera and
  terrain exaggeration (`uExag`).
- **Trusted by:** every tree card carrier in Browse and Hero · later grass and water (via `windMetresForPixels`) · Stage's
  per-shot authoring.
- ⭐ The rule that crosses topics belongs in a check: **no wind amplitude is a bare constant in a shader file.** It is a
  Look value or derived from the sheet.

## Can the instrument see the change?

⛔ Gale's probe computes with *"the card shader's gains as of `fc2c8145`."* If it **copies** those gains rather than
reading the live uniforms, it will print the old figures after the change, which would read as *"the cure did nothing."*
Make it read the live values first, then use it as the gate: gust-peak motion ≥ N px on LS and Huron, Browse and Hero.
Eye-gate surface: **Stage** for the authoring, **Preview** for the result, on a calm day and on a gusty day
(`wind="weather"` specimens, `4bfb438c`).

## Done

1. The triple is per Look and forks per shot; the two floors, the two gains and their `window.__set…` dials are
   **deleted**, and the commit message says so.
2. In calm, the gust floor adds exactly zero (check, mutation-tested: force `windGustAt` to 1 and watch it fail).
3. The probe, reading live values, shows gust peaks ≥ N px on LS and Huron in Browse and Hero.
4. ⏳ **The visible-floor CHECK (gate 3) is NOT yet confirmed by Jacob** — Gale asked; build it only on his yes.
5. A check that no wind amplitude lives as a bare constant in the card shaders (it reads the source; mutation-test it by
   re-adding one).
6. Jacob has eyed Browse and Hero, calm and gusty, and set N.

**Confirm-then-build:** read the code sites, tell Jacob what you found, and if the code contradicts this brief, stop and
flag him.
