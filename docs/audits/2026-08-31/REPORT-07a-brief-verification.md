# REPORT 07a — The four aspiration briefs, verified against live code

Addendum to REPORT-07, run after the owner confirmed that **the "couple of dangling bugs" he refers
to are the ASPIRATION class** — ratified designs specified in a root-level brief and then never
built, not a separate defect population.

**This addendum contains the audit's most important single finding.**

---

## 1 · Verdicts

### `BRIEF-terminal-node-sweep.md` — ⚠️ PARTIALLY BUILT, and this is the most important finding in the audit

**Not unbuilt. The stamp landed:**

- `cartograph/skeleton.js:2225-2286` — a block headed verbatim `── Identity terminal/through — the
  through-node fact (BRIEF-terminal-node-sweep) ──`. **Beats 1, 2 and 3 are all implemented**,
  including the ring rule (`:2275`) and the "deliberately not unified" reasoning the brief asked be
  written into the comment.
- `:2278-2279` writes `s.throughId` and `s.through = {start, end}`.
- Serialized **twice** — `derive.js:2565-2566` and `:4593` (the latter under a
  `[BRIEF-terminal-node-sweep]` comment).
- **Present on all 209 streets** in `ribbons.json`; distribution **129 through / 289 terminal**
  endpoints.
- **Consumed**: `tileGround.js:4003-4004` reads `so.through.start`/`.end`; `throughId` feeds
  `cornerAt` via `streetKey` (`tileGround.js:216`, with a comment explaining the two-union design).

**But the removal pass — which the brief calls "⭐ *This is half the deliverable, not a footnote*" —
never ran. All four candidates are live today:**

| Candidate | Status | Sites |
|---|---|---|
| 1. `thruNodeEnds` / `isThruNode` / `opts.thruTNode` | **live** | `tileGround.js:1812,1813,1994,1996,4691,4696` (8 hits) + `:3818-3824` knob (3 hits) |
| 2. `DOT_CONTINUES = -0.6` angle gate | **live** | `derive.js:2485,2492,4194,4209,4213` (5 hits) |
| 3. `isNameTransition` special case | **live** | `tileGround.js` (3 hits) |
| 4. local `isThrough` inference | **live** | `cornerAt` at `tileGround.js:280` is still the two-union local test, not a read of the stamped fact |

⛔ **And `ROADMAP A2:310` says: "✅ SOLUTION LANDED (terminal-node sweep, 2026-07-21)… The removal
pass excises the guessers it subsumes."**

**That date is the day the brief was committed once and never touched again** (`01d57a8f`,
2026-07-21). **The board recorded the spec as the solution, in the past tense, including the half
that has not run.**

⚠️ One thing I will not explain: `tileGround.js:4003-4004` reads `(so.through ? so.through.start :
true)` — **a chain with no stamp is treated as through.** On LS all 209 carry the stamp so it never
fires. **Its effect on a town without the stamp: cause not established.**

---

### `BRIEF-pair-free-edge-anchor.md` — OPEN, verbatim. Not one line built.

- The coupling the brief calls "the whole bug" is intact: `derive.js:3836-3840` still stamps
  `anchor='inner-edge'` + `innerSign` **only** on detected pairs (`innerSideSign(A.points, B.points)`).
- The anchor vocabulary is still `{center, inner-edge}`. **`left-edge`/`right-edge` appear nowhere**
  in `src/` or `cartograph/` (the only grep hit is an unrelated comment in `DawnTimeline.jsx:32`).
- The UI gate is still there, character for character: `SurveyorPanel.jsx:357-358` —
  `<option value="inner-edge" disabled={!st.innerSign}>` / `Inner-edge {st.innerSign ? '' : '(no
  paired chain detected)'}`.
- The mechanism holds: `bake-ground.js:314` `ringsToHoledPolys`, `:318` `if (ringSignedArea(r) > 0)
  outers.push(r); else holes.push(r)` — the winding-sign classifier. *(Brief cites `:307`; drifted 7
  lines.)*
- `tileGround.js:1236` still carries the in-source warning `⛔ The persisted innerSign side-key is
  UNRELIABLE`.

**Load-bearing exactly as claimed: HPDM is the town-#2 evidence base, and this is the defect that
makes HPDM's asphalt render with holes in it.**

---

### `BRIEF-ground-seam.md` — OPEN, verbatim, and TRACKED ON ZERO BOARDS

- The wrong operator is at `src/components/treeAtlasMaterial.js:1036`, exactly as specified:
  `diffuseColor.rgb = mix(diffuseColor.rgb, gcol, baseF);`
- The surrounding block matches the brief line for line — the AO multiply `gcol *= (1.0 - gfx.g *
  uTrunkShadowStr)` at `:1033`, the pool add at `:1034`. **The brief's diagnosis stands:** `gcol` is
  ground **albedo**, brighter than bark, so the lerp can only lighten the trunk base at any `blend`.
- `git log --since=2026-08-24` on `treeAtlasMaterial.js` and `BakedGround.jsx` → the shader file was
  touched once (`c3ec2203`, the silver-underside fix) on an unrelated block; `BakedGround.jsx` not
  since 2026-06-30.
- **The block is lifted and nobody noticed.** And it is worse than that: `grep -c ground-seam` over
  ROADMAP, BACKLOG, AUDIT-MATRIX, ACCORDANCE-REVIEW, PIPELINE-CLAIMS → **0, 0, 0, 0, 0.**

⛔ **This item exists only as an untracked file at repo root. If the brief were deleted, nothing in
the project would remember it.**

⭐ Worth noting in its favour: the brief already specifies two checks that are *"one-line assertions
over baked data. Neither needs anyone to have seen the street."* **That is Layer 0 satisfied at spec
time — it is dispatch-ready as written.**

---

### `BRIEF-freeze-the-curb.md` — OPEN, verbatim, every receipt reproduces

- `node -e "…shape.json…"` → **`curbFacts: 0 of 101`.**
- `grep -rn curbFacts src cartograph` → **exactly two hits**: `tileGround.js:4186` (`const curbFacts
  = tile.curbFacts || freezeCurbEdgeFacts({…})`) and `:4303` (`facts: curbFacts`). **Read at one
  site, written nowhere. The `||` fallback is still the only path that has ever executed.**
- The brief's own §3 correction verifies too: `tilesFromFrozen` (`:1057`) pushes an explicit
  whitelist — `{ring, edges, caps?}` at `:1082`. **`curbFacts` genuinely cannot arrive by that
  route.**

---

## 2 · Reconciliation against the board harvest

| Brief | On a board? | How it reads there |
|---|---|---|
| `terminal-node-sweep` | ROADMAP `A2` (1 mention) | **✅ "SOLUTION LANDED"** — half-true, reads fully true |
| `pair-free-edge-anchor` | ROADMAP `A9` (1 mention) | Open, accurately described. *(This was in REPORT-07 §2.3 as "blocked on a larger arc" — **that was too generous; it is a specified, dispatch-ready fix, not a blocked one.**)* |
| `ground-seam` | **nowhere** | Untracked entirely |
| `freeze-the-curb` | ROADMAP `A3`, BACKLOG ×3 | ⛔ **All four pointers name `HANDOFF-freeze-the-curb-in-the-first-bake.md`, which is in `_handoffs/` — gitignored, `git ls-files _handoffs/` → 0.** The boards point at a document that is not in the repository, while the live brief that says *"Closes ROADMAP A3"* is unreferenced by any board. |

**Correction to REPORT-07 §2.3:** pair-free and freeze-the-curb move from KNOWN-AND-ACCEPTABLE to
**SHOULD-FIX**; ground-seam is new and belongs in SHOULD-FIX; the terminal-node removal pass is new
and belongs in SHOULD-FIX. **Revised: 9 must-fix / 18 should-fix / 17 known-acceptable / 11
not-a-bug.**

---

## 3 · The framing, answered squarely

**Is the true ledger ~4 well-specified items plus tracked-but-closed noise, or is there an
undescribed population of real defects?**

**Neither, and the gap between them is the answer. There are three populations, and the owner has a
mental model for one of them.**

### ① The four aspirations — he is right, and better than right

All four are real, all four are still present in the code, and all four are specified to a standard
that would let an agent start today. **Two of them (`ground-seam`, `pair-free`) already carry
acceptance checks that don't require anyone to have seen the street.** This is genuinely a small,
well-understood set.

### ② The geometry/render domain has essentially no undescribed population — the strongest evidence for his claim

I went looking. The two ❌ RED gates in his own detector both map to described items (curve-fit →
`A4`/`L-15`; keyhole → `A1`/`L-16`). The `6 unresolvable pairs / 30 tip-wraps` map to `A6`. `A17`'s
receipt reproduces exactly. **4 live TODOs in product code. I did not find a geometry defect that no
brief and no board describes.** ⭐ **His "granular idea of how everything is going to be" is
supported by the evidence in the domain he spends his time in.**

### ③ But two populations sit outside that model, and both are real

**Security — ~9 items, mostly outside the brief corpus.** L-01 (anon key reads every active
courier's licence plate and Stripe id), L-02 (IDOR), L-03+L-04 (command injection on a
`0.0.0.0`-bound dev server), L-05 (fail-open cron guard). These are not geometry, no brief describes
them, and **L-07 — a stale `onboarding/index.js` with zero caller auth sitting beside the fixed
`index.ts` — is described by no brief and no board; I found it fresh.** A small but non-empty
undescribed population.

⭐ **The category he has no slot for: work that half-landed and got a ✅.** The terminal-node sweep is
the proof. The stamp is real, shipping, and consumed. The removal pass — explicitly *half the
deliverable* — never ran, and `ROADMAP A2` says LANDED.

⛔ **This is invisible to both his models: it is not a "dangling brief" (something did ship) and it is
not a "bug" (nothing is visibly wrong). It is an aspiration filed as done** — exactly the failure
mode `CLAUDE.md` names as the conformance job's own: *"an unbuilt thing filed as done; surface it as
work."*

---

## 4 · The direct answer

The defect count is small and the behaviour of the geometry system is well understood — **he is right
about that, and the first-pass audit understated how right.**

What is not well understood is **the return path**. The boards record dispatch and never record
return, in *both* directions: **12 briefs describe shipped work and read pending**, and **at least one
board entry describes half-shipped work and reads landed**. **22% of items the boards call OPEN are
closed.** The ledger he reads is **wrong in both directions at once**, which is why the count feels
smaller than it is *and* larger than it is depending on which board he opens.

⭐ **One fix addresses all of it, and it is the same one from REPORT-07 §6.3:** 79 `claims-*` scripts,
zero wired to CI, no `npm test`. **A check that asserts *"the removal pass ran — `DOT_CONTINUES` is
gone, `isThruNode` is gone"* would have turned `A2`'s ✅ red the day it was written.**

**The return path is not a process problem. It is an unwired gate.**
