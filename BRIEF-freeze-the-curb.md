# BRIEF — freeze the curb

**Status: OPEN, undispatched. Written 2026-08-21.** Closes **`ROADMAP A3`**.
⛔ **Every claim below carries a receipt — a `file:line` or a command. Re-run them. Do not trust the
framing, including this one.**

---

## 0. THE GOAL — Jacob's words, 2026-08-21

> **"The polygons are the curbs."**
> **"If we were properly polygonized we wouldn't be having these conversations. There are numerous
> symptoms but they're irrelevant — it just means the polygons didn't get made correctly."**

⭐ **The curb must be a FROZEN POLYGON that carries its own identity**, so authoring addresses an edge
instead of re-resolving a chain ordinal every time. ⛔ **Symptoms are NOT tickets.** `A17` (the
unreliable sidewalk/tree-lawn swap) is downstream of this and is not to be worked here.

## 1. THE DEFECT — measured 2026-08-21

```
node -e "const t=require('./public/baked/lafayette-square/shape.json').tiles;console.log('curbFacts:',t.filter(x=>x.curbFacts).length,'of',t.length)"
grep -rn "curbFacts" src cartograph --include="*.js" --include="*.jsx"
```
- `tileGround.js:4186` — `const curbFacts = tile.curbFacts || freezeCurbEdgeFacts({ ring, runs, streetsOrig, measures, … })`
- **`tile.curbFacts` is READ at that one site and WRITTEN NOWHERE.** 0 of 101 tiles carry it.
  ⇒ **the `||` fallback is the only path that has ever executed. The curb is re-derived from the
  chains on every pass, in the tool and in the bake.**
- `shape.json` already carries the curb's **RESULT** — `iA` on 93/101, `iaEdge` binding each curb
  vertex to its owning ring edge, `runs` carrying `skelId · side · segOrd`. **The shape is in the
  artifact; the pipeline rebuilds it from the chains anyway.**

## 2. THE DESIGN ALREADY EXISTS — in the code's own comments. ⛔ Do not invent a new one.

`tileGround.js:168-187` states the split, and **A03 built both halves** (`4dd05303`+`aa40a7d5`):

| | | |
|---|---|---|
| `freezeCurbEdgeFacts()` | `:200` | the **chain-derived** half — reduces `runs`/`streets`/`measures` to **ONE fact per RING EDGE**: `{ skelId, side, segOrd, baseHW, prof, streetKey, roadKey }` |
| `buildCurbRings()` | `:246` | the **chain-free** producer — `ring + facts + authoredHW` → the curb |

⭐⭐ **WHY THIS IS SAFE, AND IT IS THE POINT:** `baseHW` is the **pre-authoring** half-width; the
operator's override is applied **at build time** inside `buildCurbRings` (`authoredHW`,
`tileGround.js:4192`). **So the frozen facts are look-agnostic — one scene's facts serve every Look,
and freezing them does NOT freeze authoring.** That is what defuses the old blocker
(`POLYGON-FIRST §3`: *"freezing `iA` at prebake would bake a bare-defaults curb"* — Layer 0 q3).
⭐ **A03's reframe governs the location: the goal is CHAIN-FREEDOM, not prebake-location.**
⛔ **So do NOT build a prebake migration.** Freeze where every other shape fact already freezes.

## 3. THE WORK

**Carry `curbFacts` into the frozen artifact, so `:4186`'s `||` resolves to a frozen value.**
- The artifact is assembled at `tileGround.js:4914` — `opts.emitArtifact ? shapeTiles.map(st => ({ ...st, roundTipKeys: [...st.roundTipKeys] })) : undefined` — and written by `bake-ground.js:1060`.
- ⇒ the facts must ride on the shape tile that `shapeTiles` collects, and be JSON-safe.
- ⛔ **DO NOT widen `buildCurbRings`' signature** (`:182`: *"the signature IS the guard"*). If the
  builder needs something it hasn't got, **freeze a new FACT** — never pass a chain in "just for this case."

## 4. THE TWO THINGS TO ESTABLISH FIRST — ⛔ answer both BEFORE writing cure code

1. **WHAT INVALIDATES A FROZEN FACT?** `baseHW` derives from `measures` — the per-chain base the
   operator edits in Survey. Frozen facts therefore go stale on a base-measure edit. **A re-freeze
   trigger already exists** (`BlockGeometryV2Debug.jsx:849-868`, the Survey-exit re-freeze, `a96f00c2`).
   **Establish whether it covers every path that changes `measures`.** ⛔ If it does not, a stale fact
   is a plausible-looking wrong curb — **the worst outcome available** (Layer 0 q2). Report before building.
2. **ORDERING — DOES THIS FREEZE WRONG DATA?** `WALL §1`: *"freezing WRONG data is worse than not
   freezing at all; it launders garbage into authority,"* and the 2026-08-09 correction puts **A4's
   robustness half UPSTREAM of A3**. **My read — CONFIRM OR REFUTE IT, do not inherit it:** A4's
   fold/thorn defect is in the **offset geometry** produced by `buildCurbRings`, whereas the facts are
   frame-derived **scalars and ids**, so the self-intersection is not in what we would freeze.
   ⛔ **If that is wrong, this ticket is blocked on A4 and you must say so and stop.**

## 5. THE GATE — a harness already exists, use it

```
node scratch/a03-curb-identity.mjs --against baseline      # BOTH states: authored AND bare-defaults
node -e "const t=require('./public/baked/lafayette-square/shape.json').tiles;console.log(t.filter(x=>x.curbFacts).length,'of',t.length)"
```
- ⭐⭐ **THE CURB MUST NOT MOVE — byte-identical on `iA`/block/curb/asphalt/sidewalk/fillets, in the
  authored state AND in bare defaults.** This is a **freeze**, not a redesign. A03 was merged on exactly
  this proof; hold it to the same bar.
- `curbFacts` present on every tile that has `iA` (**93/101 LS**), and `:4186`'s fallback proven cold.
- ⛔ **`promote-ribbons.js` refuses any promote whose counts move.** Expect it; do not bump an
  expectation to make something pass.
- **The eye is the gate** and it is Jacob's, on the real render — never a proxy.

## 6. TRAPS, EACH ALREADY PAID FOR

- ⛔ **The artifact is built ONLY when `opts.emitArtifact` is set** (`:4914`) — the live tool path does
  not build it. **Name which surface you verified on: Survey renders LIVE, Section renders FROZEN.**
  A fix visible in one and not the other is the 2026-07-31 failure.
- ⛔ **Prebake does not read `design.json`/`blockCustoms`** (`ORIENTATION` step 3). Anything frozen that
  depends on per-fe SHAPE intent freezes the to-code default. The facts are look-agnostic **by design** —
  keep them that way; the moment `authoredHW` leaks into `freezeCurbEdgeFacts`, this ticket has failed.
- ⛔ **The forward/reverse `edgeKey` ordering at `:230-238` is LOAD-BEARING** — an unconditional reverse
  write collapsed both legs of a dead-end slit to one width. Preserve it verbatim.
- ⛔ **A difference between blocks is the PRODUCT.** A street changes width across its span because LS is
  historical — that is what the authoring tools are FOR. Ask what the map looks like if the code is RIGHT
  before reporting anything.
- ⛔ **"Polygon" means TWO things here** — the **curb** to Jacob, the **tile face** to the code
  (`ORIENTATION`, "Polygons, not pen-strokes"). Say which, every time.

## 7. THE CHAIN — what this trusts, and what trusts this

- **Upstream, trusted:** `shape.json`'s `tile.ring` + `tile.runs` (the frozen tile topology) and
  `measures` (the per-chain base from `overlay.json`). ⛔ **The frame origin must never move**
  (`EXTENT-DESIGN`) — nothing here re-pours, re-skeletons or re-keys.
- **Downstream, trusting this:** `sectionPass` (the FILL strokes inward from this curb) and the slab
  bake. ⛔ **`blockCustoms` is keyed `skelId · side · segOrd` — authored work orphans silently if any
  key moves.** No re-key, no renumber, in any form.

## 8. NOT THIS TICKET

`A17`'s swap unreliability + the clip's duplicate vertices · slice 2 / the substrate walk (**switched
off** — `tileGround.js:3047`) · `A06`'s 42 carve tiles · `A4`'s curves-ON half · the park polygon.
**All real, all separate. This ticket freezes the curb and moves nothing else.**
