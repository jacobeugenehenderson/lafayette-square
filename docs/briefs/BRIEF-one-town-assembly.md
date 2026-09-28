# BRIEF — One town assembly: every app mounts the same renderer

**For:** a fresh coding agent, working in the kit (`lafayette-square.nosync`).
**Why now:** the new player, The Ward (`~/Desktop/dev.nosync/theward`, founding brief in its
`README.md` §7), imports the town's renderer from the kit and must never fork it. Today there is
nothing single to import.
**Written:** 2026-09-27. **Status:** ready to execute after Jacob reads it.

---

## 1. The problem, in one paragraph

Three apps draw a town, and **each assembles the renderer by hand**: production
(`src/components/Scene.jsx`, the `<Canvas>` children), Preview (`src/preview/PreviewApp.jsx`) and
Stage (`src/cartograph/CartographApp.jsx`, partly through `sceneCfg.StageEnvironment`). Each keeps
its own list of ground, trees, buildings, lamps, sky, set-pieces, post-processing. The kit already
pays for this twice: `checks/claims-stage-preview-parity.mjs` exists only to catch the lists
drifting, and `SetPiece.jsx` was written after a set-piece went missing in the one app nobody
remembered (*"Every set-piece added by hand to every app is a set-piece that town #2 loses"*).
The Ward would make a fourth hand-assembly. This brief makes one.

> ⛔ **Jacob, 2026-09-27: *"the 3-way renderer is an excellent example of what is forbidden —
> overlap and palimpsest."*** Three hand-kept copies of one thing is the overlap; a check that
> exists only to catch them drifting is the palimpsest. The fix removes the copies, and the
> parity check becomes structural rather than a patrol.

## 2. The model already exists: `SetPiece`

`src/components/SetPiece.jsx` is the pattern, at small scale: **one mount, used by every app,
that picks what to draw from the town's own declaration**, and throws on anything it cannot draw.
Its check, `checks/claims-every-app-mounts-the-set-piece.mjs`, proves every app mounts it. Do the
same for the whole town.

## 3. Premises — claims, not facts. Confirm each before building, and say what you found.

1. **The three hand-assemblies differ.** ▶ For each of the three files, list the renderer
   components it mounts (directly and through `StageEnvironment`). Report every difference and
   whether it is declared in the parity check or accumulated.
   - Seen while writing this, **unverified**: a plain grep finds no `MountainBackdrop` mount in
     `PreviewApp.jsx` while production and Stage mount one. It may be mounted indirectly; the
     parity census is the arbiter, not the grep.
2. **Renderer components read the old player's state directly.** ▶ Re-derive, don't trust:
   ```
   for p in useCamera useSelectedBuilding useLandmarkFilter useListings useUserLocation \
            IS_MOBILE 'INSTANCE\b' FRAMED data-scene-pause; do
     echo "== $p"; grep -rlE "$p" src/components src/lib src/hooks | sort; done
   ```
   At writing, renderer files among the hits included `LafayetteScene`, `SlabBuildings`,
   `OverheadTrees`, `CloudDome`, `CelestialBodies`, `SceneNeon`, `SetPiece`, `CityModel`.
3. **`Scene.jsx` mixes drawing with player behaviour**: the camera rig and its modes, idle
   timeouts, the frame limiter reading `document.querySelector('[data-scene-pause]')`, the user's
   dot, courier dots.

⛔ If any premise is false, **stop and report** before building. That is the work, not an
interruption of it.

## 4. The target

**One assembly component** (name it; `Town` is a placeholder) that every app mounts — production
until the old player is retired, Preview, Stage, and The Ward. It draws the town and nothing
else. **Everything that varies by app arrives as a prop**; everything that varies by town arrives
from the slab and the installation.

| Today (read inside the renderer) | Becomes (passed in) |
|---|---|
| the town from the module global `INSTANCE` | `lookId` (and the installation it resolves to) — `SetPiece` already takes `lookId` |
| the device fork `IS_MOBILE` (antialiasing, log depth, pixel ratio, shadows, which pieces mount) | a **quality profile** prop, decided in one module that owns the device question. ⚠️ Includes which post-effects run per device: today `renderPipeline.jsx` tags the pyramid, bloom, DoF, AO and aerial `platform: 'desktop'`, so phones get none — though **the pyramid was built for phones** and Preview's tier emulator exists to measure it there. The profile's inclusion comes from Preview's measurement, never a fixed tag (Jacob, 2026-09-27) |
| `useCamera` view modes (`hero` / `browse` / `planetarium`), incl. `useOverheadMode`'s `shotOverride ?? viewMode` | a **`shot`** prop: `movie` · `plan` · `street` (+ transition progress, for the tree cross-fade brief) |
| selection and lighting read from `useSelectedBuilding`, `useLandmarkFilter`, `useListings` | props: the **selected id**, the **lit set** (ids), and an **`onSelectBuilding`** callback |
| `document.querySelector('[data-scene-pause]')` | a **`paused`** prop |
| the user's dot and courier dots mounted inside | **children**: overlays the app supplies |
| map pins / landmark markers inside `LafayetteScene` | not part of the town. They stay the old player's overlay until it is retired; The Ward has none |

**The camera stays with the app.** Controls, idle timeouts and transitions are player behaviour.
The assembly takes `shot` and draws accordingly; each app owns how the camera moves.

**`LafayetteScene` splits by what it actually does:** neon and street labels are the town (they
go into the assembly); markers and the click-catcher are the player's (overlay and callback).

## 5. Hard wires into modules — Jacob's ruling

*"We may remove specific hardwires but they only must be wired into modules."* So:
- A hard wire moves **out of the assembly's body into a module that owns it** — the quality
  profile, the shot, the set-piece registry. It does not have to become a per-town setting.
- **Landmarks follow `SetPiece`.** Do not decide in this brief:
  - **`GatewayArch`** is placed by a Look's authored `arch` channel; folding it into the set-piece
    registry is **ROADMAP H-7**'s question (`SetPiece.jsx` header says so). Mount it through the
    assembly as it is.
  - **`LafayettePark`** is a **ruled exception** (its header: *"DEFERRED-TO-PRODUCER … Jacob's
    ruling"*), guarded to its town. Mount it through the assembly as it is.
- ⛔ **Separating the renderer from the authoring code is NOT this brief.** It is a further
  productization step (Jacob). Stage's live overrides may keep reaching the store for now; the
  assembly must simply not *require* the old player's stores.

### Ruled 2026-09-27 (Jacob): live palette retint for every town
Stage-on-Lafayette-Square drew the LIVE building path (`LafayetteScene`) so the palette sliders retint
instantly; every other town draws `SlabBuildings`, whose colour is baked into its vertices, so the palette
shows only after a bake. Jacob: **live retint for every town.** So `SlabBuildings` gains live retint
(Stage's palette through `Town`'s `overrides`), Stage-on-LS then migrates onto `Town` like every app, and
the legacy live-building path is **deleted**. Until then Stage-on-LS is the one remaining hand-assembly,
reported red by name — migrated last, never given a second path inside `Town`.

### Found while landing it (Mortise, 2026-09-28) — pre-existing, OPEN
- **Tone mapping flips with re-renders, in every app.** R3F re-applies the Canvas `gl` prop
  (`toneMapping: ACES`) on each re-render of the app component, overwriting EffectComposer's
  `NoToneMapping`; the renderer reads 4 or 0 depending on timing. Stage re-renders on any store change.
  Cause measured; visual effect not established.
- **The movie near-plane differs** (production 10 vs 1) — owned by the one-movie-driver brief.
- **Stage never drew hour-based neon** on any town (it passed Force Neon On's `false`, which SceneNeon
  reads as an answer). Fixed in the landing; now visible in Stage.

## 6. Checks — the deliverable

Write each check first, **see it fail**, then make it pass. A check that has never been seen to
fail proves nothing — mutation-test it.
1. **Every app mounts the one assembly** and mounts no renderer piece on its own. Extend the
   `claims-every-app-mounts-the-set-piece` pattern: it reads the app sources, never a list copied
   into the check.
2. **The assembly reads no player store.** It parses the renderer's imports and fails on
   `useCamera`, `useSelectedBuilding`, `useLandmarkFilter`, `useListings`, `useUserLocation`,
   `FRAMED`, `data-scene-pause`, and on `IS_MOBILE` anywhere but the quality-profile module.
3. **`claims-stage-preview-parity` stays green**, and any divergence it reports is either removed
   or declared with a reason.

## 7. Out of scope

- Authoring separation (§5).
- The tree cross-fade between shots — its own brief.
- Each town's palette — its own brief.
- H-7 and the park exception (§5).
- Any change to what the town looks like. **Byte-for-byte the same picture in all three apps**,
  checked by eye in Preview on at least two towns — Lafayette Square and one poured elsewhere.

## 8. Done means

- All three apps mount the one assembly; the three hand-assembly lists are **deleted**, not left
  beside it. Say in the commit what was removed.
- The three checks in §6 pass, and each was seen to fail.
- `ls/ARCHITECTURE.md §1` (the mount tree) is **rewritten** to describe the assembly — the old
  tree is not annotated, it is replaced. The commit message names the register it reached.
- A short note in The Ward's `README.md` §7 that the entry exists, and its import path.
