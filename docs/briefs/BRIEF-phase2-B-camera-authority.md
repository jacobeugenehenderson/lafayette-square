# BRIEF — Phase 2 · B: Camera and framing have one authority

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: browseFrame reaches the Ward's plan view; no LS values in any town's shot defaults; camera controls per town and per shot are data read by Stage, Preview and the Ward; Preview's drop-to-Browse is gone; the derived hero movie logs; one altitude formula and one shot vocabulary; claims-authored-framing-reaches-the-player and an extended claims-the-camera-has-one-definition are green and mutation-tested; Jacob has eyed the framing in each surface
-->

**Boz drafted this 2026-10-04 from Thread's continuity map; Jacob dispatches.** Phase 2, tranche 2, package **B**. ⛔ **Starts after
A lands**: A makes the map/Look/shot state authoritative and edits the same camera code.

## ⭐ STATE 2026-10-04 (Boz): Lens dismissed; what landed and what remains
**Landed:** row 1 `25178a3e` (the Browse frame: set by a button, opened on everywhere) · row 2 `03134460`, `13d29aae` (StageApp#SHOTS gone; the card writes shots) · row 3 `1509ed2e`, `0e5787a9` (narrowed by Jacob: the town's camera VALUES bake now; the transitions and ownership rules are deferred, recorded on ROADMAP) · rows 4–5 partial `5f4333ca` (one shot-adjacency table; the derived movie says so) · `fd3cf5a5` (a cold Preview opens on Street again). Ward `c6e3049` on kit `c87ab09b`, pushed; on staging in Ward `d926b63`.
**Remains (small; anyone can pick it up cold):** ① row 5's rest: ONE shot-name mapping table instead of ShotFlight ENTRY / Preview TOWN_SHOT / Town's regime ternary / the legacy REGIME_OF_MODE + SHOT_OF_MODE, and Stage's CameraRig placement sharing ShotFlight's destination (files: `src/camera/{shots.js,ShotFlight.jsx}`, `src/components/Town.jsx`, `src/preview/PreviewApp.jsx`, `src/cartograph/CartographApp.jsx`) · ② the Ward's `checks/society-frames-what-it-lights` predates "society = radius" (ROADMAP; needs Jacob's ruling) · ③ Jacob's eye on the framing in Stage, Preview and the Ward. LS, PT and Huron's Browse frames came from the old recorder; Jacob may re-set them with the button.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit **and** the Ward (`~/Desktop/dev.nosync/theward`; commit there and push to its private remote `theward-player`). ⛔ No
  pours or bakes; `node scripts/bake-in-flight.mjs` before saving anything the dev servers import. Ports: kit 5173, Ward 5180.
- ⚠️ **A kit change reaches the Ward only when the Ward's kit pin moves** (`theward/checks/kit.mjs`, worktree
  `.claude/worktrees/ward-kit`; the pin move also publishes the kit bundle to `staging/kit/<sha>/`). Plan the pin move as your last
  step and tell Jacob; staging and production follow only by his Publish/Promote.
- Commit only your own paths. Visible framing changes get **Jacob's eye** before they ship.
- **Three-part fix** (`CLAUDE.md`); the commit names its register (`cartograph/OPERATIONS.md` Stage › Camera / Shots, at least).

## Read first

1. **The spec**: the Phase 2 text at the end of `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`, section **Camera / Framing**:
   *"Establish one explicit authority for authored framing. Remove silent fallback to whole-neighborhood framing where a handoff
   has failed. Ensure Preview sees the framing Player will actually use."*
2. **The map**: `scratch/runtime-continuity/MAP.md` **§4** (the camera trace, whole), **§2** duplicate authorities 3 and 4, and the
   LS-mould constants under silent substitutions.
3. **Rulings that bind you** (all Jacob, 2026-10-03/04):
   - **Wire `browseFrame`**: the Ward's plan view opens on the Browse framing the operator authored in Stage.
   - **Camera controls are the town's authored data, shot by shot**: *"those things are possible in a spectrum of outcomes… might
     be different from map to map; there are editable camera controls so depending on the design the system will have to
     reproduce it in Preview."* ⛔ **No gesture is hard-coded in Preview, in either direction.**
   - `H-7`: "hero" is only the set-piece; the camera is not tied to it.
   - **2026-10-04, at work (agent Lens):** Browse frame = centre + camera height, read as a square everywhere; default the town's radius; set only by a Stage button; Stage's camera stays where the operator works. Society opens on the frame; a category or search zooms. **Row 3 narrowed:** Preview is the player's experience (Hero takes no input) and Stage is the authoring camera; the town's **authored camera values** (Browse frame, FOVs, eye height, Hero keyframes) are its data and bake; what is **deferred** is parameterizing the **transitions and ownership rules** — which gesture does what, who drives the camera when ("it makes sense to parameterize the settings, but not today"). Those stay fixed in code (cameraRegimes, transitions.js).

## The work

1. **One Browse-frame authority.** `browseFrame` is authored in Stage, baked (PT, Huron and LS carry one), and **read by no runtime**;
   the Ward frames by `framePlaces`/`frameDensest`, the legacy player by LS's `shots.browse.bounds`. ⇒ the Ward's plan view
   (`ShotFlight#destination`) and Preview read `browseFrame`; a town with none uses the derived framing **and logs that it did**.
2. **LS's values come out of the defaults.** `SHOTS_FLAT_DEFAULTS.browse.bounds` (`skyLightChannels.js`) is LS's building footprint
   `{cx:95,cz:-158,w:1292,h:1025}`; the hydrate fills it in and the autosave writes it back as if authored, so it sits in **all six
   towns'** `design.json` and `scene.json`. `StageApp#SHOTS` hero `[-400,55,230]` and street `[0,-50]` are LS poses, reused by
   `PREVIEW_STREET_AT` and Preview's initial Canvas pose. ⇒ neutral defaults derived from the scene's own disc; ⛔ no LS constant. The
   existing copies in towns' files are **data**: list them for Jacob, change them only on his go (package C owns the general strip).
   `shots` (fov/padding/eye) has **no UI that writes it** (`setShots` has no caller): give it one, or say why not.
3. **Camera controls as data.** `cameraRegimes#REGIMES` is fixed per shot in code; no per-town or per-shot controls key exists. ⇒ a
   per-town, per-shot controls setting, authored, baked, and read by Stage (outside playback), Preview and the Ward. Today's
   behaviour is the neutral default. **Remove Preview's drop-to-Browse rule** (`PreviewApp#ShotCamera`); Preview now reproduces the
   town's controls. Report what the legacy `Scene.jsx` does, as one line (no host serves it).
4. **Log the derived hero movie.** With no keyframes, `cameraRegimes#derivedOpeningKeyframe` derives a movie from the disc **with no
   log line**; HPDM's deployed slab plays one. ⇒ say so, once, wherever it happens.
5. **One altitude formula, one shot vocabulary.** Three Browse-altitude formulas (`browseAltitude`, `browseFitAltitude` with a fixed
   1.12 pad, `planAltitude`); three "where does each shot put the camera" implementations (`CameraRig`, `ShotFlight#destination`, the
   legacy `CameraRig`); four shot vocabularies with five mapping tables; `SHOT_ADJACENCY` duplicated in `PreviewApp` and `TriggerBar`.
   ⇒ one of each, the others gone in the same commit. ⛔ The pad is a Class D constant: derive it or make it authored.

## The chain

- **Trusts:** package A's map/Look/shot authority; the bake's `scene.json` (`bake-scene.js`); the Ward's manifest loader.
- **Trusted by:** every Browse, Hero and Street shot in Stage, Preview and the Ward; the Promote proof step (it opens the domain).

## Can the instrument see it?

`claims-authored-framing-reaches-the-player` (map §7 #1): every framing key `bake-scene` writes has a reader in the Ward's import
graph; today it fails on `browseFrame`. Extend `claims-the-camera-has-one-definition` to scan `theward/src` (map §7 #9). Mutation-test
both. ⭐ The eye gate is a pair per surface: Stage, Preview and the Ward (local at 5180, then staging after Jacob's Publish) on the same
town and shot, before and after.

## Deliverable

The five rows; the checks; the OPERATIONS camera entry rewritten to match. **Read the spec, the map rows and the code, tell Jacob
what you found, then build. If the code contradicts this brief, stop and flag him.**
