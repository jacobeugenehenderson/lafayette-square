# BRIEF — the Ward: Browse comes back as its own view, a noon toggle under the rose, and the hang into Browse

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-14
evict-when: RULING: on staging at phone size, Jacob drags from the movie into Browse without a hang, returns by Home, sees idle go to the movie, and toggles noon and back with neon at its real state; the hang's cause is measured and its fix gated by that measurement.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>` in BOTH repos, then `/rename`). **Agent: FRESH.**
**Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each against the code and the docs and say
what you found. If they contradict this brief, stop and flag Boz before building.

**Two repos.** The kit is this repo (the renderer, the camera, the trees). The Ward is `~/Desktop/dev.nosync/theward`
(its own `README.md` is its law; it pins a kit commit). Read both before planning.

## 1. What Jacob asked (2026-10-14, verbatim)

- *"We are hanging on the move into browse view. I think this is because of impostor load; I think we should add another
  layer of impostors: we have the 3-layer version we use now which we could associate with a certain camera height and
  beyond that height we could use a stamped 1-layer version. I think this would not add weight?"*
- *"We need a 'lightbulb' (or sun, or brightness, or something) button, I think it's the same size and under the compass
  rose button, to turn any time of day to noon. We'll need to figure out protocol re: neon, etc."* Then: *"the neon
  should go to contemporary state at noon. If it toggles easily the user can just literally toggle back and forth to
  see 'what's happening'."*
- *"I also think we should re-add the ability to drag the map down into browse view. I think the mistake we made is
  conflating browse/society. Now that we have the 'home' button we can always return to hero, and we can maintain the
  'idle state goes to hero' motif we already use."*

## 2. What is true today (read by Boz; confirm)

**The hang.**
- Grain's overhead redesign landed: every band is 2 triangles (`fc2c8145`, re-measured `626b57e8`). The 28×28 grid that
  was Browse's measured cost is gone, so steady-state overhead geometry is about 6 triangles per tree.
- A Browse-entry hitch was already fixed once: the overhead discs are prepared behind the emblem with the town, and the
  idle-callback warm is deleted (`4e860c43`, Strobe; the comment in `InstancedTrees.jsx` beside `useOverheadAssets`
  records 173–215 ms of link+upload on Huron on the first flight). The Ward's pinned kit (`926ac3a4`) includes it.
- So the hang Jacob sees now is **cause not established**. Impostor load is Jacob's hypothesis; a far 1-layer tier cuts
  steady draw (6 → 2 triangles a tree, 3 → 1 layers of overdraw) but would not cure a one-time load, compile or upload
  at the switch.

**The far tier's weight** (Jacob's question). If the far tier draws the canopy band alone from the atlas the trees
already carry, it downloads nothing new. A separately baked flattened picture adds one small atlas tile per species.
Confirm against the atlas manifest (`overheadBySpecies`) and the Grove's overhead capture.

**The Ward's own rules this touches** (`theward/README.md`; quote them back):
- §2 "Five [screens], and no others": Leisure (the movie, the Home room), Society (list on top, map below), Bulletin,
  Place, Street. There is no Browse screen: Browse is Society's map.
- §3 "The scene can be touched, but it never takes you anywhere. Only controls take you places." and "a tap on the awake
  movie … never steers the movie, and the touch that wakes a resting screen does nothing else."
- §2 Leisure rests after `REST_AFTER_SECONDS`; the kit's own idle → hero is in `Scene.jsx` (`goHero` under "Idle → hero").
- §3 "Lighting shows the rest": the rose sits there, and "Neon is lit only while a place is open, so the roof tint is the
  channel that must work at 10 a.m."
- ⇒ **Jacob's drag-into-Browse and a Browse apart from Society change §2 and §3.** That is his call and he has made it;
  your job is to name every sentence that changes and bring the new wording to Boz before building, so the README stays
  the law and no rule is silently broken.

## 3. The work, in order

1. **Measure the hang first.** On the Ward at its pinned kit, phone size and desktop, on LS, Huron and HPDM: a frame-time
   trace of the move from the movie into the plan, with what runs in the long frames (shader compile, texture upload,
   geometry build, React mount, a fetch). Use what exists (Preview's cold-start strip, `phoneBus`, Strobe's and Grain's
   probes, `scratch/tree-cost/probe.mjs`); don't build a new harness if one answers it. Report the long frames and their
   cause, measured.
   - If the trees are the cause, the far 1-layer tier is the candidate: design to Boz (the height split derived from the
     town, never a constant that fits LS; reuse the canopy band if it reads right; the 3-layer stack stays below the
     split). ⛔ Not an LOD that degrades to nothing at the close camera (`feedback_build_for_close_inspection`).
   - If not the trees, bring the cause and its fix instead.
2. **Browse, apart from Society.** Propose to Boz, then Jacob, before building: where Browse lives among the screens
   (§2's table), what gesture enters it from the movie (Jacob: drag the map down), how Home returns to the movie, and how
   idle returns to the movie from Browse. Name each README sentence that changes and its new wording. Society keeps its
   list-over-map; what changes is that the plan is no longer only reachable through it.
3. **The noon toggle.** A round control the rose's size, directly under it, in the Ward's own style (`README §5`).
   - A **toggle**: tap → noon; tap again → back to the real time. The sky, sun and light go to noon.
   - **Neon stays at its contemporary state**, the real now (what's open lights, per §3), so toggling shows the town
     lit by day vs as it is now.
   - Say what else rides on time of day (lamps, the Almanac, the ticker, share images) and propose which follow noon.
     ⛔ The Almanac and the ticker report the real time; they don't lie because the light changed.
   - Where the light comes from in the kit (the time-of-day path the Look's curves read; `App.jsx` and the cartograph
     time stores are where to start) and whether a noon override already exists. Reuse it; don't add a second clock.
4. **Build** once Boz and Jacob have seen 1–3's proposals. Each fix in three parts (`CLAUDE.md`):
   - the old path gone;
   - the register named (the Ward's README/FEATURES/OPERATIONS; the kit's arborist docs for a tree tier);
   - superseded text to the Diary.

   A check per behaviour, seen RED first and mutation-tested: the noon toggle round-trips to the real time; idle returns
   to the movie from Browse; the hang's measured long frame is gone.

## 4. Bounds

- ⛔ No Publish, Promote or Stage without Jacob. A kit change reaches the Ward at the next pin move; batch it, and the
  push and bundle publish need Jacob's confirmation.
- The kit is busy: Swale is in `tileGround.js` / `bake-ground.js` on `swale/flatten-paths-r1`; stay out of the ground.
  Trees are Grain's territory (arborist), so if the far tier lands, agree it with Grain. The wind is Gale's module.
- One heavy job at a time on this machine: `uptime` load < 8, `memory_pressure` free ≥ 55% at launch; ask Boz for the slot.
- Commit by pathspec only; never `git add -A`. No new dev servers; reuse the running ones.
- Write "cause not established" for anything not measured.

## 5. Done when

Jacob, on staging at phone size: drags into Browse with no hang, gets home by Home, sees idle return to the movie,
toggles noon and back with neon at its real state. The hang's cause is measured and named in the commit, and every new
check is green after being seen red.
