# BRIEF — the disc is one source: drawn to the bb, lit once, and the light decides the slab

<!-- BRIEF-STATE
status: OPEN
premise: Zob, on 7389f2bd, folded in; build order §6; §1a merged (cec0b328); §1b/§2b with Kerf next
written: 2026-10-21 night (Boz)
evict-when: every reader of the boundary goes through one function of the ring; the census rows below are each closed
  or ruled; claims-membership-is-the-disc and the new one-reader check are GREEN on every poured town, mutants RED; merged.
  Then this moves to cartograph/_archive/ dated, and BACKLOG's "SPOTLIGHT CENSUS" block and the radius line leave with it.
-->

**Why this exists (Jacob, 2026-10-21):** *"Making the radius a SSoT has been a recurring project I'd like to finally scrub
from the backlog."* The order, in his picture (`ORIENTATION`, the compound shape): *"a big square map (the bb) rolled out on
a desk … a spotlight (the radius) … The map exists first, then we shine a light on part of it and it's that part that we
elevate"* · *"it's also about what 'makes it thru to the slab'."*

**What is already settled (read it, don't re-derive):** `cartograph/ARCHITECTURE.md` "The circle has one origin" (the disc
stores `radius`, `center`; the fade derives; geometry never reads the fade; the radius CUTS; membership =
`((polygon − exclusions) ∪ activate) − hide`, the disc only where no polygon is authored; two centrepoints, fetch vs hood).
`RIBBONS` shoreline doctrine (the coast closes against the bb; the circle stamps last). ⛔ The retracted model is
`_archive/HANDOFF-boundary-trio-SUPERSEDED-2026-07-21.md` ("derive the bbox from the circle"): the bb is the FROZEN DATA
EXTENT, never derived from the disc.

**Premises: Zob's census (2026-10-21 night, read on integration 6ba6cbf8; BACKLOG "THE SPOTLIGHT CENSUS").** Confirm each
against the code and say what you found; stop and flag Boz on a contradiction.

## 1. One reader

The boundary file is read five ways today: the ring · an authored `polygon` · a circle about `center` · ⛔ a circle about the
ORIGIN (`neighborhood-membership.mjs#makeMembership`, `scripts/17-fill-canopy-trees.mjs`; RED in
`claims-membership-is-the-disc`: LS 21 m, Huron 59 m at the rim) · constant margins (`discR × 1.25`, `radius + 50`, `discR + 50`).
- ONE module answers "is this lit?" and "where is the edge?" from the disc record (`boundaryRecords.mjs`): the ring, and
  membership by the canon's formula. Every reader goes through it. Analytic circles and origin circles are deleted, not
  re-pointed one by one.
- Membership has TWO implementations today (Zob, read): `membership.mjs#createMembershipFilter` is the canon's formula about
  `center` (pipeline's clips, bake-buildings); `neighborhood-membership.mjs#makeMembership` is a second copy, polygon or
  exclusions only, its disc about the ORIGIN (labels, lamps, the trees' dissolve and density). ⇒ one module: the canon's,
  centred; makeMembership becomes a thin reader of it or is deleted. An authored `polygon` is the operator's input to the one
  function, never a second selector.
- The Python fetch scripts (13/14/18) read the ring as data: for them the rule is "the ring, never an analytic circle",
  enforced by the reader row reading those files too.
- A margin that is a constant (`× 1.25`, `+ 50`; `STENCIL_BUFFER_M` is kit-shared with `LS_STENCIL`, so it has several
  readers) is Layer 0 class D. Derive it from the scene, or make it the town's
  authored value with a neutral default, or delete it when the order below makes it unnecessary.
- ⛔ ARCHITECTURE's open DISPLAY half (`ExtentApp#boundaryCentroid` returns `{0,0}` when committed; `CenterHandle` gated) is the
  same origin assumption: in scope.
- ⚠️ `checks/claims-radius-has-one-home.mjs` already exists and is GREEN (5/5) while five readers exist: it guards where
  the radius is STORED, never who READS it. Extend it with the reader row (no reader of the boundary outside the one module;
  reads the source; mutation-tested). Don't write a second radius check.

## 2. The map first, the light last (the pour)

- derive.js's land-use face walk pushes the ring into `streetPolylines`, splitting faces at the circle before they're voted
  and frozen. Faces are walked on the bb; the disc is applied to finished geometry (`mintProtopolygon`'s own header).
  No authoring orphans (Zob, read): segOrd comes from ribbon-street intersections (the ring isn't one), blockCustoms is keyed
  by skelId, blockLandUse by the ① block ring. What moves: `ribbons.faces`' vote is tileGround's land-use fallback for a piece
  no evidence reaches, so rim pieces may change class. Gate: the count of rim pieces whose class changed, per town.
- `clipStreet` → `ribbonsLayer.tiles` is DEAD WIRING (no reader in src, cartograph or checks; Zob, grep): delete the clip, its
  extractFaces call, the field and promote-ribbons' count line; SURVEY's `tilesFromFrozen` lines are ROT, to the Diary.
- `coastline.mjs#coastRings` drops water past `discR × 1.25`: water runs to the bb (Jacob, tonight).
- The sand line: ink in ① from the pour (`RIBBONS` shoreline doctrine, 6bfecabe). Coordinate with
  `BRIEF-the-rim-is-cut-once §5` (the overlays' one stamp); don't build it twice.

## 3. Height: only the lit part is raised

The height field's extent is `radius + 50 m` (`elevationSources.mjs#deriveStencilBbox`, moved from bake-terrain 2026-10-26 so bake-coast reads the same lattice; its own comment: "a THIRD derivation of the
same polygon"). Under the picture, height applies to what's lit: derive the extent from the one module. The bb's dark part
sits on a flat datum, stated, never "no field" read as zero.

## 4. The light decides the slab

Per family, one membership answers: buildings (pipeline's two clips; bake-buildings' cull) · trees (four selectors) ·
lamps · labels · content (POIs join a building inside; a 25 m join from outside is a second selector) · land use · the bed.
❓ **Rulings owed by Jacob before these become defects** (Layer 0 Q3): surveyed trees outside the disc (kept by design
today) · the outer coast's water past the rim (the horizon) · LS's buildings ledger skipping the cull · an authored polygon
that reaches past the disc (buildings follow the polygon while geometry clips at the ring).

## 5. Gates

`claims-membership-is-the-disc` GREEN on LS and Huron · `claims-radius-has-one-home`'s reader row GREEN, mutant RED · `claims-fade-derives-from-radius`,
`claims-fade-has-something-to-dissolve`, `claims-a-land-use-boundary-is-one-line` unchanged or better · a re-pour + bake of
LS, HPDM, Huron, PTown with no refusal · what each slab gained or lost at the rim, counted by family · Jacob's eye.

## 6. Build order (Zob's sizing; ship early)

1. §1a S: makeMembership reads the canon's formula about `center` → `claims-membership-is-the-disc` GREEN on LS and Huron;
   no re-pour (re-run labels, lamps, trees). 2. §2a S: delete `ribbons.tiles` (dead). 3. §1b M: every other reader through
   the module, constants derived or deleted, the reader row. 4. §2b M: the face walk on the bb (re-pour, rim land-use count).
5. §3 M heavy: the height extent from the module, the flat datum (terrain re-bake). 6. §2c L: water to the bb + the sand line,
   built WITH `BRIEF-the-rim-is-cut-once §5`. 7. §4 L: after Jacob's rulings.

## 7. Bounds

Builder: Kerf (confirm-then-build). Branch off integration in `.claude/worktrees/`; commit by pathspec; never push; Boz merges.
Heavy runs: one at a time, ask Boz. No Publish, Promote or Stage. ⛔ No fallback: a reader without a disc refuses by name.
Every fix in three parts: the old path deleted in the same commit · the register named (`ARCHITECTURE` "The circle has one
origin", `OPERATIONS` if a knob moves) · superseded prose to the Diary.
