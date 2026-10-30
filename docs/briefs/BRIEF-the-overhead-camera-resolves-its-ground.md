# BRIEF — the overhead camera resolves its ground: Browse/Society's depth precision comes from where the camera is

<!-- BRIEF-STATE
status: OPEN
dispatched: Gimbal (2026-10-30, Boz; URGENT: the live PTown site, phone)
evict-when: on a phone, PTown's Browse and Society draw the harbour as water (no seabed through it) and roofs without z-fighting, at
every overhead zoom; the camera's depth range is derived from the scene, never a typed number; a check reads it and its mutant (today's
fixed near) is RED; desktop unchanged; merged on Zob's PASS; Jacob's eye on his phone on staging, then the release.
-->

**You are Gimbal** (the aimer's author: you know cameraRegimes / RegimeControls). **Report to Boz.** **Confirm-then-build**; Zob reads
the plan first. URGENT, but measured: a fix that only moves the problem is worse than none.

## 0. The defect (Jacob, 2026-10-30, on his iPhone, provincetown.online)
- "Major Y axis conflict … Browse/Society camera and water and rooftops in particular. Water is particularly bad." · Society: "almost
  no visible water, only seabed".
- Ward reproduced it headless (iPhone emulation, phone-lo): sand-coloured, straight-edged strips across the harbour. DESKTOP is CLEAN.
- No rollback exists (Ward: production's manifest key is unversioned; tonight's Promote overwrote it). The fix is forward.

## 1. Zob's read (R read · M measured · I inferred; integration f4eb832b, slab bakedAt 1793335374399)
- R: Browse → shot 'plan' → `Town.jsx` shotExag 0, so every `× uExag` term is 0 and each layer stands at its baked y.
- M: PTown's `bed` (renderOrder 50, beach sand) at y = 0.0000; `water` (51) at y = 0.102 (51 × GROUND_Y_EPS). Water is 10.2 cm over
  the bed at plan, on every surface.
- R: phone profile `logDepth: false` (qualityProfile.js QUALITY.phone), desktop `true`. near = TOWN_CAMERA_NEAR_M = 1, far = SKY_RADIUS
  × 1.1 = 60,500 (TownOptics).
- M: browseFrame altitude 3015, fov 45. I: planAltitude ≈ 6.5 km on a 390×844 phone. I (24-bit depth assumed): phone linear depth step
  at 6.5 km ≈ 2.5 m (z² / (near · 2²⁴)); the 0.102 m slot is 1/25 of it. Desktop log depth ≈ 2 mm.
- M: the new pour put bed under ALL water (bed 56.12 → 58.17 km² = the water's); the y ladder is unchanged, so this is a standing
  phone defect the pour made visible. I: rooftops are the same mechanism (parts within a depth step tie).
- R: the Designer is clean by construction: its coplanar ground family is painter-ordered (`MapLayers.jsx`, distinct renderOrder +
  depthWrite false; `claims-coplanar-ground-has-a-painters-order`), on an ortho camera with near 0.1 / far 2000.

## 2. The means (measure, then propose)
(a) **The overhead regime's depth range derived from the scene:** near = the camera's height above the highest drawn thing under the
frustum (the town's tallest roof, derived), far = what the frustum reaches (the disc, its horizon cover, the sky dome as the overhead
camera can see it). At 6.5 km, near ≈ 6 km instead of 1 m shrinks the step by orders of magnitude. Per regime, in `cameraRegimes`
(the one home), updated as the camera zooms. Say what in Browse sits above the roofs (labels, the selection ring, neon, the sky).
(b) **Log depth on the phone** (QUALITY.phone.logDepth): measure its cost on phone-lo (the profile turned it off for a reason; find it).
(c) **The painter's order for the flat ground family at plan** (the Designer's way): water over bed by renderOrder, not by depth.
Probably right for water, but it doesn't help roofs.
Bring (a)–(c) measured: the depth step at each overhead zoom on phone and desktop, the screenshots (Ward's harness), the cost. My lean
is (a), plus (c) for the ground family only if (a) alone leaves a residue. It's Zob's code call.

## 3. Gates
- Phone-emulated headless Browse and Society on PTown production's slab copy (and Huron, HPDM): no seabed through the water; roofs clean;
  the movie and Street unchanged; desktop unchanged.
- A check that reads the regime's depth range: no fixed near in the overhead regime; mutant (near 1) → RED.
- Jacob's eye on his phone, on staging, before the release.

## 4. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. :5190 headless on Boz's word (granted for this
brief: one server, killed after). No publish or promote. The release order (pin → staging → Jacob's phone → Promote) is Boz's.
