# BRIEF — legs + corners, two agents, one function

**Authorised by Jacob, 2026-09-07.** ⛔ **This file has an expiry: delete it when both branches land.**
It exists only to keep two parallel agents from colliding. It is not canon — the canon is
`cartograph/SECTION.md` and `cartograph/RIBBONS.md`, and where this brief and they disagree, **they win
and this file is the bug.**

---

## 0. Read this first, both of you

`CLAUDE.md` Layer 0, then `ORIENTATION.md`, then `cartograph/SECTION.md` **§3.3, §4, §6.1, §7**.
⛔ **A brief's premises are claims, not facts.** Confirm every number below by running the command next
to it *before* you build anything, and say what you found. **They will have moved** — Jacob is authoring
live; `public/looks/lafayette-square/design.json` was rewritten mid-session tonight and moved the band
count by 1 between two runs of the same command. **Never quote a number from this file.**

### Jacob's rules, tonight, in his words — these govern both jobs
1. **"A treelawn swap NEVER happens mid-leg, period. It's illogical. That's what the corners are for."**
2. **"There are no nodes mid-street in terms of ribbons. The leg is *either* *or* and never both; so a
   seam or joint should be disqualified from possibility."**
3. **"Even if we think something changes mid-leg, that's what the angled slope corner joiner is for."**
4. There are exactly **THREE** corner configs (TL↔TL · SW↔SW · SW↔TL). **A fourth is wrong.** Treelawn
   at a corner is a fourth — the band beyond `cMin` is parcel; treelawn ends at the tangents.
5. **Authoring is not a defect** (Layer 0 q3). A swapped leg, or a leg differing from its neighbour, is
   the product. ⛔ Do not gate on either.

---

## 1. The split — who owns which code, to the line

Both jobs live in `src/lib/tileGround.js`, in **adjacent regions of `sectionPassProtoTile`**. That is the
collision. The boundary is not a suggestion.

| | **LEGS** | **CORNERS** |
|---|---|---|
| owns | the run construction + `iaStamp` (~`:6860–6975`) · the `// ══ THE LEG ══` block in `sectionPassProtoTile` | the `// ══ THE CORNER ══` block (`cornerAt`, `slidWalk`) · `mk`'s four depth functions |
| its gate | `checks/claims-frontage-covers-the-block.mjs` · `checks/claims-ring-partition.mjs` | `checks/claims-sidewalk-is-one-band.mjs` |
| its open class | **two:** frontage runs that do not cover their own block · **the turn test minting rule-2 seams** (§5) | the **unfilleted (R=0) corner** |

**⛔ NEITHER of you edits `const M = (ri, i) => legArr.get(...)`. That line is the interface.**

### The contract across it — agree to this and you cannot conflict
- `M(ringIndex, i)` takes an **EDGE index** (`ring[i] → ring[i+1]`), not a vertex index. Getting this
  wrong is invisible and expensive: a straight leg is often ONE ring edge tens of metres long, so an
  off-by-one hands a whole street side the wrong cross-section. It cost me ~30% of LS's treelawn
  painted as ADA concrete, and **it scored BETTER on the band acceptance than the correct version.**
- It returns **ONE resolution per LEG** or `null`. LEGS may change *how* that one resolution is chosen.
  CORNERS may only *read* it. ⛔ Neither may make it finer than the leg — that is rule 1 and rule 2.
- **LEGS lands first.** A corner between two legs cannot be judged correct while the legs are
  mis-owned. CORNERS rebases onto it and re-runs the acceptance; expect the number to move.

## 2. Branches — no shared branch, ever

Base: **`screenshot-framing` @ `f911b728`**. One worktree each, **under `.claude/worktrees/`** — ⛔ never
on the Desktop, never a sibling folder (`CLAUDE.md`, "stay inside the project"):

```
git worktree add .claude/worktrees/legs    -b legs-frontage-ownership screenshot-framing
git worktree add .claude/worktrees/corners -b corner-r0-and-slide     screenshot-framing
```

### ⛔⛔ AND THEN YOU MUST DO THIS, OR YOUR WORKTREE CAN ONLY MEASURE LAFAYETTE SQUARE
*Found by CORNERS thirty seconds after moving in, because its check **skipped loudly** instead of
quietly reporting one town. This instruction was wrong when first written — my error, and it is the
kit's signature failure committed by the coordination doc itself.*

**Only LS's ribbons are tracked.** `scratch/_proto-feed.mjs:19` reads `src/data/ribbons.json` for
lafayette-square and `cartograph/data/<scene>/clean/ribbons.json` for every other town — and **every one
of those is gitignored** (`.gitignore:123` and the per-scene blocks; `git check-ignore -v <path>` says
so). They exist only in the **main checkout's working tree**. ⇒ In a fresh worktree every cross-town
check silently becomes a **single-town check**, and single-town is the one thing Layer 0 forbids.
**And the authoring is stale on the one town you do get:** `public/looks/lafayette-square/design.json`
is TRACKED, so you get the committed slot count, not Jacob's live one — measuring a corner without the
operator's current authored state is **Layer 0 q3 committed by the instrument** (`§4` note, and it is
the same error `litmus-curb-parallel` has been making since 2026-07-31).

```sh
MAIN=/Users/jacobhenderson/Desktop/lafayette-square.nosync
for s in hipointe-demun altadena centrum ksi-y-m-yn lafayette-square-staging; do
  [ -f "$MAIN/cartograph/data/$s/clean/ribbons.json" ] &&     ln -sfn "$MAIN/cartograph/data/$s/clean/ribbons.json" "cartograph/data/$s/clean/ribbons.json"
done                                    # gitignored, so git sees nothing. ⚠️ READ-ONLY — a script that
                                        #    WRITES ribbons would write into the main tree.
cp "$MAIN/public/looks/lafayette-square/design.json" public/looks/lafayette-square/design.json
cp "$MAIN/public/looks/index.json"                   public/looks/index.json
git update-index --skip-worktree public/looks/lafayette-square/design.json public/looks/index.json
```
⭐ The `--skip-worktree` is the part to keep regardless: it makes Jacob's live authoring **physically
unstageable**, so "do not commit `design.json`" stops depending on anyone remembering. Undo with
`--no-skip-worktree`; it is per-worktree, so main is untouched. **Then re-run your gate and confirm it
names BOTH towns.** A check that reports one town has not run.

⛔ **Do not spawn a dev server.** Reuse the running one (`feedback_do_not_spawn_new_dev_servers`).

### ⚠️ ANYTHING MEASURED IN THE MAIN CHECKOUT TONIGHT MAY CARRY LEGS' IN-FLIGHT CODE
LEGS has been editing `src/lib/tileGround.js` in the **shared** checkout, uncommitted. Every probe run
there since — **mine included** — built against those lines. CORNERS caught one: HPDM "two different
roads meet" reads **334** in a clean tree against **352** measured in main. ⇒ **Re-run anything you
intend to rely on inside your own worktree**, and treat a figure from the main tree as provisional.
⭐ The tangent split in `§9`.3 is the exception — CORNERS reproduced it exactly in a clean tree.

## 3. Both of you must keep these green — they are not yours to move

```
node checks/claims-survey-and-section-agree.mjs      # 0 m² on all four layers. If it moves, STOP.
node checks/claims-proto-fill-is-live.mjs            # PASS both towns
npx vite build                                        # ⚠️ a green build is NOT a rendering build
```
⚠️ **A green build is not a rendering build.** A TDZ `ReferenceError` blanked both tools tonight and
`vite build` passed. Both entry points — `buildTileGround` (Survey) and `sectionOpen` (Section) — run
inside `claims-survey-and-section-agree.mjs`; if that script runs, you have not shipped a TDZ.

## 4. What is ALREADY BUILT. ⛔ Do not rebuild it.

- **The corner construction is `SECTION §6.1`, landed 2026-06-10** — `conD`, `cMin`, `conMax`,
  `rampLen = max(2, 2·(conMax−cMin))`, the slid quad, the `luWedge`. It runs in **both** painters now:
  `arcSectorPoly` in `sectionPassTile`, the same five steps as a **stamp** in `sectionPassProtoTile`
  (`2db0c777`). A re-implementation was written and excised on 2026-09-07 (`162b8645`) — read that
  commit before you touch the corner.
- **The leg cut works on the block Jacob is editing.** The painter's own comment blames tile 107 ("ZERO
  vertices turn ≥ 18°, so the whole 579 m perimeter came back as ONE leg"). **That comment describes a
  FIXED bug** — tile 107 today has 14 legs and all four corners found. ⛔ Do not chase it. **Excise the
  stale sentence when you touch that block** (`CLAUDE.md`: a false claim outlives its correction).
- **The turn test is not the road test.** The same comment says a leg breaks where the drawing TURNS
  **"or two different ROADS meet"** — only the turn test and the fillets are built. The road test does
  not exist: **ASPIRATION, not rot** — surface it, do not delete the sentence. **Sized in §5.**

## 5. LEGS — the job

**Symptom (Jacob):** *"when I swap one treelawn/sidewalk pair, it swaps all 4 sides of the block."*
**It is not the leg unit — it is ownership.** On his block the tile's frontage runs cover a fraction of
the tile's own contour, so the few runs it has are stamped across the rest of the ring and one authoring
slot owns three sides. Each straight side is ONE ring edge whose only vertex is a fillet **tangent** — a
corner vertex — so the side inherits its owner from the corner.

▶ `node checks/claims-frontage-covers-the-block.mjs lafayette-square --tile 107` — the instance
▶ `node checks/claims-frontage-covers-the-block.mjs` — the class, both towns
▶ `node checks/claims-ring-partition.mjs` — the sibling gate, already failing and saying so

⛔ **DO NOT FILL-PATCH IT.** `SECTION §7`: clamp, wrap, re-key and snap were each built and each
reverted — every one treated the *output* of a wrong ownership decision. Yours would be the fifth. The
cure is upstream, where the runs are built and ①'s labels are carried (~`:6890`): *the polygon must ask
the stamp* (`POLYGON-FIRST.md`).
⚠️ `biggest owner > 50%` in that check is **context, not a failure** — a block really can front one
street for most of its ring. Only the **coverage** line is evidence.

### ⛔⛔ AND A SECOND ITEM, MEASURED BY THE CORNERS AGENT 2026-09-07 — read it before you plan

The turn test is **minting the seam Jacob's rule 2 forbids.** Corners the leg cut sees but the corner
construction cannot reach, classified by carried identity across the vertex (`stp[q-1]` vs `stp[q]`):
**the largest class by far is "same run both sides" — a mid-block BEND.**
▶ `node checks/claims-every-corner-is-configured.mjs lafayette-square hipointe-demun` — **run it.**

A bend is not a corner. Each one cuts a leg in two so the halves resolve independently — *"the leg is
either *or* and never both; a seam or joint should be disqualified from possibility."* So the road test
(`§4`) is not merely unbuilt: **the turn test standing in for it is actively constructing what the rule
forbids.** This is LEGS' work, and it is the same defect as the coverage one seen from the other end.

⚠️ **THE TWO HALVES OF YOUR JOB PULL AGAINST EACH OTHER — DO THEM TOGETHER, NOT IN SEQUENCE.** The turn
test is also the only thing finding corners on rings that carry no fillet. Deleting it closes the seam
and **opens** the one-leg ring — which is Jacob's original symptom, a swap taking the whole block. I saw
a roads-only cut leave noticeably more rings uncut than the turn+fillet cut does, but I measured it with
a probe I have since **deleted**: treat that as a **lead, not evidence**, and re-derive it.

⚠️ **AND THE CORNERS AGENT'S CLASSIFICATION READS `iaStamp`, so it inherits YOUR defect.** Where one run
is stamped across three sides, a genuine two-roads corner reads as "same run both sides" and is counted
a bend. Their bend figure is an **upper** bound and their real-corner figure a **lower** bound. Neither
tightens until you land. ⛔ Do not quote either as settled.

## 6. CORNERS — the job

**Acceptance, Jacob's words (`SECTION §7`):** *"the sidewalk should be one continuous smooth line all
around the entire polygon."*
▶ `node checks/claims-sidewalk-is-one-band.mjs` — **re-run it; do not quote a number from here.**

**The open class, measured:** blocks that still do not close correlate hard with the **unfilleted (R=0)
corner** — broken tiles carry ~13× the sharp-corner count of whole ones, and the same split holds in the
second town. `RIBBONS §1` invariant 3 says the pad *"is a band-slice, not predicated on the arc — works
square OR round"*, so an R=0 corner is in scope. ⛔ The built construction skips it too (`§6.1` step 2
falls back only where a fillet exists) — that limitation carried over, it is not new.

**Also open, and it is `§6.1` step 5's other half:** the `luWedge` carve is deliberately **not** built in
③. It is a CUT, and cutting a band then re-joining it along the same edge leaves Clipper two touching
polygon records — **the band reads broken at unchanged area.** Re-run the acceptance before re-landing it.

### ⛔⛔ The trap that will cost you a night if you skip it
**Add first, then cut. Never cut an edge you are about to re-join.** Porting the walk painter's booleans
straight across took the acceptance **down** on geometry that was a strict **superset** of the original —
one block came back as two polygons of unchanged total area. Measure closure, not area.
**And: counting contour POINTS is not measuring LENGTH.** Corner arcs are ~5% of a contour by length and
~50% by points.

## 7. The commit gate — `CLAUDE.md`, every fix is three parts

Code works · **the commit message names the register it reached** (`FEATURES` = the capability in the
marketer's words, `OPERATIONS` = the knobs) **or says "reaches no register" outright** · superseded
verbiage **removed**, to `cartograph/_archive/`, never deleted, refs repointed in the same breath.

## 8. Checking in

Coordinator: `lafayette-square-nosync-62`. **Route to the canon first** — most of what you want to ask is
answered in `SECTION §3.3/§4/§6.1/§7` and `CLAUDE.md` Layer 0.

## 9. Cross-agent notes — ⛔ LEGS, these three are addressed to you

*From CORNERS, 2026-09-07, relayed because it has no channel to you. Its worktree is
`.claude/worktrees/corners` on `corner-r0-and-slide`; it has edited nothing under `src/` and has not
touched your `checks/claims-stamp-follows-the-edge.mjs`.*

1. ⛔ **IGNORE ITS SPLIT UNTIL YOU LAND — its own request, and it is right.** CORNERS classified the
   unreached corners into bends vs real corners by reading `iaStamp`. If your 30.2%-by-length finding
   holds, that instrument misreads real corners as bends **at a rate it cannot bound**, so its numbers
   move *far*, and in a known direction: bends down, corners up. ⭐ It asked me to make sure you treat
   this as licence to **ignore the split entirely and re-derive after**, rather than plan against it.
   That is an agent telling you its own headline number is unsafe. Take it.
2. ⭐ **ONE ROAD-IDENTITY RESOLVER, AND IT IS YOURS.** CORNERS' R=0 cure needs "two different roads meet";
   it will consume your helper and write none, developing meanwhile against a shim it marks as a
   stand-in and deletes on rebase. ⛔ Two resolvers for one question is `52b62415`'s exact shape — the
   treelawn colour was resolved in two places and only one got fixed. Say if you'd rather it hold the
   predicate entirely and build the fillet case first, which needs no road test.
3. **Does your provenance tally cover the missed fillet TANGENT?** CORNERS asks, because a tangent that
   matches no ring vertex may be the same root as your label carry — the union re-resolving the point.
   **Measured while relaying, and it does not answer as one thing:**
   > missed tangents, by distance to the nearest ring vertex —
   > **LS: 57 missed · 29 within 1 mm · 16 at ≥10 cm** · **HPDM: 586 missed · 3 within 1 mm · 479 at ≥10 cm**
   ⭐ **The mould and town #2 disagree about what this class IS.** On LS half the misses sit inside
   Clipper's own 1 mm integer grid (`SCALE = 1000`) — a key-precision miss, and an exact-string key
   (`KP`, 6 dp) cannot match a point the grid moved. On HPDM four fifths are ≥10 cm away: the point is
   **genuinely not on the contour**, which is a different animal. ⛔ **Cause not established for the
   ≥10 cm class.** A tolerance on the key would look like a cure on LS and do almost nothing on HPDM —
   Layer 0's signature failure, cleanest on the town you have been staring at.
