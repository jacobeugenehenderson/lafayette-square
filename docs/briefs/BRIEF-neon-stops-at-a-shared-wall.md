# BRIEF — neon stops at a shared wall: the roofline ring runs on the building's open edges only

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-17
evict-when: RULING: Jacob, in the Ward at Browse and Hero on LS and HPDM, sees two lit buildings side by side with no overlapping or doubled tube along their shared wall, every lit building still visible from every side, and the change is committed with the code it replaces removed.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each one against the code and say what
you found. If the code contradicts this brief, stop and flag Boz before building.

## 1. What Jacob asked (2026-10-17)

*"We built the neon to overhang the buildings. Unfortunately, in places where 2 buildings are side by side the neon
overlaps unattractively. We briefly had the neon limited to the front face of a building, but it didn't call enough
attention, so I returned it to a full footprint ring."*

**Ruled (Jacob, on Boz's recommendation):** keep the overhanging roofline ring, and run it only along the building's
**open** edges. Where a building shares a wall with a neighbour, the tube stops and meets that wall at the roofline.
Not chosen: shrinking the ring to the footprint and raising it (it loses the outward read, and two neighbours still draw
a doubled line along their shared wall). Also not chosen: street faces plus a light wash. The front-face version was
already too quiet, and roof tint is the channel that must work at 10 a.m. (theward `README.md`, "Lighting shows the
rest"). A night spill onto the ground is a possible later addition, not this brief.

## 2. What is true today (read by Boz; confirm)

- **The ring.** `src/lib/neonPlaces.js#placeNeon` gives a building with any lit place its WHOLE footprint at the eave. Its
  places share the ring in equal arcs by id (00300152, Argon). It already receives every building (`entries`), so the
  neighbours' footprints are in hand. Nothing is fetched.
- **The overhang.** `src/components/NeonBands.jsx#buildPath` sweeps the tube at `OFFSET_OUT` (0.5 m) outside the
  wall. Convex corners take an arc, concave ones a mitre. Two neighbours' tubes overlap because each sits 0.5 m out
  over the other's roof.
- **⚠️ The docs disagree with the code (rot).** `cartograph/ARCHITECTURE.md` (the neon paragraph, "Two drawings of one
  sign…") still says each lit place draws "its own stretch of its building's wall … address face, else its street's
  frontage". The code has drawn the ring since 00300152. Fix it in this commit (part 3 of the fix, below).
- **The checks that exist:** `checks/claims-neon-per-place.mjs`, `claims-neon-two-drawings.mjs`,
  `claims-neon-picks-its-building.mjs`. Read what each one asserts before changing anything they cover.

## 3. The work

1. **Find the shared edges, from the footprints.** A footprint edge is SHARED when another building's footprint lies
   within the overlap distance of it along its length. Derive that distance from the overhang itself (two tubes collide
   when the gap between walls is under `2 × OFFSET_OUT` plus the tube's own radius). ⛔ Never pick a number that looks
   right on LS (`CLAUDE.md` Layer 0, Class D).
   - Decide edge by edge, and split an edge where the neighbour's wall starts or stops. A long wall half-shared with a
     shorter neighbour keeps its open half.
   - Say how buildings that only touch at a corner come out.
2. **Draw the ring on the open edges only.** The ring becomes one or more open runs. At a shared wall the tube ENDS:
   its last point sits where the open edge meets the shared wall, at the eave, with no overhang carried across the
   neighbour's roof. Multi-place buildings still share the open length in arcs. A building with no open edge at all
   (fully enclosed) is counted and reported, never silently dropped (no fallbacks).
3. **Keep what already works:** the two drawings and their hand-off, the colour, the pick (a click on a sign still
   selects its building), the per-place arcs, the hours gate, and the corners' arcs and mitres on the open runs.
4. **The check, seen RED first.** Extend `claims-neon-per-place.mjs`, or add one, so it reads `placeNeon` on a baked slab
   and fails when any lit tube runs within the overlap distance of a neighbour's footprint. Mutation-test it: put a
   shared edge back and see it fail.
5. **Three parts** (`CLAUDE.md`):
   - delete what the ring-everywhere path leaves unused;
   - name the register (`cartograph/ARCHITECTURE.md`'s neon paragraph, and `FEATURES` if the capability reads
     differently to a marketer);
   - move the superseded text to the Diary.

## 4. Bounds

- Kit code only (`neonPlaces.js`, `NeonBands.jsx`, a check). It reaches the Ward at the next kit-pin move, batched with
  the waiting Ward features (`BRIEF-ward-browse-noon-and-the-far-trees` state block). ⛔ No Publish, Promote or Stage;
  the pin move and publish are Jacob's.
- No bakes are needed: the ring is built live from the slab's footprints. Check any town's slab with the existing
  checks. One heavy job at a time on this machine; this brief should need none. Ask Boz before any long run.
- Eye-gate in the Designer or Preview against LS and HPDM (row houses vs detached). Show Jacob screenshots, never his
  open view, while it is unready.
- Commit by pathspec only. Write "cause not established" for anything you didn't measure. Name the register, or write
  "reaches no register".

## 5. Done when

Two lit buildings side by side draw no overlapping or doubled tube along their shared wall, on LS and HPDM. Every lit
building is still ringed on all its open sides. The check fails on today's code and passes after, mutation-tested.
`ARCHITECTURE`'s neon paragraph describes the code.
