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
| its gate | `scratch/claims-frontage-covers-the-block.mjs` · `scratch/claims-ring-partition.mjs` | `scratch/claims-sidewalk-is-one-band.mjs` |
| its open class | frontage runs that do not cover their own block | the **unfilleted (R=0) corner** |

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
⛔ **Do not spawn a dev server.** Reuse the running one (`feedback_do_not_spawn_new_dev_servers`).
⛔ Do not commit `public/looks/*/design.json` — that is Jacob's live authoring, not your change.

## 3. Both of you must keep these green — they are not yours to move

```
node scratch/claims-survey-and-section-agree.mjs      # 0 m² on all four layers. If it moves, STOP.
node scratch/claims-proto-fill-is-live.mjs            # PASS both towns
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
  not exist. That is **ASPIRATION, not rot** (`CLAUDE.md`): it is an unbuilt decision, so surface it as
  work — do not delete the sentence. ⚠️ And note a ≥18° turn fires on a street that merely **bends**
  mid-block, which is rule 2's forbidden seam.

## 5. LEGS — the job

**Symptom (Jacob):** *"when I swap one treelawn/sidewalk pair, it swaps all 4 sides of the block."*
**It is not the leg unit — it is ownership.** On his block the tile's frontage runs cover a fraction of
the tile's own contour, so the few runs it has are stamped across the rest of the ring and one authoring
slot owns three sides. Each straight side is ONE ring edge whose only vertex is a fillet **tangent** — a
corner vertex — so the side inherits its owner from the corner.

▶ `node scratch/claims-frontage-covers-the-block.mjs lafayette-square --tile 107` — the instance
▶ `node scratch/claims-frontage-covers-the-block.mjs` — the class, both towns
▶ `node scratch/claims-ring-partition.mjs` — the sibling gate, already failing and saying so

⛔ **DO NOT FILL-PATCH IT.** `SECTION §7`: clamp, wrap, re-key and snap were each built and each
reverted — every one treated the *output* of a wrong ownership decision. Yours would be the fifth. The
cure is upstream, where the runs are built and ①'s labels are carried (~`:6890`): *the polygon must ask
the stamp* (`POLYGON-FIRST.md`).
⚠️ `biggest owner > 50%` in that check is **context, not a failure** — a block really can front one
street for most of its ring. Only the **coverage** line is evidence.

## 6. CORNERS — the job

**Acceptance, Jacob's words (`SECTION §7`):** *"the sidewalk should be one continuous smooth line all
around the entire polygon."*
▶ `node scratch/claims-sidewalk-is-one-band.mjs` — **re-run it; do not quote a number from here.**

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

The session that wrote this is `lafayette-square-nosync-62`. Message it with `SendMessage` if you need
the reasoning behind any line here — but **route to the canon first**; most of what you want to ask is
already answered in `SECTION §3.3/§4/§6.1/§7` and `CLAUDE.md` Layer 0, and asking Jacob to re-decide what
the purpose already settles is the expensive failure this repo names by name.
