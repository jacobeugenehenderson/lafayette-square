# BRIEF — the Arch stands where it is: a set-piece at its real coordinates, with a presence scale; the Survey Hero retires

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-28 night, Boz, Jacob: "if we can fix the arch tonight that's better")
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
- The Survey Hero (`SurveyorPanel.jsx` HeroSubjectPicker → `heroSubject` in the store and design.json). Its readers today:
  `CartographPost.jsx#hasFocusObject` (the first key's focus fallback and the town-anchored blur's gate), CartographApp's channels, and
  the Stage Horizon card's knob choice. The camera stopped reading it 2026-09-26.
- NOT ESTABLISHED: what "tied to the camera" was, or what made the Arch start to "bounce". Find it first: `git log -p` on GatewayArch.jsx
  and SetPiece.jsx and the camera/DoF commits of 10-27/28 (237ee4db, ca8b9093, the town-anchored blur). Measure the Arch's world position
  across a camera move (it should be constant), and whether the "bounce" is position, a depth/DoF effect, or a screen-space term.

## 2. The rulings this builds (registry)
- `r-stage-focuses-the-object-and-captures-the-screen` (Hero focuses the object; Street the aim; no focus object = the town-anchored blur).
- Jacob's go on the set-piece move above, and his idea of retiring the Survey Hero; ask Boz to file both as rulings when you confirm them.

## 3. The work, in order
1. **Establish the bounce** (§1, last bullet). Report it before anything else.
2. **The Arch joins the set-piece contract:** placed from its REAL coordinates (lat/lon, sourced and cited, never typed from memory),
   projected through the town's geography, so the distance and bearing are derived, not authored. Plus ONE authored **presence scale**
   (Jacob's first value ×2; size and height scale together), and Foot-fade kept. Outside the disc is expected.
3. **Delete the LS constants** in the glint; derive its terms from the Arch's own position and the camera (three-part fix).
4. **Retire the Survey Hero:** focus lives only on keyframes; the first key names its object or none (none → the town-anchored blur).
   The Horizon card's knob choice comes from what the Look has (an arch or a backdrop). Remove the picker, the store field and the
   design field, with a migration that turns a town's existing heroSubject into its first key's focus (so nothing authored is lost).
5. **Register:** OPERATIONS (Arch placement, the Hero lines), FEATURES if the capability reads differently; superseded lines to the Diary.

## 4. Gates
- The Arch's world position is constant across a recorded camera move (a check that drives the movie, or reads the placement by source).
- The glint carries no town constant (a source check; mutant: a numeric camera offset restored → RED).
- No reader of `heroSubject` remains; the migration carries LS's hero (the Arch) into its first key (planted design.json row).
- The existing DoF checks stay green (hero-focuses-the-object, the no-focus-blur-is-the-towns, hero-matte-is-coverage).
- Jacob's eye on LS's Hero in Stage, night and golden.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. No server without Boz's word (Jacob's live stack is
:5173/:3333/:3334; a temporary :5190 from your worktree is the pattern, read-only against his). PTown's Monument is the model, so
don't change it.
