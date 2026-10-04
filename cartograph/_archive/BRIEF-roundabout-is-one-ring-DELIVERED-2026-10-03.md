# BRIEF — A roundabout is one ring: weld its pieces in the skeleton

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-03
evict-when: every junction=roundabout/circular ring in every town's raw OSM arrives in skeleton.json as ONE closed chain (or is refused by name, loudly), a check proves it on every scene and goes red when the weld is removed, and Jacob has eyed HPDM's roundabouts in Survey after its re-pour
-->

**Boz drafted this 2026-10-03; Jacob dispatches.** It is step **C** of tonight's HPDM order (**A → C → B**), and it is now
the gate on **both** baselines: HPDM's bake refuses at `bake-labels` until `skeleton.js` re-runs (its July skeleton
predates the `synthetic` stamp), and re-running the skeleton is the A19 pour that has been **held for this brief**
(`ROADMAP A19`). LS's skeleton also carries no `synthetic` stamp, so LS is likely to hit the same wall. That is inferred,
not measured.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`,
then ask Jacob to `/rename`). **Agent: FRESH.** The windows that surfaced this have spent the night on a bake; the task is
a skeleton question and wants clean eyes.

- ⛔ **No pours, re-skeletons or bakes in the live checkout.** HPDM is mid-baseline. A pour only in a scratch worktree
  under `.claude/worktrees/`, on cloned data, and only while `node scripts/bake-in-flight.mjs` reports quiet.
- **Allowed:** edit `cartograph/skeleton.js` (and only what the weld genuinely needs downstream; surface anything else),
  write the check in `checks/`, read anything, run existing checks.
- ⛔ **Canon is off-limits** except the registers your commit reaches (`§ Three-part fix` below). Commit only your own
  paths, by name (`git commit -- <paths>`). No stash, reset, rebase or branch switch.
- **Surface scope drift, don't absorb it.** The splitter islands, the apron and the curb are named below as out of scope.

## What is measured (re-derive; don't quote)

From raw OSM, per scene. Count `junction=roundabout|circular` ways and group them by shared endpoints:

| scene | roundabout ways | named | distinct roundabouts | split into pieces |
|---|---|---|---|---|
| hipointe-demun | 25 | 0 | 9 (1 is `service` ⇒ a path) | **5 roundabouts in 21 pieces** + 3 closed single ways |
| lafayette-square | 2 | 1 | — | — |
| huron | 4 | 1 | incl. `primary-101` (US 6), a closed single way | — |
| provincetown | 1 | 1 | — | — |

⇒ **ROADMAP's "~24, 21 of them unwelded split pieces" for HPDM reproduces.** Under HPDM's July skeleton, none are drawn:
unnamed `unclassified/secondary/tertiary/residential` were not promoted before A19. After A19 each piece becomes its own
chain.

## The mechanism (read in source; confirm before building)

- **Nothing in `cartograph/` reads `junction=roundabout`.** A grep for `junction`/`roundabout` in `cartograph/*.js` finds
  no consumer of the tag. ⛔ Absence is a claim; re-grep it.
- **Unnamed vehicular ways are promoted one fragment = one chain** — `skeleton.js`, the loop after `STREET_CLASSES`
  ("Promote unnamed vehicular fragments into streets with synthetic names"), numbered `<highway> <n>` by position.
- **The only weld for unnamed chains is `weldHighwayChains`**, and it is gated to `LIMITED_ACCESS` + `gradeSeparated`.
  An at-grade roundabout never qualifies. Named chains go through the name-group `weldChains` (`skeleton.js`
  `function weldChains`); every HPDM roundabout is unnamed, so that path never sees them.
- **What a closed ring gets downstream, once it IS one ring** (verified, not hoped):
  - `skeleton.js`'s terminal-node sweep: *"0 tips = a ring (roundabout) → every node degree ≥ 2 → THROUGH → mints no
    corner"* (search `0 tips = a ring`).
  - The closed-loop curve fit (`CURVE_LOOP_CIRCLE_TOL`, `fitClosedLoopCircle` / `fitClosedLoopBezier`) only runs on a
    closed loop.
  - **The island closes as a ① block owned by the loop alone.** Measured on all 31 of Huron's closed loops by the disc
    forensic (`b757717c`; `cartograph/_archive/BRIEF-closed-loop-disc-forensic-DELIVERED-2026-09-24.md`). That is the
    behaviour a welded HPDM roundabout should inherit, and the split pieces cannot.
- ⭐ **A second, smaller instance of the same class: implied `oneway`.** `seedSection(hw, lanes, oneway)` takes
  `oneway = tags.oneway === 'yes'`, and an untagged one-way seeds **2 lanes** (`seedSection`: `oneway ? 1 : 2`). OSM's
  roundabout tag implies one-way. Measured: **4 of 32** roundabout ways across the four towns carry no `oneway=yes`
  (HPDM 1 · LS 1 · huron 2). Fix it at the same site: the tag decides. That is A19's "class decides, not name" one level
  down.

## The construction (Layer 0 shapes it; confirm against the code first)

**The tag is the identity.** OSM already says which ways form the ring; ⛔ do not infer a roundabout from geometry
(circularity, curvature, closure by proximity). That is the forbidden recovery shape (`A15`). Weld the
`junction=roundabout|circular` pieces that chain end-to-start into one closed chain, the way `weldHighwayChains` welds a
run. Keep its disclosure discipline:

- **Survivor id.** The run's head keeps its id; members go to `sources` / `osmIds` / `weldedFrom`.
  ⛔⛔ **The synthetic id is POSITIONAL AND AN AUTHORING KEY** (`skeleton.js`, the `PRE_A19_UNNAMED` comment). Weld after
  the numbering, as the highway weld does, so no other chain's `<highway> <n>` shifts. ▶ `node
  checks/claims-authored-skelids-keep-their-ways.mjs` must not go newly red. HPDM has 17 authored slots (`A11`).
- **What does not weld is printed by name, never dropped.** A ring that does not close, mixed classes around one ring
  (HPDM's are uniform per roundabout; another town's may not be), or a piece that is also a divided carriageway. ⛔ No
  fallback: an unclosed "roundabout" stays as its pieces **and** is named in the pour's output.
- **Lanes per span**, the way `laneProfile` does for highways, if the pieces disagree. 14 of HPDM's 25 carry `lanes`.

## The chain: what this trusts, what trusts this

- **Trusts:** the raw fetch keeping `tags.junction` (it does: `raw/osm.json` ways carry `tags`), and A19's class rule
  promoting the pieces at all.
- **Trusted by:** prebake's face walk and the ① mint. A closed chain is what makes the island a block.
  ⚠️ `mintProtopolygon` carries *"⛔ The ARC, never the closed ring — stroking a closed ring fragments it"*
  (`tileGround.js`, the coast branch). Huron's 31 closed street loops already go through it and close, per the disc
  forensic. **Confirm a welded HPDM ring does the same.** If it fragments, stop and flag; do not route around it.
- **⭐ Put the constraint in a check, not in prose:** "every roundabout ring OSM declares arrives as one closed chain"
  belongs with the operation, so it travels to town #3.

## Can the instrument see the change?

The check must read **`raw/osm.json` (the declaration) against `clean/skeleton.json` (the result)**, on disk, every
scene. HPDM's on-disk skeleton is the July one and **will show 0 roundabouts until re-skeletoned**. So prove it in your
scratch worktree first: re-run `skeleton.js --scene=hipointe-demun` there, then the check. ⛔ A check run against the live
July skeleton prints "0 drawn", which is a skeleton that predates the work, not proof that nothing works.

## The validation surface that already exists

**Survey**, on the real pour, renders the live ① and the curb. It is where Jacob takes **B** (the HPDM re-pour, eye-gated).
⛔ No parallel SVG/spike renderer for the roundabouts. Your scratch-worktree pour is for measurement only. The eye gate
happens on HPDM in the live checkout, after this lands, when Jacob runs B.

## Out of scope (name it, don't build it)

- **Splitter islands and the ② curb at the ring.** That is `BRIEF-junction-shape-where-the-offset-crosses` (Plumb;
  ② landed `5221da1c`, the teardrop and wedge tips fixed).
- **The apron and the island's dressing.** The registry question `q-roundabout-geometry` is open, and NCHRP 672 (the
  method) is blocked by its terms. Caltrans/MassDOT speak only for their own states.
- **A19's NAMED half** (named footways bounding blocks: HPDM 51, PT 44, Huron 11, LS 1 —
  `node checks/claims-named-way-becomes-street.mjs`). It is ruled (class decides), apparently unbuilt, and separate.
  Report whether you agree it is unbuilt; don't build it here.

## Deliverable

1. **Confirm the premises** against the code and say what you found, before building. ⛔ If the code contradicts this
   brief, **stop and flag Jacob**. The stop is a deliverable.
2. The weld in `skeleton.js`, plus implied `oneway` at the same site.
3. `checks/claims-a-roundabout-is-one-ring.mjs` (or your name): every scene, declaration vs result, unwelded rings
   printed by name. **Mutation-tested:** remove the weld ⇒ red on HPDM (in the scratch skeleton), naming the 5 split
   roundabouts.
4. In chat, from the scratch HPDM re-skeleton + pour: roundabouts declared vs closed chains; whether each island is a
   closed ① block; what else moved (A19's unnamed half lands in the same pour, so separate the two in your report);
   `claims-authored-skelids-keep-their-ways` before and after.

## Three-part fix

The commit **names the register it reached** (`cartograph/FEATURES.md`, `cartograph/OPERATIONS.md`, `SKELETON.md`) **or
says "reaches no register"**. If the weld changes what `SKELETON §2`/`§3` says the skeleton emits, that doc moves in the
same commit, and superseded text goes to `cartograph/_archive/`. Whatever the weld makes redundant is removed in the same
commit, and the message says what.

## The instruction

**Read both — this brief's code sites and `SKELETON.md §2–3` — tell Jacob what you found, then build.** Stop at the
first contradiction.
