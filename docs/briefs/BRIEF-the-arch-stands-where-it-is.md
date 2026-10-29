# BRIEF — the Arch stands where it is: a set-piece at its real coordinates, with a presence scale; the Survey Hero retires

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-28 night, Boz, Jacob: "if we can fix the arch tonight that's better"; Zob's premise pass CO-SIGNED WITH CORRECTIONS, folded in)
evict-when: the Gateway Arch is placed from its real geographic coordinates through the set-piece contract, with one authored
presence scale; it holds still in the world as the camera moves (no "bounce"); no LS-specific constant remains in its code; the
Survey Hero is gone and focus lives only on keyframes; checks green with mutants seen RED; Jacob passes LS's Hero by eye. Then this
moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Confirm-then-build:** every premise is a claim; confirm it against the code and say what you
found. If the code disagrees, stop and flag Boz. Zob reads your plan before you build.

## 0. Jacob's words (2026-10-28)
- *"Now that we did what we did with the hero object, it's no longer fixed in space… the Arch now rather 'bounces' in the scene with
  the camera motion now that it's not artificially tied to the camera."*
- *"What if we placed it more in real space but we raise and scale it big enough to fill that area of the shot? It doesn't really have
  to be realistic, it needs to be attractive… doubling the size and height of the arch in its real spot so it's an actual presence…
  It'll be on the outside of the radius."*
- *"Maybe we need to retire the 'Hero' Object from the survey and *just* add them to the keyframes."*
- LS's bake waits on this (Jacob: "the Arch is too weird").

## 1. What the code does today (Boz's read; confirm by symbol)
- `src/components/GatewayArch.jsx` places the Arch from the Look's `arch` channel: `position = arch.distance × (bearingX, bearingZ)`,
  plus Scale, Rotation, Y-offset and Foot-fade (`cartograph/OPERATIONS.md` "Arch placement"). Distance and bearing are hand-set numbers,
  not the Arch's real location.
- ⛔ Its glint carries LS-specific constants: `dx = camera.position.x - (-400)`, `dz = camera.position.z - 230`, `lateral = (dx*0.358 +
  dz*0.934) / 140` (Layer 0 Class D: a constant right for town #1).
- `docs/briefs/BRIEF-set-piece-contract.md` (OPEN): *"the Arch is outside the contract today… don't move the Arch without Jacob's go."*
  This brief IS that go, for the Arch. PTown's Pilgrim Monument is the model: it stands on its real spot from the town's data, with its
  own lighting and 2D silhouette.
- The Survey Hero (`heroSubject`) has more readers than the picker (Zob, by symbol). Step 4 reaches ALL of them:
  `src/lib/focusObject.js` (#resolveFocusId: 'hero' → 'arch' or a landmark id; key 0 IS 'hero'; #focusChoice; #hasFocusObject) ·
  usePostFxDriver.js · PostProcessing.jsx (heroSubjectOverride and `scene.heroSubject`: PRODUCTION reads it from the slab) ·
  `cartograph/bake-scene.js` (~157, bakes it into scene.json) · lookDesign.mjs#PLACE_DESIGN_FIELDS · Town.jsx OVERRIDE_KEYS · StageApp.jsx
  (isLandscape; the Hero shot's label) and the Horizon card · checks claims-hero-focuses-the-object and claims-authored-framing-reaches-the-player.
- WHAT "TIED TO THE CAMERA" WAS (history, Zob): before 2026-09-05 the camera ran lookAt(the Arch), so it sat dead centre; 5e8f9eca (09-05)
  held it at a fixed screen mark; f6feaf67 (09-05) removed the Hero Lock; 4bda693c (09-26) removed it everywhere. The screen-lock has
  been gone a month, so what changed "now" is NOT the placement. The 10-28 DoF commits are a5f9434f (the coverage matte), ca8b9093
  (focus the object) and a9f6a6cf (the town-anchored blur); 237ee4db (10-07) only named the mesh `focus:arch`.
- THE BOUNCE: cause NOT established. Leads, in order, all inferred: (a) the hero matte (a5f9434f) is scissored to the hero's box. If
  that rect comes from a frame BEFORE MovieCamera moves the camera, the sharp Arch is clipped against a lagging scissor during motion and
  partly re-blurred: jitter. Measure the rect against the Arch's projected bbox, per frame, during playback. (b) Focus on the Arch at
  ~1.9–2.3 km against a blurred, parallaxing foreground: correct optics, new since ca8b9093. (c) The glint's camera-lateral term (±0.15
  along the arch) slides the highlight as the camera moves.

## 2. The rulings this builds (registry)
- `r-stage-focuses-the-object-and-captures-the-screen` (Hero focuses the object; Street the aim; no focus object = the town-anchored blur).
- Jacob's go on the set-piece move above, and his idea of retiring the Survey Hero; ask Boz to file both as rulings when you confirm them.

## 3. The work, in order
1. **Establish the bounce** (§1, last bullet). Report it before anything else.
2. **The Arch joins the set-piece contract:** placed from its REAL coordinates (lat/lon, sourced and cited, never typed from memory),
   projected through the town's geography, so the distance and bearing are derived, not authored. Plus ONE authored **presence scale**:
   Jacob's first value is ×2 of LS's CURRENT authored arch.scale (read it from public/looks/lafayettesquare/design.json and cite it).
   Size and height scale together; Foot-fade kept. Outside the disc is expected.
3. **Delete the glint's camera-lateral term** (not only its LS constants): the highlight follows the sun and the Arch, never the camera.
   If a camera term is wanted for the look, it's Jacob's call and derived, never a town constant.
4. **Retire the Survey Hero:** focus lives only on keyframes; the first key names its object or none (none → the town-anchored blur).
   The Horizon card's knob choice comes from what the Look has (an arch or a backdrop). Remove the picker, the store field and the
   design field at every reader in §1, with a two-part migration: (1) design.json's heroSubject becomes the first key's `focus` (nothing
   authored is lost); (2) the slab's scene.json loses the field, so each baked town re-bakes its scene. 'hero' as a focus id retires
   with it (focusObject's key-0 default).
5. **Register:** OPERATIONS (Arch placement, the Hero lines), FEATURES if the capability reads differently; superseded lines to the Diary.

## 4. Gates
- The Arch's world position is constant across a recorded camera move (a check that drives the movie, or reads the placement by source).
- SCREEN-SPACE REGISTRATION: during playback, the hero matte's rect matches the Arch's projected bbox in the SAME frame (the world-position
  gate alone would pass and still miss leads (a) and (c)); mutant (the rect from the previous frame) → RED.
- The glint carries no town constant (a source check; mutant: a numeric camera offset restored → RED).
- No reader of `heroSubject` remains; the migration carries LS's hero (the Arch) into its first key (planted design.json row).
- The existing DoF checks stay green (hero-focuses-the-object, the no-focus-blur-is-the-towns, hero-matte-is-coverage).
- Jacob's eye on LS's Hero in Stage, night and golden.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. No server without Boz's word (Jacob's live stack is
:5173/:3333/:3334; a temporary :5190 from your worktree is the pattern, read-only against his). PTown's Monument is the model, so
don't change it.
