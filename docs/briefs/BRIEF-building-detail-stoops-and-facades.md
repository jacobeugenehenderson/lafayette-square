# BRIEF — building detail: stoops from evidence, doors and windows as material

**You are the dispatched agent. Name yourself** — one word, yours, not one a RUNNING session holds
(`ListAgents`, then `/rename`). **Agent: FRESH.** **Report to the session `Boz the Younger`** (not "Boz the
Elder", who runs a separate work group).

**Instruction: confirm-then-build.** Read the canon and code below, tell Boz what you found, and if the code
contradicts this brief — **stop and flag**.

⛔ **NOT DISPATCHABLE YET.** It consumes what `BRIEF-nyc-adapter.md` acquires (BIN identity, NYC address
points, Building Elevation and Subgrade). Dispatch after that adapter lands (§2's door question is answered). ⭐ **Jacob, 2026-10-05: roofs and stoops, with procedural windows and doors, are
WANTED — they sell the shot, and cheaply.**

---

## 0. What this is (Jacob, 2026-10-05)

*"If we knew where door openings are and where the first story starts in Y, we could procedurally make
stoops; and we'll use materials to create windows and doors."*

Real streets are read through their buildings' ground floors: stoops, areaway stairs, shopfronts, doors,
window rows. The kit extrudes a footprint to a height on a foundation pedestal and has no notion of any of
them. ⭐ **The punchlist's rule governs: geometry only for what changes the silhouette (stoops, areaways,
later fire escapes and bays); everything else is MATERIAL** (*building mass → façade family → procedural
material*).

**The layering, as everywhere in the kit:** evidence where a town has it → a rule where it does not → the
operator's override on top. ⛔ Any rule value is AUTHORED per town (or state) with a neutral default —
never a constant that happens to be right for the first town (`CLAUDE.md` Layer 0, Class D).

## 1. The inputs, and what is measured (Boz, 2026-10-05, Jackson Heights / Queens CD3)

| input | source | status |
|---|---|---|
| **the front face** | the town's 911 address points (NYC `uf93-f8nk`; Ohio LBRS in Huron) — the face the point sits behind | ✅ measured: 358/358 points inside their own footprint, ~1.5 m from a wall; 355/358 in the half facing their address street |
| **how many entrances** | address points per building | ✅ measured (ZIP 11372, 2,863 buildings): 1 point → 2,433 bldgs, 14% commercial ground · several on one street → 129, 53% commercial, neighbours ~5.2 m apart (a storefront) · several on two streets (corner) → 174, 61% commercial |
| **where along the face** | the typology rule · OSM `entrance=*` where mapped · override | ✅ §2: the 911 point marks the FACE, not the door |
| **first-floor height** | NYC Building Elevation and Subgrade (`bsin-59hv`), joined by BIN: `z_floor − z_grade` | ✅ measured; ⚠️ `z_grade` is the LOWEST adjacent grade (an areaway bottom on a stoop-over-stairs house), feet, NAVD88 — **use the difference, never the absolute** |
| **typology** | the same dataset: `subgrade`, `notes2` (ground-floor use), `notes3` (basement access) | ✅ measured, below |
| **the sidewalk at the door** | the kit's own drawn ground, sampled at the front face | exists (ground conformance, `ARCHITECTURE §8`) — untested for this use |

**Jackson Heights, first floor above lowest grade, estimated grades excluded:**

| basement access | n | middle half (ft) | median (ft) |
|---|---|---|---|
| walkway/stairs down to the basement | 1,103 | 7.7–8.4 | **8.1** |
| basement door or window, no walkway | 5,584 | 3.4–5.3 | 4.0 |
| no basement seen | 6,031 | 0.4–4.7 | 1.6 |

⭐ **Jacob's rule checks out against the stairs-down group:** ~10 risers up to the parlour floor + 2–4 down
to the garden-level door ≈ 13 risers; at a 7½-inch riser that is 8.1 ft — the median exactly.
⭐ **Retail:** a commercial ground floor sits at grade (678 under 0.5 ft, 467 under 2 ft, only 136 at
4 ft+) ⇒ the door at the sidewalk, no stoop, stairs inside (Jacob).

## 2. ✅ ANSWERED — an address point marks the FACE, not the door (Boz, 2026-10-05)

**Oracle:** OpenStreetMap's mapped entrances (`entrance=*`) in Jackson Heights — 117 nodes, 98 lying on a
city footprint wall whose building has 911 points (42 tagged `shop`, 10 `main`, 41 `yes`). For each, the
distance ALONG that wall to the building's nearest 911 point, against two baselines:

| predictor | median along-wall error | within 2 m (of 98) |
|---|---|---|
| nearest 911 point | 1.8 m | 56 |
| centre of the wall | 2.0 m | 49 |
| a random spot on the wall | 3.3 m | 40 |
| *single-entrance buildings only (n=51):* 911 point vs wall centre | 1.7 m vs **1.2 m** | — |

⇒ **For door POSITION the 911 point is no better than the wall's centre** (worse on single-entrance
buildings). It stays the evidence for **which face** and **how many entrances**; the position along the face
comes from the **typology rule** (§3), from **mapped entrances** (OSM `entrance=*`) where they exist, and
from the operator's override. ⚠️ Small sample, and OSM entrances are biased toward shops; re-measure on the
first poured town. A street-imagery door detector (Mapillary is already an intake source) is a possible
later evidence rung — not in this brief.

## 3. The typology rules (Jacob's, to be authored per town with neutral defaults)

| type (from evidence) | stoop | door |
|---|---|---|
| **stoop over stairs** — raised first floor + walkway down | steps up from the sidewalk to the first floor (~10); areaway stairs down beside/beneath (~2–4) to a garden-level door | at the stoop's top; a second door below |
| **steps up** — raised first floor, no walkway down | steps up to the first floor | at the top |
| **basement at roughly grade** — basement door/window, ~4 ft first floor | short steps up (~6) | at the top |
| **retail / commercial ground** | none — stairs are inside | at the sidewalk, one per storefront (count from address points, else from the town's listings at that address) |
| **attached garage** (`notes2`) | — | a vehicle door at grade |

Rowhouse convention (Jacob's to confirm): the door sits in one end bay, and neighbouring stoops are often
mirrored in pairs. Walk-up apartment buildings: one central entrance.

## 4. Read first

- `CLAUDE.md` Layer 0 · `ORIENTATION.md` · `cartograph/PIPELINE.md` step 7 (bake) and §5.
- `cartograph/ARCHITECTURE.md §8` ("Ground conformance" — everything sits on the drawn ground).
- `The Ward Punchlist` (Jacob's dossier, `~/Desktop/dev.nosync/NYC_Ward/`) — façade family, LPC vocabulary,
  "spend pixels on evidence, not simulation".
- `docs/briefs/BRIEF-nyc-adapter.md` §3.2a (the wells this consumes).

## 5. Code sites

| what | where |
|---|---|
| the first-floor line TODAY: a pedestal by year built | `src/lib/foundationGeometry.js#periodPedestalFor` — ⛔ `year < 1900 → 1.2 m`, `< 1920 → 0.8 m`: a town-#1 constant (Class D). Measured first-floor height replaces it where present; the year prior becomes an authored per-town rule with a neutral default |
| per-building override of that line | `foundation_height` in the overrides (same function) |
| building geometry: walls `[foundationY … wallTop]`, foundation below grade | `cartograph/bake-buildings.js` (the single-building builder; `FOUNDATION_BELOW_GRADE_M`) |
| the storey count the walls were built from | `cartograph/bake-buildings.js` (grep `storey`) |
| the building material (one `MeshStandardMaterial`, `onBeforeCompile`) | `src/components/SlabBuildings.jsx` — ⚠️ there is NO window or door material today (grep finds only the browser `window` object) |

## 6. The work, in landings

1. **The first-floor line from evidence.** Measured `z_floor − z_grade`, split by type (§3), sets the
   pedestal; the year prior becomes authored and neutral. Check: every building names where its first
   floor came from (measured / rule / override).
2. **Façade material: a floor line, window rows, doors.** Window rows above the first floor by storey;
   doors on the front face, positioned by §2's answer or by rule. Material only — no geometry.
3. **Stoops and areaways as geometry**, built from door position + first-floor height + the sidewalk
   height at the door. Check: every stoop's top meets its door's sill; every stoop's foot meets the drawn
   ground (no float, no sink — `ARCHITECTURE §8`).

4. **Stepped roofs — ✅ in scope (Jacob, 2026-10-05: "we should totally do the roofs and the stoops").**
   Source: NYC City Planning's 3D Building Model, one Rhino `.3dm` per community district (Queens CD3:
   `~/Desktop/dev.nosync/NYC_Ward/NYC_3DModel_QN03.3dm`, 2014, feet). **Measured by Boz:** 19,378
   buildings; every facade a single flat rectangle and every roof polygon perfectly flat (zero z-range on
   all 25,635) — so it carries NO pitched roofs, windows or detail — but **24% of buildings have 2+ roof
   levels** (14,393 one · 3,115 two · 953 three · 379 four or more): setbacks, bulkheads, lower rear
   extensions. ⇒ the building becomes a stack of flat-roofed volumes instead of one prism.
   - Read with `rhino3dm` (Python; not GDAL). Buildings are NOT joined objects — match each roof polygon to
     its footprint by containment, then to the building by BIN (`BRIEF-nyc-adapter`). ⛔ An unmatched roof
     piece is counted and printed, never dropped silently.
   - A declared FILE well per community district (like `CURB_CUT`), not a per-envelope fetch. ⚠️ 2014
     vintage: where the current footprint and the 2014 roof disagree, the current footprint wins and the
     disagreement is counted.
   - Check: every roof level lies inside its building's footprint; the highest level matches the
     footprint dataset's `height_roof` within a tolerance stated with its reason.

## 7. Chain

- **Trusts:** BIN identity and the joins (`BRIEF-nyc-adapter`), the drawn ground, the foundation geometry.
- **Trusted by:** the bake (buildings), Preview's cost numbers (stoops add triangles — measure on phone-lo).

## 8. Can the instrument see it? · Validation surface

Buildings are a BAKE artifact: visible only after a buildings bake, in Stage / Preview, never in the
Designer. Name the surface and the scene on every eye-gate. ⛔ No parallel renderer.

## 9. Bounds

Writes `foundationGeometry.js`, `bake-buildings.js`, `SlabBuildings.jsx`, checks. Registers: `FEATURES`,
`OPERATIONS` (the per-town rule knobs). ⛔ Another work group may be baking — confirm with Boz before any
save under `src/` or `cartograph/`. Commit through explicit paths (`BOZ §3.7`).

## 10. Done when

On Jackson Heights: every building's first floor, front, door count and stoop type come from evidence or a
named rule; stoops meet doors and ground; window rows and doors read as material; Jacob's eye in Stage and
at Street, scene recorded. On Lafayette Square: nothing regresses where no evidence exists (the rule
reproduces today's pedestal until a town authors otherwise).
