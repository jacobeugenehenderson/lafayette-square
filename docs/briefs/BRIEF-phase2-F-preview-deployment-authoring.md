# BRIEF — Phase 2 · F: Preview authors the deployment layer, beside the measured problem

<!-- BRIEF-STATE
status: OPEN
dispatched: no (agent: Plumb, carrying on from E)
written: 2026-10-04
evict-when: v1 — per-surface deployment controls in Preview (desktop / phone-hi / phone-lo) autosave to cartograph/data/<map>/deployment.json, ride the manifest, and the Ward and Preview apply them through one kit function; Preview ranks the measured problem beside them by share; inspection toggles never reach deployment.json; the checks are green and mutation-tested; Jacob has authored a phone tier and seen it on staging. v2 (the startup-timeline control) is boarded with its engineering dependency, not built.
-->

**Boz drafted this 2026-10-04 from Jacob's rulings and the input of Plumb (E), Lens (B) and Seal (C); Jacob dispatches. Plumb carries
it, continuing from E.** Phase 2: *Technical-Director Controls* + *Deployment / Mastering*, the payoff of E's measurements.

## What Jacob asked for

*"We still don't have anything/place that says 'here is your problem, and here are the possible fixes.'"* And the shape, which
overrides an earlier try/commit design: *"It's an authoring surface like the others; it's just a specific layer of authoring. So when
I click Phone hi, I can adjust the relevant controls, and where I leave them is where they bake."*

⇒ **Stage authors the creative layer; Preview authors the deployment layer, per surface.** Where the operator leaves a surface's
controls is what that surface bakes. No "try", no "commit": autosave, like Stage.

## Bounds

You know the territory from E. ⛔ No pours; bake-in-flight before saving anything the dev servers import; ports 5173 / 5180. Commit only
your own paths through your private index. Lens (B) shares `src/preview/PreviewApp.jsx` per your agreed split. ⚠️ Any kit function the
Ward must call needs a Ward pin move; batch it with whatever else is waiting (Lens has a B patch ready; your startup marks also ride the
next pin), and the push and bundle publish need Jacob's confirmation in your window. **Three-part fix**: registers `cartograph/PREVIEW.md`,
`OPERATIONS.md` § Preview, and `FEATURES.md` (this is a capability an operator will be told about).

## v1 — build it

### 1. The one authority: `cartograph/data/<map>/deployment.json` (Seal's design)
- **Per town, one file**, keyed like `town-id.json`: `{ surfaces: { desktop:{…}, "phone-hi":{…}, "phone-lo":{…} } }`. ⛔ Not in the Look's
  `design.json`: the Look is cosmetic and per-Look, deployment is per town and per target, and nine bake steps read `design.json` whole,
  so every policy tweak would re-run geometry.
- **It reaches the Ward inline in the manifest** (`manifest.deployment`), written by the manifest step every bake already runs
  (`b8e0c3f8`): a few hundred bytes in the file the Ward already fetches once. Not another slab.
- **v1 is runtime switches only:** which post-effects run (today's `qualityProfile.js` `postFxOff` becomes this data), tier choices, and
  a choice among artifacts that already exist. So only the manifest step declares `deployment.json` as an input; a policy change costs a
  manifest rewrite and upload, and nothing geometric re-runs. ⛔ A policy that changes what is PRODUCED is a real bake input: out of v1.
- **Absent is stated, never guessed:** a surface with no entry means everything on (the kit's default-on doctrine, as `moduleOn`), and
  the manifest says so (e.g. `deployment: { authored: false }`).
- **One reader:** the Ward and Preview apply the policy through **one kit function**, re-exported from `Town.jsx` as `tenantOf`/`titleOf`
  are, so Preview shows exactly what the Ward does. `includesPass` reads it.
- **Staging and production share one policy per town** (Promote copies the manifest). If they ever need to differ, that's an
  Operations field, not this one. *(Default; Jacob hasn't ruled otherwise.)*

### 2. The deployment controls in Preview, per surface
- Select **desktop / phone-hi / phone-lo**; that surface's controls appear; edits **autosave** to `deployment.json` (debounced, flushed
  before anything that depends on it, the same discipline as Stage's design autosave).
- ⛔⛔ **Inspection vs deployment, the spec's own line:** *"Inspection controls must not modify Stage intent. Deployment decisions must
  not masquerade as inspection toggles."* Preview's existing mute/solo (localStorage `preview.layers.v3`) stays temporary and **never**
  feeds `deployment.json`. The two kinds must look plainly different, so muting a layer to measure it can never quietly become "phone-hi
  ships without trees". ⛔ Don't route deployment through Stage's `layerVis` either: it's creative intent and already a bake lever.
- Controls only for levers that exist (each effect per surface; the tier tuner's ladder rungs are labelled unfinished, so offer them
  only if the ladder actually responds). ⛔ No manufactured knobs: *"Tie controls to measured problems rather than manufacturing generic
  quality knobs."*

### 3. The diagnosis, beside the controls (Plumb's own rules)
- **Rank by SHARE of triangles, draws and bytes**, which hold across devices. ⛔ Never "85% of the frame": the same 30.57M tris cost
  182 ms on the desktop GPU and 58 ms on phone-hi. **Time is ranked only by toggle deltas, marked non-additive.**
- **Over/under only against measured budgets.** `deviceProfiles.js`'s phone budgets are placeholders; say so wherever they appear.
- **Every millisecond is labelled as this desktop's GPU**, never a phone's.
- **The one new instrument:** a static per-piece attribution of draws and triangles from the scene graph (shown meshes, index ÷ 3 ×
  instances), in `Residency.jsx` beside memory. You have it in a probe (LS Browse: trees 25.36M, lamps 2.50M, ground 0.17M, buildings
  0.03M; agreeing with the render() count to ~9%, the gap unexplained).
- **Each cause names its kind of remedy:**
  - **deployment**: a control in this panel; go to it.
  - **creative**: camera framing (fov, Browse frame, Hero path, eye height), density. Shown as *"this costs X; the operator can change it
    in Stage."* ⛔ Never offered as a fix here and never ranked as "the problem" (Lens; `CLAUDE.md` Layer 0 q3). ⚠️ LS, PT and Huron's
    current Browse frames came from the old recorder and aren't reviewed: don't judge them.
  - **engineering**: points at its ROADMAP item (e.g. tree-card weight; the shared wind sheet that flattens cards). **"Don't load that
    yet" is engineering today** (Jacob): no setting defers anything yet, so it's offered as a ticket, never as a switch.

### 4. Reproducible readings (Lens)
A before/after only means something at the same movie time, viewport and tier: pin them. Frame through `<Town>`'s own `ShotFlight`
destinations, never a Preview camera. Controls are **buttons, not canvas gestures**: `claims-the-camera-has-one-definition` (d) fails on a
wheel or pointer listener in `PreviewApp.jsx`.

### Checks
- Every policy key the manifest carries has a reader in **both** the Ward's import graph and Preview's (the
  `claims-the-ward-reads-what-the-manifest-bakes` pattern).
- Preview and the Ward resolve a surface's policy through the same function.
- `deployment.json` is never written from an inspection toggle.
- Mutation-test each.

## v2 — record it, don't build it: the startup timeline as authoring (Jacob's idea)

On E's startup strip (the marks through FIRST TRUTHFUL FRAME = WARD USABLE), the operator **drags each asset class across that line,
per surface**: left means it must be there before the Ward is usable, right means it arrives afterwards. Where the markers are left is
what bakes, into `deployment.json`. It is the spec's *Residency / Activation* made into authoring (BAKED → VISIBLE → SELECTED →
OPENED). ⛔ **Dependency:** the runtime must first be able to defer each asset class. Today only fragments exist (the overhead discs
warm on entering Browse, `useOverheadWarm`); there is no general mechanism. Board the engineering and v2 on ROADMAP as one item; ⛔ don't
build a control that defers nothing.

## ⭐ The goal this serves, and where the cost is (Jacob, 2026-10-04)
F v1 is the floor of a bigger goal: **Preview as a first-class technical-director app**, whose centrepiece is **two dials, the timeline (WHEN) and the pyramid (HOW MUCH)**, with per-effect toggles as the coarse fallback (ROADMAP, "GOAL: Preview becomes a first-class technical-director app"). Build v1 so both dials can write the same `deployment.json` later.
⚠️ **Rank by where the cost actually is.** Jacob: *"we [think we] know the main draws are in the ground layer and trees, so switching off the little channels barely moves the relevant needle."* Trees are measured (25.36M of ~28M tris, LS Browse). The ground is 0.17M tris, so its cost, if large, is shading/fill: **time it by toggle delta as the diagnosis's first reading**, and say plainly if it isn't large. ⛔ Don't let a tidy list of small effect toggles dominate the panel; lead with trees and ground.

## Deliverable

v1, its checks, the registers, and the v2 + engineering ROADMAP item. **Read this, the spec (verbatim at the end of
`cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`) and the code, tell Jacob what you found, then build. If the code
contradicts this brief, stop and flag him.**
