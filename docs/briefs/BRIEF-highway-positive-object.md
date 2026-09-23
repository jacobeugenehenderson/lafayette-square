# BRIEF — Highways as the positive object: harden the plan before code

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-23
evict-when: the plan is ruled by Jacob and a build brief replaces this one (git rm this file, repoint ROADMAP H-3)
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-23 from a design session with Jacob, and **Jacob dispatches.** It is a **design-review brief**: Jacob wants a graphics specialist to *"hammer the plan before we move to coding."*
⛔ **Your deliverable is a hardened plan, not code.** Write it in chat to Jacob and **stop before any `src/` edit.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** You are here as the outside eye. A window that sat in the design session would inherit its framing, and that framing is exactly what you are here to test.

- **Allowed:** read anything, and run existing checks.
- **Allowed:** write read-only scratch probes in `scratch/` that verify a premise against the artifacts.
- ⛔ **No edits to `src/`, `cartograph/*.js`, or canon.**
- ⛔ **No pours.**

**Nothing is off limits, but don't volunteer a big change that isn't needed** *(Jacob, 2026-09-23)*. We are close to a showable product.
- The protopolygon (①), the skeleton, and the divided-carriageway and median machinery are **not to be reopened unless the plan truly can't close without it.**
- If it can't, say so, **with the measured blast radius**, and Jacob decides.

## What Jacob ruled (2026-09-23). These are fixed: test the plan against them, not them.

1. **Scope:** the `gradeSeparated` class first, then see what is left. The flag is `gradeFields` in `cartograph/skeleton.js`: motorway/trunk plus their links, plus anything wholly on a bridge or in a tunnel.
2. **The roadway IS the positive object.** Build it the way road designers do: an **alignment** (the centreline) swept by a **typical section** (lanes plus shoulders), with lanes taken from the data.
   - ⛔ **Not** ①'s negative-space swap, where the town's shape is carved out of the street network. *"We're going to do it like they do it."*
3. **No authoring and no geometry access.** Highways are the one class the operator does not override, because a highway is built to code, whereas a historic street is idiosyncratic.
   - ⇒ **A missing or wrong input must fail LOUDLY**, because nothing downstream will ever look at it again (`CLAUDE.md` Layer 0, q2).
4. **The highway has no curb and no sidewalk.** That is how the design code builds it.
5. **Huron's SR 2 is "2 lanes, grass, 2 lanes":** two roadways side by side, not a median object.
6. **⭐ VERGE:**
   - **Land bounded entirely by highway** (between two carriageways, or an interchange infield) is **verge**: grass, with no curb, no sidewalk, and no land-use choice.
   - **Land bounded partly by highway and partly by town streets** is a **block**, and its highway-facing edge is **bare**: no curb, no sidewalk.
   - This supersedes the 2026-09-06 fix *for all-highway regions only*. That fix (`PIPELINE.md §5`, "grade-separated regions inside the disc draw no panel") existed to end **holes**, and a verge ends them too, because it is drawn as grass.
7. **Huron shows first.** LS's highways are a known source of visual bugs, faked for now and owed this fix. Note them; do not chase them.

## Read first: the canon, then the code (both, before you plan)

**Canon:**
- `ORIENTATION.md` (the chain; "polygon" means two things).
- `ROADMAP H-3` (this work's row) and `A19` (the related at-grade case).
- `cartograph/ARCHITECTURE.md §7` "Grade separation".
- `PIPELINE.md §5`: the 2026-09-06 closed item.
- `SKELETON.md §2` (`streets[]` fields, the unnamed-vehicular note) and `§3` steps 2–7.
- `SKELETON.md §5d/§5e/§5h` (the divided-road "special sauce").
- `RIBBONS.md §1` (the four invariants) and `§3.1/§3.3/§3.5`.
- `ARCHITECTURE.md`'s "compound shape" (the neighbourhood is one closed shape).

**Code, cited by symbol:**
- `src/lib/tileGround.js`:
  - `mintProtopolygon`: highways enter ① as ink at ε via `gradeSep`, and the stamp carries `gradeSeparated`.
  - The `gradeSep` filter at the face-walk input.
  - `protoMeasureOf` and `mkDepth`: the curb depth, resolved **per side** off the owner stamp.
  - The `isGs` vote (`gsN > allN / 2`) and its comment block: the existing per-region highway tag.
  - The `for (const s of gradeSep)` loop after `sectionPass`: the visible roadway.
- `src/cartograph/streetProfiles.js`: `TYPE_PAVEMENT_HW` (the motorway/link constants) and `measureFromSeed` (its `isHighway` branch).
- `cartograph/skeleton.js`: `seedSection` / `STD_SECTION` (no highway rows); the unnamed-vehicular promotion loop (synthetic names, *"no welding"*); `weldLongitudinal`; `gradeFields`.

## What is built today (read in source; confirm it, don't trust it)

- **The same edge is drawn twice, from two geometries.**
  - ① carries the highway as ink at ε. The adjacent block's curb is struck at the highway's `measure`, **per side**.
  - The visible roadway is a separate stroke, `strokeOpen(sm, max(left, right))`, into its own `highway` output. It is **symmetric** (it takes the max of the two sides) and runs on a **1.5 m `smoothChain` resample**, not on ①'s points.
- **Width is a constant per class, whatever the lane count** (`TYPE_PAVEMENT_HW`): every Huron motorway gets 8.53 m half-width, and every link gets 2.44 m. That is `CLAUDE.md` Class D: a constant that happened to suit town #1.
  - The seed says `seededClass: residential`, because `STD_SECTION` has no highway row.
  - The measure *can* carry different left and right widths. The curb reads it per side; only the stroke collapses it.
- **The inputs.** Unnamed highways skip welding and divided-road detection (`SKELETON §3` step 7). Count them; don't quote them. ⛔ **The `2-pt` column counts CONTROL points, not stubs** *(corrected 2026-09-23 by this review's own agent)*: a two-point chain may be a whole bezier curve (LS 11 of 29, HPDM 32 of 69), and Huron's 24 are straight chains 7–831 m long — so "arrives fragmented" is NOT established:
  ```
  node -e "for(const t of ['huron','lafayette-square','hipointe-demun','altadena']){const g=require('./cartograph/data/'+t+'/clean/skeleton.json').streets.filter(s=>s.gradeSeparated),h=g.filter(s=>/^(motorway|trunk)/.test(s.highway));console.log(t,'GS',g.length,'hwy',h.length,'unnamed',h.filter(s=>/^(motorway|trunk)/.test(s.name||'')).length,'2-pt',h.filter(s=>s.points.length==2).length,'phase',h.filter(s=>s.phase).length,'lanes',h.filter(s=>(s.lanes??s.tags?.lanes)!=null).length,'other',g.length-h.length)}"
  ```
  - ⚠️ **Read `lanes` from BOTH `s.lanes` and `s.tags.lanes`.** Reading only one undercounts, and did once.
  - `ref` is on the chains (`US 6`, `SR 2`, and the concurrency `US 6;SR 2`), so ⛔ `ref` is a label, never a weld key.
  - Lane coverage is high on Huron, LS and HPDM and **low on Altadena**. That is the "fails loudly" case, live.

## The blast radius of the VERGE ruling (instrument is partial; re-derive it)

Count frozen tiles whose street-owned `runs` are **all** grade-separated (→ verge) or **some** (→ block with a bare highway edge). The rim (`__…` skelIds) is ignored:
```
node -e "const A=r=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a/2)};for(const t of ['huron','lafayette-square','hipointe-demun','altadena']){const sh=require('./public/baked/'+t+'/shape.json'),gs=new Set(require('./cartograph/data/'+t+'/clean/skeleton.json').streets.filter(s=>s.gradeSeparated).map(s=>s.id));let v=0,va=0,m=0,ma=0;for(const tl of sh.tiles){const r=(tl.runs||[]).filter(x=>x.skelId&&!/^__/.test(x.skelId));if(!r.length)continue;const g=r.filter(x=>gs.has(x.skelId)).length,ring=Array.isArray(tl.ring?.[0]?.[0])?tl.ring[0]:tl.ring,a=ring?A(ring):0;if(g===r.length){v++;va+=a}else if(g){m++;ma+=a}}console.log(t,'verge',v,Math.round(va)+'m2','mixed',m,Math.round(ma)+'m2','producers',[...new Set(sh.tiles.map(x=>x.producer))].join('/'))}"
```
⛔ **The instrument is blind on two of the four towns. Say this before quoting any number.**
- On 2026-09-23, HPDM and Altadena read **0/0**.
- Their `shape.json` files **predate the ① pour**: HPDM's is dated Sep 6 with producers `offset`/`carve`, and Altadena's producer is `null`. Neither contains any highway-owned run.
- ⚠️ **Huron read ONE verge tile.** That looks low for SR 2's kilometres of grass between carriageways. **The cause is not established.** Find out why before sizing anything on it.

## Lessons from the grid's divided roads (carry, rethink, drop)

**Carried:**
1. **Weld the road, then name it** (Jacob, 2026-06-13: *"a name is a label; the road is the line on the ground"*). `weldLongitudinal` does exactly this for one-way carriageways, and unnamed highways skip it.
2. **One geometry for every consumer** (the SSoT ruling of 2026-09-06). The unpromoted `strokePoints` (`SKELETON §5h`) is this failure already, once.
3. **Side.** Left and right labels have flipped three times on record. For a one-way carriageway, point order is the direction of travel, so the **outside shoulder is the driver's right** and no pair lookup is needed. ⛔ Make it a check.

**Rethought:**

4. **The median is the leftover.** That holds, and it is now **verge** (ruling 6).
5. **The E2/E3 nose apparatus.** It exists to decide who owns a converging sliver. A union of positive strokes never asks that question, except for one gap-close for near-touching strokes, sized from the section rather than from a constant.
6. **The 1.5 m highway smoothing** was licensed by *"there's no curb to fold."* That licence is gone once the highway's edge bounds a block. The skeleton already curve-fits (bezier `segments`, flattened into `ribbons.json`).

**Dropped:**

7. **The pairing machinery** (`phase`/`innerSign`/`pairId`/`spineAt*`). It answers negative-space questions that the positive model never poses.

## The questions to hammer. Answer each with a recommendation, the one trade-off, and how you know.

1. **The typical section from the data.** Lane width, outside and inside shoulders, and ramp sections: cite the standard you use.
   - What does a carriageway with **no lane count** do? It must fail loudly (ruling 3). Propose *how*: refuse to draw it? Draw it with the assumption shown in the pour output **and** in the operator's view? "Silent default" is not an option.
2. **Where OSM's line sits in the section.** Is the carriageway way at the centre of the travel lanes? **Verify it against the aerial at a few Huron and LS spots.** Don't assume it; `RIBBONS §3.1` records a month lost to a wrong answer to exactly this question for divided streets.
3. **Welding, in the highway step.** Is it a weld (and on what: continuity plus heading, degree 2), or a union with round joins? Measure the joint defect between chains either way (flatten `segments` first — never measure on control points).
4. **ONE edge (the crux).** The highway polygon's edge must *be* the edge the neighbouring block closes against, from one geometry. Two routes; pick one and say what it costs:
   - (a) The per-side `measure` of a highway chain carries the section's half-widths, so ①'s curb lands on the highway edge. The stroke must then use the same per-side values and the same points: no `max`, and no separate smoothing.
   - (b) The highway polygon is handed to ② as the boundary for highway-owned runs.
   - ⛔ Either way, **"the block's edge equals the highway's edge" becomes a distance check.**
5. **VERGE, built** (ruling 6). Where is it decided? The `isGs` vote already exists, but it is a *majority* vote and the ruling says *entirely*. How does an all-highway region become grass with no curb and no sidewalk, and a mixed region get a bare highway edge? Stay within the stated bounds.
6. **Joins:**
   - **At-grade:** a ramp end shares a vertex with a town street. What does the positive highway polygon do where it meets block-grid asphalt?
   - **End-to-end:** ⭐ after `A19` lands, **Huron's US 6 motorway runs straight into an at-grade `primary` expressway**. A highway object meets a block-grid street at its end (around (-560, -179) / (-524, -195) in Huron's frame). That is its own join class.
   - **Grade-separated:** no shared vertex, so it's draw order only. Confirm the highway layer renders beneath local streets.
7. **The rest of the grade-separated class:** pedestrian and local bridges. Huron's pedestrian terrace currently gets a 5.49 m half-width. Name what they get in v1.

## The checks: what makes this a kit fix, not a Huron patch

Each is a command that reads the source rather than restating it, and each must be **seen to fail**: mutation-test it.
1. **One object per carriageway run** — no visible joint between consecutive chains of one carriageway.
2. **Width derives from lane count and section.** No class constant survives, and a missing input is loud.
3. **The block's edge equals the highway's edge**, as a distance check with a tolerance.
4. **Side handedness:** the outside shoulder is on the driver's right.
5. **Every ramp end is a join or a flagged exception.**
6. **Verge regions carry zero curb and zero pedestrian area.**

## Surfaces and validation (`BOZ §3` item 6: can the instrument see the change?)

- **Survey renders LIVE** (the `tileGround` live path). **Measure / Section render the FROZEN `shape.json`.** The 3D side reads `baked/<look>/ground.json`.
- Name which surface each gate reads, and ⛔ do not eye-gate on a proxy.
- **HPDM's and Altadena's `shape.json` are stale** (see above), so any gate on those towns needs a re-pour first.
- **Huron is the eye target; LS comes second.**

## Coordination: sessions share this checkout

- `lafayette-square-nosync-d3` is building `A19`. It is changing `skeleton.js` and re-pouring Huron, LS, HPDM and Altadena.
- "Procedural rock walls" is working in `src/`.
- You write nothing but `scratch/` probes. **Still: tell both before running anything that writes `cartograph/data/` or `public/baked/`**, and never stash, reset or switch branch here.
- ⚠️ **Your inputs are moving under you**: the `A19` re-pours rewrite `skeleton.json` and `shape.json`. Record which artifact you measured, and its timestamp.

## The instruction

Confirm, then plan. Read the canon and the code, then **tell Jacob what you found. Where the code contradicts this brief, stop and flag it. That stop is the deliverable, not a failure.** Then answer the seven questions and propose the six checks.
⛔ **Stop there. No code.** The plan goes back to Jacob and Boz, and a build brief follows it.
