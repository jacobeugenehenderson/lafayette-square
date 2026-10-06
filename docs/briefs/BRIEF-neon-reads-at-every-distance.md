# BRIEF — neon reads at every distance, belongs to its place, and the whole building selects

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to the session `Boz the Younger`.**

**Instruction: confirm-then-build.** Read the canon and code below and tell Boz what you found. If the code
contradicts this brief, **stop and flag**. **Town: Huron**, along its Hero camera move. Then Lafayette Square.

---

## 0. What this is (Jacob, 2026-10-06)

*"The idea is that a person can see active places."* Neon is how an open place shows itself on the map.
*"The camera move gets very close to and very far away from the neon. Far away, it disappears. Close up, it's
blown out and huge to be visible from far away. And neither is totally perfect."* *"I like how realistic we are
able to make the neon but I would settle somewhat for a workable alternative that places ease of viewing over
realism."* **Selection is a subset of neon:** *"the whole building and whatever eventually gets stuck to it is
part of the selectable surface."*

**Three rulings (Jacob, 2026-10-06):**
1. **Two drawings, handed off by distance.** Up close, a real-sized tube (a few cm) at today's realistic look,
   never inflated. Far away, a glowing line of fixed on-screen thickness, so it reads at any distance; at the far
   extreme a glowing dash. A crossfade by on-screen size hands one to the other, with brightness balanced across
   it: the near tube doesn't bloom out, and the far line doesn't vanish into the haze.
2. **Neon belongs to a PLACE, not a building.** Each open place gets its own neon on its own stretch of the
   building face, at that part of the building's roof height. Not one ring round the whole roofline: buildings
   carry several addresses, and stepped roofs (`BRIEF-building-detail-stoops-and-facades §6.4`) carry several
   heights. The slab ships the few points per place; the player builds the neon live. A building whose places are
   all closed stays dark.
3. **Selection lights the WHOLE building.** Clicks already resolve walls and roof to the building
   (`SlabBuildings.jsx#idAtFace`), but the highlight is only a thin ring at the base (`SlabSelectionRing`). The
   highlight becomes the whole building, and anything attached to it (its neon first) clicks through to it.

## 1. Read first

- `cartograph/ARCHITECTURE.md §8 "Neon renderer"`: the one merged mesh, the two-stage gate (WHICH = open by
  hours, HOW BRIGHT = the TOD neon channel, one `NeonDriver`), DoubleSide + additive with **no front-face flip**
  (`feedback_neon_cylinder_doubleside_no_flip`), log-depth chunks.
- `SLAB-CONTRACT.md` (`buildings.json`'s per-building index: `footprint`, `roofOutline`, `zoning`; the `neon`
  channel's fields).
- `src/components/SceneNeon.jsx` header: **hours are the sole arbiter**, and a town with no hours is dark — that
  is correct, ⛔ never a default window (Jacob, 2026-09-10).
- `BRIEF-building-detail-stoops-and-facades.md §1–2`: a 911 address point marks the **face** reliably (358/358 inside
  their footprint, 355/358 on the half facing their street) but **not the door's position** along it.
- `CLAUDE.md` Layer 0: every size and handoff is a Look value with a neutral default, never a number tuned to Huron's
  camera. ⛔ "It's only seen from far" is not an argument; judge it at the close camera too.

## 2. Code sites

| what | where |
|---|---|
| the tube: geometry, the 2.5 px floor that inflates it (`MIN_SCREEN_PX`, `uMinPx`/`uMaxPx`), `DEFAULT_TUBE_RADIUS` | `src/components/NeonBands.jsx` |
| which places are lit, and their building | `src/components/SceneNeon.jsx`, `src/lib/openNow.js` |
| the neon channel (core · tube · bleed · emissive · tubeRadius · screenFloor · screenCeil) | `src/cartograph/skyLightChannels.js` (`NEON_FIELD_KEYS`), `src/preview/neonState.js` |
| the building index + pick + highlight | `src/components/SlabBuildings.jsx` (`idAtFace`, `SlabSelectionRing`), `src/hooks/useSlabBuildingIndex` |
| the buildings bake (where per-place points would be written) | `cartograph/bake-buildings.js` |

## 3. Sequence (each landing alone, measured, eye-gated)

1. **Confirm and measure (read-only).** On Huron's Hero camera move, record the tube's on-screen size and
   brightness at the near and far ends (`BRIEF-hero-arrival-perf` step 0's frame recorder, if it has landed; else
   name your instrument). Report what "blown out" and "disappears" are, in numbers. Where a cause is not measured,
   write "cause not established". **Stop and report.**
2. **The two drawings.** The far line is a screen-space line (fixed pixel width) along the same points; the near
   tube is physical and never inflated. ⛔ The inflate-the-geometry floor is removed in the same commit, not left
   beside the new path. Sizes, handoff and brightness balance are fields of the Look's neon channel, with neutral
   defaults. ⚠️ Changing the channel's fields changes what Stage authors: show Boz the panel before building it.
3. **Neon per place.** The bake ships, per place, the stretch of face it lights (its address's face, from the
   town's address points or the listing's) and the height. The player builds it live.
   - Where a town has no face evidence, the place lights its building's frontage on its own street, **counted**.
     ⛔ Never a silent whole-roofline fallback.
   - Count the places that could not be placed at all, by cause.
   - ⚠️ This adds to the buildings bake: Huron needs a buildings re-bake (minutes). ⛔ Clear any bake with Boz first.
4. **The whole building selects.** Highlight the selected building's whole mass, not just a base ring. The neon,
   then anything else attached to a building, is pickable and resolves to that building's id.
   - Check: clicking a wall, a roof or a neon tube each selects the same building; a click on empty ground selects
     nothing.

## 4. Bounds

- **Writes:** `src/components/` (NeonBands, SceneNeon, SlabBuildings), `src/cartograph/skyLightChannels.js` (neon
  fields), `src/preview/neonState.js`, `cartograph/bake-buildings.js` (step 3 only), `checks/`.
- ⛔ Another agent (Sill) works in `src/lib/tileGround.js`; a perf agent may be in the renderer
  (`BRIEF-hero-arrival-perf`). Tell Boz before touching a file another brief names.
- The renderer is shared with The Ward: a change ships at the next Publish. ⛔ No Publish or Promote from you.
- Commit through explicit paths only (`BOZ §3.7`). **Registers:** `FEATURES` (neon you can see from anywhere, per
  place; the whole building selects) · `OPERATIONS` (the neon channel's fields, in place of the ones they replace) ·
  `SLAB-CONTRACT` (the per-place points) · `ARCHITECTURE §8` (the renderer, rewritten in place).

## 5. Done when

On Huron's camera move, every open place's neon reads from the farthest frame to the closest, is never blown out up
close, and sits on its own place's face. Clicking a building's wall, roof or neon selects it, and the whole building
lights. Lafayette Square is no worse. Jacob's eye in Preview, scene and shot recorded.
