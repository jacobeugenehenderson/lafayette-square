> ⛔ **RETIRED 2026-09-06 — THE JOB IS DONE.** `booleanLabelled` executes into a PolyTree, the
> exterior leaves with its holes, and a block is an outer ring plus `blockHoles`. Acceptance 1 reads
> **0 nested on both LS and HPDM**. ⭐ Kept for the DIARY only: its "state on arrival" and its
> reproduce command describe a map that no longer exists. Live home: `RIBBONS §1`
> ("A BLOCK IS A COMPOUND FACE"). ▶ `node checks/claims-proto-blocks-are-faces.mjs <scene>`
> ⚠️ Its three "still open" items OUTLIVED it and are live in `RIBBONS §1` / `SECTION §4`:
> ③ has no median or loop concept · turning circles facet to pentagons · `[F]` `clipStreet` still
> chops centrelines for the face walk.

# BRIEF — ①'s blocks must be COMPOUND FACES, not a flat ring list

**One job. ⛔ Do not fix the rim, the medians, the pentagons, or Survey's fill — every one of those
is downstream of this and chasing them is how the 2026-09-06 session was lost.**

---

## The ruled design — context, not a question. ⛔ Do not reopen it.
- **`blocks = boundary − stroked roads`** (`RIBBONS.md §1`, the substrate ruling).
- **THE RIM BOUNDS, IT DOES NOT OWN.** *"I was wrong; the radius is not an ordinary chain."* The rim
  ✅ **bounds** (the stencil of the punch) and ⛔ **is NOT a side-chain**.
- **Build the whole grid flat; stamp the circle LAST** (Jacob, 2026-09-06). *"Obviously the circle
  stencil is happening too early"* — a disc, or a disc plus a margin, is **still the circle deciding
  block geometry**. The subtraction subject is a plain rectangle around all the ink; the circle is
  applied ONLY to finished geometry, at every consumer.
- **A stamp is a per-object cut, not a set operation over the whole map.**

## ⭐ THE DEFECT — measured, and it is one thing

`mintProtopolygon` returns `blocks` as a **FLAT ARRAY OF RINGS**. `booleanLabelled` hands back one
flat list and **winding is the only record of outer-vs-hole**. The consumer (`tileGround.js`, the ②
loop and the ③ band loop) walks that array and treats **every ring as an independent block**.

So a face that HAS holes is destroyed: its outer ring becomes one "block" and each hole becomes
another. ② then offsets the outer ring **as if it were solid**.

**Measured on LS:**
- largest `blocks` entry: **4.49 km², 695 vertices**
- **276 of the other 281 block rings lie INSIDE it**
- its ② curb, after the disc stamp, is **1.77 km² — ~70% of the disc**, with **153 of 160 vertices
  on the boundary arc**

⇒ It is not a block. It is the **outer ring of a compound face whose holes are the entire town.**
Survey FILLS `tg.curb` (`ringsToFlatGeo(..., true)`), so that one ring turns the authoring surface
solid — which is why `protoProducer` is currently OFF in the app.

⭐ **This is why every attempt to classify rings failed.** The defect is not *which* rings; it is that
the **compound structure was thrown away**. Three ring-classification attempts were built and all
three failed, two of them silently:
- exact-coordinate match against the frame corners → Clipper returns rounded integers, matched nothing
- bbox spans >99% of the frame → the exterior's bbox hugs the INK, measured 97.3%, slipped through
- "mostly grade-separated" → the face is bounded by a MIX

⛔ **A THRESHOLD IS A GUESS WEARING A NUMBER.** Prefer a containment or identity test every time.

▶ Reproduce before you build anything:
```
node -e 'const P=require("./src/data/ribbons.json").protopolygon;
const sa=g=>{let a=0;for(let i=0,j=g.length-1;i<g.length;j=i++)a+=(g[j][0]+g[i][0])*(g[j][1]-g[i][1]);return a/2};
const inR=(p,g)=>{let o=false;for(let i=0,j=g.length-1;i<g.length;j=i++){const a=g[i],b=g[j];
 if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])o=!o}return o};
const B=P.blocks,S=B.map((g,i)=>({i,a:Math.abs(sa(g)),g})).sort((x,y)=>y.a-x.a),big=S[0];
console.log((big.a/1e6).toFixed(2),"km²,",big.g.length,"verts; contains",
 S.filter(t=>t.i!==big.i&&inR(t.g[0],big.g)).length,"of",B.length-1,"other block rings")'
```

## ⛔ ROUTE FIRST — read to the section AND open the code, before forming a plan
`ORIENTATION.md` → `README §⭐ START HERE` → **`cartograph/RIBBONS.md §1`** (the substrate ruling ·
"THE RIM BOUNDS, IT DOES NOT OWN" · "① IS STENCILLED BY THE CIRCLE" · "HOW ① IS LOOKED AT") →
`cartograph/SKELETON.md §0.1` (the skeleton is the SSoT; ① is minted from it).

**Code, in this order:**
- `src/lib/tileGround.js` `mintProtopolygon` — the union, the `ctDifference` that builds `blocks`,
  the exterior drop, `boundaryRing`
- `src/lib/tileGround.js` `booleanLabelled` — `carryEdges`, the crossing ledger, what it returns
- the three consumers that enumerate blocks — **they share ONE index space via `easedByBlock`**
  (`protoUseBlocks` / `protoBlockRings` / `protoBlockLabels`). Splitting them cost 61 tiles once.
- `[PROTO⊙]` — the late circle stamp, per tile
- the `protoProducer` (Survey's `curb`) vs `protoArtifact` (the frozen shape) split at the return
- `cartograph/derive.js` — the ① freeze: what is persisted into `ribbons.json.protopolygon`

## ⭐ PREMISES ARE CLAIMS. Confirm each at the line and SAY WHAT YOU FOUND.
If the code contradicts this brief, **STOP AND FLAG IT — that is the work.**
- **P1** `mintProtopolygon` returns `blocks` / `blockLabels` as flat parallel arrays of rings.
- **P2** `booleanLabelled` returns `{rings, labels}` with no outer/hole grouping; winding is the only
  signal, and **this repo carries BOTH shoelace conventions** — `tileGround`'s `signedArea` and a
  naive external one disagree in sign. ⛔ Never guess which class is a hole; test containment.
- **P3** The ② loop and the ③ band loop each treat one ring as one block.
- **P4** `_shapeArtifact` from `protoArtifact` is what **Section** opens — the client autosaves it to
  `POST /<scene>/shape` on Survey-exit (`cartograph/serve.js:1113`) and it lands exactly where
  Section fetches it. **A CLI `bake-ground` run is overwritten by that autosave.**
- **P5** `blocks` is frozen into `ribbons.json.protopolygon.blocks`; the bake reads ① from the
  artifact and never re-mints, so anything new must be frozen too.

## THE JOB
**Carry faces as COMPOUND PATHS from the mint to the offset.** A face = one outer ring + its holes,
with the per-vertex identity labels kept alongside. ② offsets the compound path; ③ strikes its bands
from that. A face with holes must never be handed to the offset as N independent rings.

**Acceptance — all of it, measured, no eye needed:**
1. No `blocks` entry contains another entry's interior point (run the command above; expect 0).
2. The largest live ② ring is comparable to the largest real city block, not to the disc.
3. In-disc block coverage stays at today's level or better (117/118 covered, 0 outside the disc).
4. `protoProducer: true` in `BlockGeometryV2Debug.jsx:806` does **not** flood Survey.
5. The frozen artifact still stamps per tile and no vertex escapes the circle.

## Rules
- ⛔ **NO FALLBACKS.** A scene that cannot produce a compound face is reported **LOUDLY by name** and
  refused — never silently offset ring-by-ring. Both existing flags already refuse; keep that.
- ⛔ **Measure before writing, and never write the EXPLANATION of a number.** If the mechanism is not
  measured, write **"cause not established"** and stop.
- ⛔ **Check WHICH ARTIFACT is on screen before reading a render as evidence.** Survey draws the
  legacy curb unless `protoProducer` is set; Section opens the browser's autosave, not the CLI bake.
  Round curb corners mean the proto path is NOT running (② is `jtMiter`, sharp by ruling).
- ⛔ **A difference between blocks is the product**, never by itself evidence of a bug. Measure with
  the scene's authored state loaded — `scratch/_proto-feed.mjs`, never a hand-rolled call.
- ⛔ **`checks/claims-proto-paints-into-medians.mjs` is VOID.** It pooled even-odd parity across
  every band on the map. Do not run it, do not quote it.

## Scenes
`lafayette-square` is the only scene with a frozen ①. `hipointe-demun` and `altadena` have not been
poured since ① landed, and `bake-ground` now **throws** for them (naming the re-pour command) rather
than falling back. ⛔ `ksi-y-m-yn` and `centrum` are DEAD — output about them is noise.

## State on arrival — verify, do not trust
- `BlockGeometryV2Debug.jsx:806` passes `grout: 'proto', protoArtifact: true`. **Section is on ① and
  Jacob has called that render wrong** (ped bands missing, land use flooding to the asphalt). That is
  a SEPARATE, unexplained defect — ⛔ cause not established, and it may or may not be this one.
  Reverting is `grout: GROUT_ON`.
- `protoProducer` is OFF. Turning it on floods Survey until this brief's job is done.

## Still open, NOT yours unless the fix reaches them
- ③ carries **no median or loop concept**; `[A07]` shows the legacy carve exists largely for those
  (31 median-divided, 2 median-loop). `LOOP-STREETS §2/§4`.
- **Turning circles facet to pentagons** — a loop spanning multiple chains; `isClosedLoop` is
  per-chain and matches nothing. Curvature-aware epsilon vs cross-chain detection is **Jacob's call**.
- `derive.js`'s `[F]` `clipStreet` still chops centerlines for the face walk (48 minted endpoints).
- 5 interior blocks uncovered; cause not established.
