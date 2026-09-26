# BRIEF — Build the highway as the positive object (H-3)

<!-- BRIEF-STATE
status: BUILT (steps 0–6) · OPEN items below · builder Gantry
written: 2026-09-23 · state rewritten 2026-09-25 (docs pass)
plan as dispatched: cartograph/_archive/BRIEF-highway-build-plan-2026-09-23.md (steps, checks table, the comb)
evict-when: its checks are green on huron AND LS, and each open item below is closed or re-homed
-->

**What this is.** `ROADMAP H-3`'s live state. A motorway/trunk is the positive object H: an alignment swept by a
typical section built from its lanes and cited values, not ①'s negative space. **Rulings live in
`references/registry.json` by id** (`r-highway-positive-object`, `r-highway-no-authoring`, `r-highway-verge`,
`r-manuals-disagree-take-smaller`, `r-ramp-terminal-flares`); the operator-facing rule is `OPERATIONS §Highways`.

## Built

| Step | What | Commit | Proven by |
|---|---|---|---|
| 0 | Frame facts: `ref` voted per chain, two-way motorway is not limited-access, the highway weld | `b3f1b505` `98c620fc` | `claims-highway-no-visible-joint` |
| 1 | A side = its lanes + cited shoulders, by the town's state (ramps: CA → Caltrans, MA → MassDOT, else the smaller) | `660c24cb` | `claims-highway-width-from-lanes` |
| 2 | H swept by `sweepHighway`, lane steps tapered 10:1 | `4735926e` `6481d51a` | `claims-highway-sweep-is-finite` |
| 3 | One edge: a block beside a highway ends exactly on H; highway edges bare | `9a569df1` | `claims-block-edge-is-highway-edge` · `claims-a-highway-block-keeps-its-corners` |
| 4 | Region classes at the mint: verge · junction residual · block | `94002fae` | `claims-verge-bare` · `claims-junction-residual` |
| 5 | Joins: at-grade butts, end-to-end handoff tapers, gores, joints | `374594c7` | `claims-ramp-ends-classified` |
| 6 | Disclosure per pour, handedness, the comb | `6aea7451` | `claims-highway-handedness` |
| flare | The ramp-terminal flare: frozen at the mint (`rampTerminalFlares`), drawn on ②'s working copy (`flareWorkingCopy`) | `8769d512` `a7891249` `ad1706d5` `7d1db6db` | `claims-ramp-ends-classified` |
| speed | At-grade expressway: speed per span (posted → statutory → [U]) and the edge it gets | `1c723b72` `573f3b47` | `node cartograph/speedContext.mjs <town>` · `claims-expressway-edge-follows-speed` |

▶ Run them all for a town: `for c in highway-no-visible-joint highway-width-from-lanes highway-sweep-is-finite block-edge-is-highway-edge a-highway-block-keeps-its-corners verge-bare junction-residual ramp-ends-classified highway-handedness expressway-edge-follows-speed; do node checks/claims-$c.mjs <town>; done`

## Open

- **Check 3 stays red on a gore by ruling:** the gore vertex is `[U]` with no tolerance constant.
- **LS has not had its H-3 pour.** Its checks read NOT CHECKED until then. It waits for its own pour, together with the divided-road guard (ROADMAP H-3 "A") and the roundabout brief.
- **Towns poured before `7d1db6db`** print their flares NOT DRAWN ("re-pour").
- **The expressway CONSTRUCTION** (branch `gantry/expwy-iii`: the shoulder from Table 302.1, a bare edge, the median as verge by identity, `d-expressway-median-verge`): NOT LANDED. The live instance is hipointe-demun's Forest Park Parkway (posted 40 mph); its skeleton predates chain tags, so the proof is a re-skeleton + pour of HPDM, which needs Jacob's go.
- **① labels:** the containment rule (`379f3953`) fixed an edge leaving a chain END; `claims-every-proto-edge-lies-on-its-owner` stays red on edges that do NOT start at an end vertex (cause not established) and on every town not re-poured since.
- **Statutory predicates held as [U]:** a U.S. route as a "state route" (ORC 4511.01(JJ)), a business district (NN), a thickly settled district (MGL c.90 §17) — `q-statutory-speed-default`.
