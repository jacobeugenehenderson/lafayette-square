# BRIEF — Class decides, not name: the unnamed roads the skeleton drops (`A19`, unnamed half)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-23
evict-when: node -e "const s=require('./cartograph/data/huron/clean/skeleton.json');process.exit((s.paths||[]).some(p=>/^(primary|secondary|tertiary|residential|unclassified)$/.test(p.highway))?1:0)" && echo LANDED
-->

**Status:** dispatch-ready. Boz drafted 2026-09-23 from a session with Jacob; **Jacob dispatches.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** The windows that talked this through carry a separate highway design that shares its vocabulary but not its fix. Bringing that context in would bias you, and this brief is complete without it.

You are landing **one ruled change**: `ROADMAP A19`, ruled 2026-09-20 (Jacob): ***"class decides, not name."*** Its **unnamed half** is the part in scope. A public road with no OSM name is dropped from the street graph, so nothing draws it. The ruling was never built.

**Nothing is off limits, but don't volunteer a big change this one doesn't need** *(Jacob, 2026-09-23: "let's not volunteer that explosion if it's not germane")*. We are close to a showable product, so the default is the smallest change that closes the class. These stay out **unless they prove necessary**:
- **A19's named half** (named footways becoming streets). It re-partitions HPDM and Altadena heavily and is a separate landing.
- **The divided-carriageway and median machinery** (`analyzePhases`, `weldChains`, `repairDividedPairs`, `phase`, `innerEdgeAssign`).
- **The protopolygon (①) and the curb.**
- **The highway object** (`ROADMAP H-3`), which is a separate design.
- **Welding unnamed fragments.**

⭐ **If one of these turns out to be necessary, and the fix won't close without it, that is not a wall.** Stop, bring Jacob the measured blast radius, and he decides.

## The instance, and why it is a class

**Huron, centre of the map, Jacob's eye 2026-09-23:** *"the highway withers as it enters the grid and then picks up again when the grid re-asserts."*
- East of where the SR 2 / US 6 motorway ends, US 6 continues as **`highway=primary`, `expressway=yes`, one-way, 2 lanes, and unnamed**.
- The skeleton's unnamed bucket promotes only the classes in `VEHICULAR_UNNAMED`. `primary` is not among them, so the road lands in `paths[]`, and `paths[]` only draws footway-type classes.
- The motorway ends in a stub by the ballfields, and the road is simply absent from the drawing.

⭐ **This is a class, in every town.** Count it; don't quote it:
```
node -e "for(const t of ['huron','lafayette-square','hipointe-demun','altadena']){const s=require('./cartograph/data/'+t+'/clean/skeleton.json');const c={};for(const p of s.paths||[])if(/^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|road)(_link)?$/.test(p.highway))c[p.highway]=(c[p.highway]||0)+1;console.log(t,JSON.stringify(c))}"
```
On 2026-09-23 it printed road-class ways stranded in `paths[]` in **all four towns, LS included**.

## Read first: the canon, then the code (both, before you plan)

- `ORIENTATION.md`: the chain, and Layer 0 (`CLAUDE.md`), in particular *no fallbacks* and *the override is the product*.
- **`ROADMAP A19`** in full. It is the ruling, and it says why a name gate is the wrong kind of answer.
- **`cartograph/SKELETON.md §2`** (the `paths[]` row, and the *unnamed vehicular* note under `streets[]`) and **`§3` step 7**.
- **`cartograph/ARCHITECTURE.md §7`** "Grade separation": `gradeSeparated = entirelyOffGrade || LIMITED_ACCESS`.

**The code sites.** Cite by symbol, not by line number.
- `cartograph/skeleton.js` **`VEHICULAR_UNNAMED`**: the set, then the split into `unnamedVehicular` / `unnamedNonVehicular`.
- The **promotion loop** directly below it: `synthName = \`${hw} ${i + 1}\``, `id: slugify(synthName)`, `seed: seedSection(...)`, `...gradeFields(hw, [f.osmId])`. Its comment says *"every one is limited-access, so gradeSeparated is true here"*. That becomes false for the new classes, so correct the comment in the same change.
- `gradeFields` / `LIMITED_ACCESS` in the same file. **Verify** that a promoted `primary` stamps `gradeSeparated: false`, so it enters the block grid and bounds blocks. That is correct: this US 6 stretch is **at-grade**, and a street crosses it on the aerial.
- `paths = unnamedNonVehicular.map((f, i) => ({ id: \`path-${i}\` …`: path ids are positional too (see the trap below).
- **Checks that already exist:** `checks/claims-intake-is-consumed.mjs` (prints what each town fetched and what nothing claims) and `checks/claims-named-way-becomes-street.mjs` (A19's named half, for context only).

**Confirm, then build.** Read both and tell Jacob what you found. ⛔ **If the code contradicts this brief, stop and flag. The stop is the deliverable.**

## ⛔⛔ THE TRAP: synthetic ids are POSITIONAL, and they are authoring keys

`synthName` numbers by position in `unnamedVehicular`. **Adding classes to that list renumbers every existing `motorway N` / `primary_link N` id in every town.** Those ids are **skelIds**, the keys authoring is stored under:
- **Measured 2026-09-23:** `cartograph/data/hipointe-demun/clean/overlay.json` carries authored widths on **`primary-link-192`** and **`primary-link-197`**.
- A renumber would **silently re-attach the operator's authoring to different roads.** That is Layer 0 question 3 and question 2 together: the worst outcome, and it looks like a working map.

**The requirement, whatever mechanism you pick:** after the change, every skelId the operator has authored against (scan **every** scene's `clean/overlay.json` and `public/looks/<scene>/design.json`) must resolve to **the same OSM way(s)** as before. Anything that can't must be **printed loudly and by name**, never re-pointed quietly.
- Two approaches, both yours to weigh: (a) keep the existing classes' numbering stable and append the new ones; or (b) derive ids from something stable, such as the OSM id, plus an explicit, printed migration of existing keys.
- ⭐ **The deliverable here is a check**: before/after, authored key → osmIds, run over every scene. Mutation-test it: rename one key by hand, and the check must go red.
- `path-${i}` ids shift as well. 2026-09-23 found no authoring keyed on them. Re-verify rather than trust that.

## The shape of the change

1. **The class rule, derived rather than enumerated.** A class-keyed test replaces the name gate: which OSM `highway` values are *public roads that bound blocks*, as opposed to paths.
   - Build the vocabulary from the classes actually present across all scenes' raw intake, not from LS.
   - Decide `living_street` and `road` explicitly.
   - ⛔ Leave `service`, `proposed` and `construction` out. `service` has its own alley handling in `derive.js`. `proposed` is a known side-track under A19.
   - ⭐ Whatever falls in neither list is **printed per pour**, never dropped silently.
2. **Promotion goes through the existing loop**, one chain per way. Keep `seedSection`, and keep `gradeFields` computing grade.
3. **A loud census per pour:** unnamed ways promoted, by class; any road-class way still in `paths[]` is a ⛔ failure line, not a warning buried in output.

## Consequences you will see: report them, don't chase them

- **The expressway will be drawn as an ordinary divided primary**, with a curb, and **sidewalks and treelawn** from `seedSection`'s `primary` row. It is two one-way carriageways with no divided-road detection (unnamed ways get no `phase`), so the land between them becomes a block.
  - That is the existing machinery doing what it does. Changing it is a separate, larger move, so don't volunteer it here.
  - Whether an `expressway=yes` road carries a pedestrian realm, and whether land between two carriageways is verge or block, are **open questions in `ROADMAP H-3`, owned by Jacob.** Note what you see, with a screenshot location, in your report.
- Unnamed residential fragments stay unwelded, so expect short chains. Report it; don't chase it.
- **LS's highways (motorways and ramps) are a known source of visual bugs** that are faked for now and owed a real fix later (`ROADMAP H-3`). When you eye-check LS for this change, **note any highway defect you see, with its location, and move on.** Huron showing correctly is today's priority.

## Validation: through the production path, on the operator's eye

- **Instrument first** (`BOZ §3` item 6). The census reads `clean/skeleton.json` **on disk**, so it only moves after a re-skeleton. **Survey renders live; Measure / Section render the frozen `shape.json`.** A fix to the skeleton reaches neither until the scene is re-poured.
- **Pour through the production pour.** It's `cartograph/pipeline.js`; take the exact invocation from `cartograph/OPERATIONS.md`, and confirm it with Jacob before the first run.
  - ⛔ **LS is the shared-default fallback, and a non-LS pour has overwritten production LS before** (`ORIENTATION`, *"LS is the mould"*). Run with an explicit `--scene=<id>`, then `git status` and check exactly what changed.
  - ⛔ **No new dev servers**: reuse the running one.
- **Gates:**
  1. The census above shows **zero** road-class ways in `paths[]`, on all four scenes.
  2. The authored-key check is green, and it has been seen to fail under mutation.
  3. `checks/claims-intake-is-consumed.mjs` shows the classes moving from UNCLAIMED/PATH to STREET.
  4. **Jacob's eye**: Huron's US 6 is drawn through the centre, **and LS and HPDM re-partition acceptably**. A19 names LS and HPDM as the acceptance towns. ⭐ Record **which scene** each eye verdict was taken on.

## Write / commit bounds

- **Code:** `cartograph/skeleton.js` (the class rule, the promotion comment, the id scheme), plus the new check in `checks/`.
- **Docs, same commit, net-down:** `SKELETON §2`'s `paths[]` row and unnamed-vehicular note, and `§3` step 7, must state the class rule. `ROADMAP A19`: mark the unnamed half landed, and excise what it replaces rather than bannering it.
- ⛔ No other canon.
- Commit message: name the register it reaches. This change makes roads *appear* in poured towns, so judge whether `cartograph/FEATURES.md` gains a line, or say *"reaches no register"* outright.
- **Surface scope drift; don't absorb it.**
