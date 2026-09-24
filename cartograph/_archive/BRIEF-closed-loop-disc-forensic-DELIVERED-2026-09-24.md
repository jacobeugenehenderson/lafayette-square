# BRIEF — The yellow disc at every closed loop (forensic, no fix)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-23
evict-when: the producer of the disc is named to a code site and a fix brief (or a ruling) replaces this (git rm this file)
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-23, and **Jacob dispatches.** ⛔ **This is a FORENSIC. It measures and names the cause. It does not fix.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** The windows that surfaced this have spent the day on highways and A19. Your task is a question about the polygon and the bake, and it needs clean eyes.

- ⛔ **No edits to `src/`, `cartograph/*.js`, canon, or scene data.** ⛔ **No pours. No new dev servers.** Reuse the one that's running.
- **Allowed:** read anything, and run existing checks.
- **Allowed:** write read-only probes in `scratch/`.
- **Allowed:** drive the running app to look at the defect.

## The symptom (Jacob's eye, 2026-09-23)

**In Stage**, Huron shows a **flat, yellow/tan disc with a bright rim** at the centre of **many cul-de-sacs** and over the **central island of the US 6 roundabout**. On the roundabout, curb and sidewalk scraps show **beneath** it: *"there seems to be other ribbons geometry beneath."* Jacob calls the roundabout *"a wreck"*: the disc, poor polygonization on the splitter-island legs, and poor sidewalks and customs.

**Jacob's hypothesis. Test it first:** *"The protopoly makes an inner and outer stroke for every chain. This looks like an artifact where neither the inner nor outer chains close properly."*

## What is already measured (re-verify; don't trust it)

- **It predates A19.** Jacob's Stage screenshot from 09:49 on 2026-09-23, before any A19 pour, already shows the discs at cul-de-sac tips.
- **Stage only.** In the Designer the same spots show a grey ring, and in Survey a blue handle. ⇒ Consider **the baked ground** (`public/baked/<look>/ground.json`, which Stage reads) as well as the live shape.
- **Not lamp pools.** `public/baked/huron/lamps.json` has count 0.
- **Not a land-use tile at a degree-1 tip.** 106 of Huron's 155 degree-1 tips fall inside **no** `shape.json` tile.
- ⭐ **Closed loops are the leading class.** Count them, don't quote them:
  ```
  node -e "for(const t of ['huron','lafayette-square','hipointe-demun']){const s=require('./cartograph/data/'+t+'/clean/skeleton.json').streets;const P=p=>Array.isArray(p)?p:[p.x,p.z];const c=s.filter(x=>{const a=P(x.points[0]),b=P(x.points.at(-1));return x.points.length>2&&Math.hypot(a[0]-b[0],a[1]-b[1])<1});console.log(t,c.length,c.slice(0,6).map(x=>x.id).join(' '))}"
  ```
  - On 2026-09-23 this printed **Huron 31, LS 4, HPDM 14**. Huron's are mostly **courts**, i.e. turning circles mapped as **closed rings** (`farmington-court-1`, `kingfisher-court-1`…).
  - Huron's roundabouts are closed rings too (`primary-101`, `tertiary-92`, `unclassified-93`), promoted by A19.
  - ⚠️ **LS having only 4 closed loops is the likely reason this was never seen on LS.** That is the Layer 0 signature: invisible on town #1.
- **The roundabout island is a walked ① face, per Wren's measurement.** `shape.json` tile 106 has one run (`primary-101`), producer `proto`, lu `underived`, and no round or blunt tips. The dead-end-cap and loop-body-median explanations were both ruled out by measurement.

## Leads in the code (read in source, NOT established as the cause)

1. **`mintProtopolygon`** (`src/lib/tileGround.js`) strokes every chain as right boundary forward and left boundary back. Its own comment, beside the shoreline code, says: **"⛔ The ARC, never the closed ring — see `coastline.mjs`: stroking a closed ring fragments it."**
   - The coast was routed around this. **Street loops were not:** a closed street chain goes through the same stroke.
   - ⇒ This is Jacob's hypothesis in the code's own words. **Measure it on a real loop.** Mint ① for one Huron court and for `primary-101`, and check whether the outer and inner rings each close. Also check `refused`/`crossings` in the mint output.
2. **`[CULDESAC]` in `tileGround.js`** (search `culDeSacLoops`). It detects turning-circle loops (a tight circle, R 3–12 m) and carves their curb from the morphologically closed road, so the stem↔bulb notch doesn't appear.
   - **Read in source:** it is consulted only in the chain-run path (`culDeSacLoops.get(run.streetIdx)`), **not visibly in the ① block** (`opts.grout === 'proto'`).
   - ⇒ Possibly **a port that dropped a piece** (`MEMORY §A`: *"it was finished — restore, don't rebuild"*). **Establish whether the ① producer consults it, before you conclude anything.**
3. **The bake.** If ① and `shape.json` are sound at a loop but Stage draws a disc, the defect is in how the **ground bake** triangulates a face with a small or degenerate hole. Find which of `ground.json`'s groups draws the disc.

## The method (the canon's own rule, `CLAUDE.md` step 4)

⛔ **Ask the POLYGON, not the street graph.** Coordinate → the tile whose ring contains it (by geometry; ⛔ never by tile index, since indices renumber on every pour) → which arc owns it → name the street last. Work through the layers in order and **stop at the first one that is wrong**:
1. **① (the protopolygon):** do the loop's rings close?
2. **② (the curb):** does the loop's curb close around the island, or does the island collapse ("if the curbs touch, there's no block")?
3. **`shape.json`:** what tile, if any, covers the disc's footprint, with what `lu` and `producer`?
4. **`ground.json` (Stage):** which group draws the disc's pixels, and what lies beneath it?

## Deliverable

Deliver it in chat to Jacob:
- **The producer of the disc, named to a code site**, with the probe output that proves it.
- **Jacob's hypothesis:** confirmed or refuted, with the evidence.
- **The class across towns:** how many closed loops, how many draw the disc (Huron / LS / HPDM), and whether LS's four do.
- **Whether `[CULDESAC]` reaches the ① path.**
- If the cause spans more than one layer, name each layer.

Write **"cause not established"** wherever it isn't. ⛔ **No fix, and no fix proposal beyond one line.**

## Coordination: several sessions share this checkout

- **"No Namer" [ebe078]** is on A19 and is re-pouring towns. It rewrites `skeleton.json`, `ribbons.json`, `shape.json` and `ground.json`, so **record the timestamp of every artifact you measure.**
- **"Highway Builder" [07b5ef]:** the highway plan.
- **"Revetment" [a572ba]:** the shore stone.
- **"Researcher" [49f8e3]:** the NAIP spike.

Commit only your own paths, by name (`git commit -- <paths>`). ⛔ No stash, reset, rebase or branch switch. Coordinate via `ListAgents` → `SendMessage`.

## The instruction

Confirm, then measure. **Start with Jacob's hypothesis on one Huron court and on `primary-101`.** If the code contradicts this brief, stop and flag it. **Stop at the named cause.**
