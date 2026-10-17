# BRIEF — the Ward: Browse comes back as its own view, the Tower Light under the rose, and the hang into Browse

<!-- BRIEF-STATE
status: OPEN
dispatched: Meridian (window closed)
written: 2026-10-14
state 2026-10-16 (Boz): BUILT, NOT SHIPPED; held behind the upstream ground work by Jacob, not an emergency.
  - kit branch meridian/browse-light: f7079a4b AO half-res, 3f8f93c3 tilt, dd8ae900 Tower Light. Not on trunk.
  - Ward main: 892cf85, bce2fbb (drag down into Browse), 57f1302 (Society on its categories). Unpushed, unpublished.
  - Ward branch meridian/tower-light: 74d987d, the button. Not on Ward main.
  - Staging serves Ward 486b83d on kit 926ac3a4 (staging/ward/current.json); all four towns are set to the Ward.
  - To ship: merge both meridian branches; move the Ward's pin (theward OPERATIONS "The kit the Ward is built
    against", the worktree .claude/worktrees/ward-kit) to a kit commit holding them; build the Ward against it and
    run its checks; Jacob runs publish-kit-bundle.mjs, then npm run publish:staging in theward.
  - ⛔ ward-kit is the Ward's build input; never remove it.
evict-when: RULING: on staging at phone size, Jacob drags down from the movie into Browse without a hang, tilts it, returns by Home, sees idle go to the movie, opens Society to its categories without a hang, and toggles the Tower Light on and off with time, sky, weather and neon real; each hang's cause is measured and its fix gated by that measurement.
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
  Place, Street. (Before this brief there was no Browse screen; Browse was Society's map. Ruled below.)
- §3 "The scene can be touched, but it never takes you anywhere. Only controls take you places." and "a tap on the awake
  movie … never steers the movie, and the touch that wakes a resting screen does nothing else."
- §2 Leisure rests after `REST_AFTER_SECONDS`; the kit's own idle → hero is in `Scene.jsx` (`goHero` under "Idle → hero").
- §3 "Lighting shows the rest": the rose sits there, and "Neon is lit only while a place is open, so the roof tint is the
  channel that must work at 10 a.m."
- ⇒ **Jacob's drag-into-Browse and a Browse apart from Society change §2 and §3.** That is his call and he has made it;
  your job is to name every sentence that changes and bring the new wording to Boz before building, so the README stays
  the law and no rule is silently broken.

## 2a. Rulings, 2026-10-14 (Jacob, through Boz)

- **The hang, measured** (Meridian, `scratch/browse-hang/`): desktop = N8AO rebuilt at the shot switch → AO half-res in
  every shot (kit `f7079a4b`); phone = Society mounting the whole register as DOM, + the sort (Ward `892cf85`). The
  trees load nothing at the switch. The far 1-layer tier is not ruled.
- **Browse** is Leisure's second shot (`/map`), entered by a **downward** drag on the awake movie; Home and idle return
  to the movie. Five screens kept. **Tilt** in the plan view, polar only, its max lean set by Jacob's eye.
- **Society** opens on its categories; no list until a choice; an **All** chip, whose lag is expected and disclosed.

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
3. **The Tower Light** (was "noon"; Jacob re-ruled 2026-10-14). A round toggle the rose's size, directly under it,
   with a lamp or bulb icon. A real spot light over the ground point under the screen centre, mounted always, casting
   its own crisp (not PCSS) shadows, its footprint from the view. Time, sky, sun, moon, weather, neon, the Almanac and
   the ticker all stay real; phones get the light without shadows. Jacob: *"the user needs to be able to see the map
   and if it's at night the map is inherently dark. C may be the biggest cost but it's likely 50% or more of use
   cases."* It overrides the code-only doctrine "one shadow map, never two". Its cost is measured before it is built.
4. **Build** once Boz and Jacob have seen 1–3's proposals. Each fix in three parts (`CLAUDE.md`):
   - the old path gone;
   - the register named (the Ward's README/FEATURES/OPERATIONS; the kit's arborist docs for a tree tier);
   - superseded text to the Diary.

   A check per behaviour, seen RED first and mutation-tested: the Tower Light toggles without linking a program and leaves
   the clock, sky and weather stores untouched; a downward drag enters Browse and no other drag does; idle returns to the
   movie from Browse; Society arrives without a list; each measured long frame is gone.

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
toggles the Tower Light with time, sky, weather and neon real. Each hang's cause is measured and named in the commit, and every new
check is green after being seen red.
