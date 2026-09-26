<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: a set-piece is bound to a building id the way every landmark is, draws in the 2D views, carries its own authored lighting, the Pilgrim Monument meets all three, a check proves every declared set-piece does, and Jacob has seen Provincetown in the Designer and in Stage at night.
-->

# The set-piece contract: bound to a building, drawn in 2D, lit by its own light

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"The Pilgrim's Monument, like the Arch, needs custom lighting AND it needs to appear in the 2D views and needs to
be attached with building ID like all the other landmarks."*

## ⭐ How this is the kit, not a Provincetown patch

The kit supplies a **set-piece slot** (`src/instances/<town>.js#setPiece`, one mount in `SetPiece.jsx`). The town
**authors** which landmark fills it, and that authoring is the product (Layer 0, question 3). What Jacob is
asking for is the **contract the slot owes every set-piece**, whichever town declares it:
1. **Bound to a building id**, like every landmark: its listing, its picking and its card go through the same
   building id every other landmark uses.
2. **Drawn in the 2D views** (Designer, Browse), as a plan footprint in the same language as the buildings.
3. **Lit by its own authored lighting channel**: a Look channel with defaults, animated by the time of day,
   the way the Arch's `archLight` is.

⛔ Build the contract **in the slot**, not in `PilgrimMonument.jsx`. A town #2 that declares a set-piece gets all
three without anyone remembering to do it. `node checks/claims-every-app-mounts-the-set-piece.mjs` is the
precedent: the check reads the declaration and fails the set-piece that misses any of the three.

## What Boz found (confirm it; don't inherit it)

- **Building id.** Provincetown's `setPiece` declares `osmWay: 164024699` and a footprint, and no building id.
  The listing *"Pilgrim Monument & Provincetown Museum"* (`prov-lst-0005`) is on `building_id: msbf-427`.
  ⚠️ Not established: whether `msbf-427` is the tower's footprint, the museum's, or a merge of both, and whether
  the town's building list also draws a building where the set-piece stands (the same place drawn twice).
  Measure it by footprint geometry, not by name.
- **2D.** The Arch has a plan silhouette, `src/cartograph/DesignerArch.jsx` (black, catenary from above, Designer
  only). Nothing draws the monument in 2D.
- **Lighting.** The Arch's uplights and floor wash come from the `archLight` channel
  (`src/components/GatewayArch.jsx`, `ARCHLIGHT_FLAT_DEFAULTS` in `src/cartograph/skyLightChannels.js`), which
  is TOD-animatable and authored in Stage. The monument has none.
- ⚠️ **The Arch is outside the contract today** (`SetPiece.jsx` header: placed by a Look's `arch` channel, with
  its own Stage overrides; folding it in is `ROADMAP H-7`'s set-piece question). Say whether the contract fits
  the Arch as a second instance, but **don't move the Arch** without Jacob's go. LS stays as it is.

## Read first

`cartograph/OPERATIONS.md` ("A town's set-piece", "Arch placement", the Arch lighting card), `ROADMAP H-7`, the
delivered monument brief `cartograph/_archive/BRIEF-pilgrim-monument-site-2026-09-26.md`,
`src/setpieces/pilgrimMonument.js` (the model contract).
⛔ **Out of scope:** the Christmas-lights show (ROADMAP, *"the monument lights up"*). It's a separate brief when Jacob
says go. Design the lighting channel so the strands can later ride on it.

## Can the instrument see it?

A check that reads every town's `setPiece` and fails any that has no resolvable building id, no 2D draw, or no
lighting channel with defaults. Mutation: remove one of the three. Then Jacob's eye: Provincetown in the Designer
(the monument's footprint is there, and clicking it opens its listing) and in Stage at night (lit).

## Bounds

- Write: `src/instances/provincetown.js#setPiece`, `SetPiece.jsx` and the renderer, a 2D set-piece draw, the
  lighting channel (`skyLightChannels.js` and Stage's lighting card), and the check. No bake or pour without
  Jacob's go in your own window. If the building-id binding changes a baked artifact (listings, the slab's
  buildings), say which one and ask.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared. ⚠️ `CartographApp.jsx` may be
  held by the Stage-to-Designer agent; coordinate through Boz first.
- Canon: `OPERATIONS` (the set-piece's knobs), `ARCHITECTURE` (the contract), `FEATURES` if the capability is
  new to a reader. Commit messages name the register reached.

**The instruction is confirm-then-build:** read the code, tell Jacob what you found (especially the building-id
question), then build. If the code contradicts this brief, stop and flag him.
