# REPORT 01 — Root-level markdown audit

**49 files / 11,697 lines.** Branch `land-use-derivation`, audited 2026-08-31. Zero edits made.
Every number carries its command. `_handoffs/` and `scratch/` excluded (see REPORT-03).

```bash
ls -1 *.md | wc -l                    # 49
wc -l *.md | tail -1                  # 11697 total
```

---

# PART 1 — The BRIEF / FINDINGS / FORENSIC / HANDOFF class

## 1.1 The mass

```bash
ls -1 BRIEF-*.md | wc -l                                  # 17
wc -l BRIEF-*.md | tail -1                                # 2753
wc -l *FINDINGS.md *FORENSIC.md HANDOFF-*.md | tail -1    # 2442
```

| Family | Files | Lines | Share of the 11,697-line root corpus |
|---|---|---|---|
| `BRIEF-*.md` | 17 | 2,753 | **23.5%** |
| `*-FINDINGS.md` (4) + `*-FORENSIC.md` (1) + `HANDOFF-*.md` (1) | 6 | 2,442 | **20.9%** |
| **Class total** | **23** | **5,195** | **⛔ 44.4% of the root corpus** |

By file count it is 23 of 49 — 47%. **A stranger cloning this repo finds that the plurality of
documents at the top level are letters written to AI agents about work that mostly already
happened.**

## 1.2 The complete list, with verdicts

```bash
for b in BRIEF-*.md *FINDINGS.md *FORENSIC.md HANDOFF-*.md; do
  echo "$(git log --diff-filter=A --format=%ad --date=short -- "$b" | tail -1)  \
$(git log -1 --format=%ad --date=short -- "$b")  $(git log --oneline -- "$b" | wc -l)  \
$(wc -l < "$b")  $b"; done | sort
```

| File | Lines | Created | Last touch | Commits | Verdict | Evidence |
|---|---|---|---|---|---|---|
| `SIEVE-DETECTOR-FINDINGS.md` | 191 | 06-13 | 06-22 | 3 | SUPERSEDED | Extended by LOOM then THROAT on the same harness |
| `LOOM-TOPO-FINDINGS.md` | 210 | 06-13 | 06-22 | 3 | SUPERSEDED | Superseded by THROAT |
| `THROAT-JUNCTION-FINDINGS.md` | 201 | 06-13 | 06-22 | 3 | SUPERSEDED | Terminal entry of a 3-part chain; harness is `scratch/correctness-detector.mjs` |
| `DESIGNER-LOAD-FORENSIC.md` | 166 | 07-14 | 07-22 | 3 | SUPERSEDED | Creating commit `37c537b0` names the root; figure-ground deleted at T4, 180s→18s |
| `BRIEF-ls-bleed-excision.md` | 204 | 07-20 | 07-31 | 4 | **LIVE** | 3 inbound refs (2 from ROADMAP); root cure is `EXTENT-DESIGN §6` step 4, unshipped |
| `BRIEF-terminal-node-sweep.md` | 104 | 07-21 | **07-21** | **1** | ⚠️ **ABANDONED → ASPIRATION** | "DRAFT, dispatch-ready" for 41 days, never revised. *(See REPORT-07a — this verdict was later refined to HALF BUILT.)* |
| `BRIEF-street-labels.md` | 110 | 07-21 | **07-21** | **1** | SUPERSEDED | `7ddd87f1 feat(labels)` — the brief's exact scope landed; the file was never told |
| `BRIEF-land-use-derivation.md` | 205 | 07-21 | 08-06 | 5 | SUPERSEDED | Poured, baked, eye-gated 2026-08-24 (`29955e46`). File still says "PHASE 1 … EYE-GATED AND FAILED" |
| `BRIEF-arborist-slab-weight.md` | 117 | 07-21 | 08-29 | 2 | SUPERSEDED | `2e8112af` — 1,121 MB of VRAM becomes 282. ⛔ Its promised deliverable `ARBORIST-SLAB-WEIGHT.md` **does not exist** |
| `BRIEF-pair-free-edge-anchor.md` | 56 | 07-22 | **07-22** | **1** | ⚠️ **ABANDONED → ASPIRATION** | 40 days, never revised. `git log --grep="edge anchor"` → 0 commits |
| `BRIEF-hpdm-curve-fit.md` | 81 | 07-22 | **07-22** | **1** | SUPERSEDED | `d15d7dd2 fix(A01): CURVE_FIT default-on` — the one knob it asks to turn on. 0 inbound refs |
| `BRIEF-dead-end-mouth-junction.md` | 288 | 07-22 | 07-30 | 5 | **ROTTEN** | Its own line 3: "⛔ **RETIRED 2026-07-22** … do NOT dispatch this separately" |
| `BRIEF-excise-the-banners.md` | 121 | 08-06 | 08-06 | 3 | ABANDONED (held) | "⛔ ON HOLD", 25 days; release condition still unmet |
| `BRIEF-freeze-the-curb.md` | 134 | 08-21 | 08-21 | 2 | ✅ **LIVE** | "OPEN, undispatched", closes `ROADMAP A3`. `git log --grep=curbFacts` → the finding + the brief, no fix |
| `BRIEF-slice2-walk-full-crop-last.md` | 165 | 08-21 | 08-21 | 3 | LIVE, but misleading | ROADMAP-referenced; the WALK is switched off and explains nothing on screen |
| `BRIEF-arborist-exorcism.md` | 311 | 08-23 | 08-23 | 3 | SUPERSEDED | Arborist arc closed 2026-08-28 |
| `TRAIT-SURVEY-FINDINGS.md` | **1361** | 08-24 | 08-24 | 8 | SUPERSEDED | Its conclusion is `PROPOSAL-rubric-axes.md`. Largest root file (139 KB) |
| `BRIEF-tree-trait-survey.md` | 120 | 08-24 | **08-24** | **1** | SUPERSEDED | Answered by the file above |
| `BRIEF-arborist-join-and-budget.md` | 426 | 08-24 | 08-24 | 19 | SUPERSEDED | Largest brief; tree arc landed 2026-08-28 |
| `BRIEF-ground-seam.md` | 80 | 08-24 | **08-24** | **1** | ⚠️ **ABANDONED → ASPIRATION** | Blocked on join-and-budget §0a, **which has since closed — the block is lifted and nobody noticed** |
| `BRIEF-deploy-arborist-grove.md` | 108 | 08-25 | **08-25** | **1** | SUPERSEDED | Grove pour landed (74 commits mention "grove") |
| `BRIEF-species-pipeline-adversarial.md` | 113 | 08-25 | **08-25** | **1** | **landing NOT ESTABLISHED** | 3 commits match; insufficient to call |
| `HANDOFF-tree-render-2026-08-28.md` | 113 | 08-28 | 08-29 | 5 | DIARY + a live OPEN tail | The only root `HANDOFF-*`; the other 54 live in gitignored `_handoffs/` |

**Tally: 2 LIVE · 1 live-but-misleading · 12 SUPERSEDED · 4 ABANDONED/ASPIRATION · 1 ROTTEN ·
1 not-established · 1 mixed. Two of twenty-three still govern work — 8.7%.**

## 1.3 The measurement that names the disease

```bash
for b in BRIEF-*.md *FINDINGS.md *FORENSIC.md HANDOFF-*.md; do
  echo "$(git log --oneline -- "$b" | wc -l)  $b"; done | sort -rn
# → 8 files have exactly 1 commit

for b in BRIEF-*.md; do
  echo "$(grep -l "${b%.md}" *.md | grep -v "^$b$" | wc -l)  $b"; done | sort -rn
# → 7 briefs have ZERO inbound references from any root doc
```

- **8 of 23 files (35%) were committed once and never touched again.** They carry no closure
  marker because **nothing in the process ever returns to a brief.**
- **7 of 17 briefs have zero inbound references.** Unreachable from the front door, ROADMAP included.
- Only **2 briefs carry `OPEN`**; **12 are SUPERSEDED and none says so.** A reader cannot
  distinguish live from dead by reading the file — only by reconstructing git history.

⛔ **The class defect: the corpus records dispatch and never records return.** A brief is a
forward-looking artifact with no backward-looking half, so its state is permanently unknown to
everyone including the author.

## 1.4 What process produced 17 root briefs

```bash
for b in BRIEF-*.md; do echo "$b :: $(git log --diff-filter=A --format='%h %s' -- "$b" | tail -1)"; done
```

- `0e308e30` — *"**Split the ground seam into its own brief; stop growing the main one**"*
- `a8b3ad73` — *"Conform the docs to the day, and **hand the baton to the night shift**"*
- `01d57a8f` — two briefs in one commit
- `89ce1d57` — two more in one commit

The mechanism:

1. **A brief is a prompt, and prompts got persisted.** Every one opens in the second person to
   an AI — *"You are a FRESH agent"*, *"Name yourself"*, *"⛔ Do not read `BOZ.md`"*. A file is
   how you hand a long prompt to a subagent, and then the file stayed.
2. **Dispatch happens daily, so briefs accrue daily.** 17 across ~45 working days.
3. **`0e308e30` is the disease naming itself** — the pressure valve for a document getting too
   big was *another document*.

Compounding: ~12 of 17 re-state the routing gate and the claims-are-not-facts disclaimer —
several hundred duplicated lines whose home is `CLAUDE.md`.

## 1.5 Is PRUNE AS YOU GO being followed? **No — and it is broken hardest by the docs that state it.**

| Rule | Status | Evidence |
|---|---|---|
| No net-new doc without retiring one | **Broken 17×** | 17 briefs created; `_archive` gained 0 root entries |
| Superseded content **moves** to the Diary | **Broken** | `BRIEF-dead-end-mouth-junction.md` self-declared RETIRED, still at root 40 days later |
| "RESOLVED, kept for context" is the anti-pattern | **Broken, verbatim** | `BRIEF-land-use-derivation.md` opens *"It is kept, not deleted, because the reasoning is sound"* |
| Excise the sentence, not just banner it | **Broken** | Same file: *"§1's HEADLINE IS WRONG"* — and §1 is still there |
| Put it in the commit message | **Followed, and it works** | `e302848f` "THE CURB IS NEVER FROZEN — tile.curbFacts is read at one site and written nowhere" is a better artifact than most briefs |

⭐ **The rule has no forcing function on the *creating* side.** There is a COMMIT GATE on the
register question and nothing at all on file creation. Adding a root `.md` is frictionless;
retiring one requires judgment that is *irrecoverable later* — which is why 12 files sit in
SUPERSEDED limbo. **The cheap moment to record a brief's fate is the commit that closes it.**

## 1.6 ⭐ The proposed disposition rule

> ## A BRIEF IS A MESSAGE, NOT A DOCUMENT. IT DOES NOT LIVE IN THE REPOSITORY.
> **A brief's only durable residue is (a) the ROADMAP line it moves and (b) the runnable check
> it leaves behind. If it produced neither, it produced nothing worth keeping.**

1. **Briefs are born gitignored** (`.claude/briefs/`, or handed inline at dispatch).
2. **A brief may not be a detail-home.** ROADMAP points only to tracked canon. Today 6 ROADMAP
   pointers name briefs and 1 (`BRIEF-prevailing-direction-projection.md`) names a brief that
   does not exist.
3. **Findings and forensics are born in the Diary** — `<domain>/_archive/<TOPIC>-YYYY-MM-DD.md`,
   dated at birth.
4. **The closing commit names the brief's fate** — `closes brief: <name>`, and deletes it.

**The check that makes it stick:**

```
# scratch/claims-root-doc-hygiene.mjs — READS the repo, restates nothing
#  FAIL if any tracked ^(BRIEF|HANDOFF)-.*\.md$ or .*-(FINDINGS|FORENSIC)\.md$ exists at root
#  FAIL if any ROADMAP.md pointer resolves to a brief, or to an untracked/absent path
#  WARN  if any tracked root .md has exactly 1 commit and is >21 days old
```

⭐ That third clause is a **mechanical detector for the whole disease** — it flags all 8 of
today's never-revisited files without knowing anything about this project.

## 1.7 ⚠️ Before any reduction: the four ABANDONED files are ASPIRATIONS

| File | The decision that dies with it |
|---|---|
| `BRIEF-terminal-node-sweep.md` | The "universal solvent" for the false corner. Designed with Jacob, never dispatched. |
| `BRIEF-pair-free-edge-anchor.md` | Divided/frontage overlap-holes on HPDM — **HPDM is the entire town-#2 evidence base**, which makes this more load-bearing than its 56 lines suggest. |
| `BRIEF-ground-seam.md` | "An upright object should meet the ground correctly" — trunks *and* lamp posts. Its stated blocker has cleared. |
| `BRIEF-excise-the-banners.md` | The doc-hygiene pass this audit duplicates. **Should be released, not archived.** |

---

# PART 2 — The other 26 root docs

| Path | Lines | Touched | What it is | KIND | Disposition |
|---|---|---|---|---|---|
| `README.md` | 233 | 08-23 | Front door | **CANON** | **KEEP — split into 4** (Q1) |
| `ORIENTATION.md` | 147 | 08-21 | The kit's mental model + dependency chain | **CANON** | **KEEP — make it the sole entry** |
| `ROADMAP.md` | 493 | 08-29 | The cross-domain board | **CANON + DIARY fused** | KEEP, split closed→Diary (Q3) |
| `CLAUDE.md` | 209 | 08-29 | Agent routing gate | **INTERNAL-ONLY** | KEEP, never share |
| `BOZ.md` | 216 | 08-14 | Coordinator persona | **INTERNAL-ONLY** | KEEP, never share |
| `PIP.md` | 36 | 06-24 | Named-summon persona | **INTERNAL-ONLY** | KEEP, never share |
| `AGENT-VALIDATION-SURFACES.md` | 133 | 07-11 | Index for brief-writers | **INTERNAL-ONLY** | KEEP → `.claude/` |
| `SLAB-CONTRACT.md` | 462 | 07-14 | Producer↔consumer interface | **CANON** | **KEEP — flagship external doc**; lowest glyph density at 0.2/100 lines |
| `SECURITY.md` | 598 | 08-25 | Surface catalog + register F-1…F-15 | **CANON** | KEEP; NDA only |
| `NEIGHBORHOOD-INPUTS.md` | 388 | 08-24 | The pour template | **CANON** | KEEP |
| `INTAKE-CATALOGUE.md` | 463 | 07-21 | Every input a town could have | **OVERLAP** est. 50–65% with the above | **MERGE** |
| `ONBOARDING.md` | 73 | 07-19 | intake→hydration runbook | **CANON** | **KEEP — what a licensee wants; badly underweighted at 73 lines** |
| `PUBLISH.md` | 265 | 08-24 | Deploy procedure | CANON, ROTTEN head | KEEP, fix `:5` (names `~/Desktop/lafayette-square`; actual is `…-square.nosync`) |
| `EXTENT-DESIGN.md` | 418 | 08-21 | Extent design of record | **CANON** | KEEP |
| `EXTENT-EXCAVATION.md` | 450 | 08-12 | Its evidence layer | **DIARY** (self-labelled) | ARCHIVE |
| `PIPELINE-CLAIMS.md` | 281 | 08-05 | The chain as falsifiable claims | **CANON** | **KEEP — the best instrument in the root** |
| `ACCORDANCE-REVIEW.md` | 176 | 08-29 | Outside-in diligence | CANON, competing front door | KEEP, retitle, demote from entry |
| `SHOW-BIBLE.md` | 119 | 08-06 | Master pitch, 3 audiences | ⚠️ **ASPIRATION** + ~25% overlap | **KEEP, FLAG** — §0's four-tier product stack is **the commercial thesis and exists nowhere else** |
| `SALON-INTERFACE.md` | 185 | 08-28 | Salon plate-rack pivot | ⚠️ **ASPIRATION** | **KEEP, FLAG** — "in flight, 2026-06-25", 9 weeks |
| `PROPOSAL-rubric-axes.md` | 189 | 08-24 | Rubric axes spec | ⚠️ **ASPIRATION — textbook case** | **KEEP, FLAG** — carries ✅ and *"Not yet executed"*. ⚠️ **REPORT-05 later measured this as LANDED 2026-08-28 — it is ROT, not aspiration.** |
| `TREE-INTAKE.md` | 162 | 08-29 | Per-town tree pipeline | **CANON** | KEEP |
| `THEWARD-ONLINE.md` | 172 | 08-31 | Pointer to the marketing-site repo | **CANON (pointer-kind)** | KEEP — correctly built as pointer-not-restatement |
| `AUDIT-MATRIX.md` | 203 | 06-30 | Spec for the closed 2026-06 campaign | **DIARY** | ARCHIVE |
| `HIPOINTE-DEMUN-ROSTER.md` | 501 | 08-06 | Second-pour building roster | **ROTTEN (self-declared)** | ARCHIVE — its banner: *"⛔ Quote no number from this doc"* |
| `DEPLOY-CHECKLIST-backend-tenancy.md` | 44 | 07-07 | One deploy's checklist | **DIARY** | ARCHIVE |
| `BUSINESS_LISTINGS.md` | 96 | **05-14** | LS business tracker | **ROTTEN / instance data** | **EXCISE to `ls/`** — oldest root doc; instance content at kit root violates Layer 0 |

### Root `_archive/` — healthy

```bash
find _archive -name '*.md' | wc -l                     # 7
find _archive -name '*.md' -exec wc -l {} + | tail -1  # 5296
git ls-files _archive | wc -l                          # 5
```

- `notes/NOTES-2026-04-07_to_2026-05-18.md` + `NOTES-2026-05-27_to_2026-06-08.md` (~5,000 lines)
  — **the earliest design record. KEEP, do not touch.**
- `handoffs/{…-LANDED-2026-06-22, …-LANDED-2026-07-11, …-KILLED-2026-06-05}.md` — ⭐ **this is
  the correct naming convention and it already exists in this repo**: disposition + date in the
  filename. §1.6 clause 3 is just "do what `_archive/handoffs/` already does."
- ⛔ **13 legacy `.py`/`.mjs`/`.cjs` scripts sit in `_archive/`.** Dead code gets EXCISED, not
  archived — the doc rule wrongly applied to code.

---

# PART 3 — The six questions

## Q1 — Is `README.md` a usable front door? **No.**

```bash
awk '{s+=length; if(length>m)m=length} END{print "max",m,"avg",s/NR}' README.md  # max 4767  avg 265.7
awk 'length>1000' README.md | wc -l    # 16
grep -o '⛔\|⭐\|⚠️' README.md | wc -l   # 101 → 43.3 per 100 lines
```

**233 lines / 62,147 bytes = average line 266 chars, longest 4,767.** On screen this is ~45
pages. The 16 lines over 1,000 chars are table cells, which means it renders as an unreadable
table, **cannot be diffed** (a one-word change rewrites a 4KB line), and its "settled
conclusion" column is a paragraph rather than a conclusion.

What breaks in the first 60 seconds:

1. ⛔ **Line 3 names the wrong product.** *"3D neighborhood visualization of Lafayette Square,
   St. Louis."* **The front door's third line commits the exact error the entire doctrine exists
   to prevent** — and it is the first sentence any outsider will read.
2. **The second heading is a scolding, not a welcome** — a 17-row table of `pavementHW` / `iA` /
   `segOrd` / "the Wall" with no glossary and no diagram anywhere in the file.
3. **Every proper noun precedes its definition** — Cartograph, Stage, Arborist, the Slab, the
   Ward, Survey, Section, Prebake, all used ~120 lines above the table that defines four of them.
4. **43 warning glyphs per 100 lines.** A stranger reads ⛔ as *"you are doing this wrong."*
5. **No "what is this / who is it for / what does it produce / how do I see it."**
6. **It leaks live endpoints** (Part 4).

## Q2 — How many competing front doors? **Seven.**

`ORIENTATION` ("start here, everyone, first") · `README` ("read this FIRST") · `CLAUDE` ("the
mandatory routing gate… the one canonical reading order") · `ROADMAP` ("**the one**
cross-domain master") · `ACCORDANCE-REVIEW` (the investor lens) · `SHOW-BIBLE` ("**the one doc**
that frames the whole project") · `ONBOARDING` ("the followable procedure").

The corpus knows: `CLAUDE.md` says *"One path — not competing front doors"* and then supplies a
fourth ordering.

**The ONE order a stranger should have:**
1. `README.md` (rewritten, ~60 lines) — what the kit is, one picture, `npm install && npm run dev`, the live site.
2. `ORIENTATION.md` — the mental model + dependency chain.
3. **Fork by role:** developer → `SLAB-CONTRACT` → `cartograph/ARCHITECTURE` · operator →
   `ONBOARDING` → `NEIGHBORHOOD-INPUTS` · investor → `SHOW-BIBLE §0` → `ACCORDANCE-REVIEW`.
4. `ROADMAP.md` only after step 3, relabelled internal.

**Cost: 1–1.5 sessions.** The expensive part — deciding which wins — is already decided in
`CLAUDE.md`; it is simply not enforced in the files.

## Q3 — ROADMAP: board or log? **Both, fused.**

```bash
grep -cE '^\s*-\s' ROADMAP.md                                   # 270 bullets
grep -E '^\s*-\s' ROADMAP.md | grep -cE '✅|LANDED|DONE|CLOSED'  #  59
grep -cE '\bOPEN\b' ROADMAP.md                                  #   2
grep -o '⛔\|⭐\|⚠️' ROADMAP.md | wc -l                            # 404 → 81.9 per 100 lines
awk '{s+=length; if(length>m)m=length} END{print "max",m,"avg",s/NR}' ROADMAP.md  # max 1732 avg 314
```

- **Lines 1–77 (16%) are preamble, not work** — mostly duplicating `CLAUDE.md` Layer 0.
- **Column A alone is 275 lines, 56% of the file**, for one of two columns.
- **59 of 270 bullets (21.9%) carry a closed marker. Exactly 2 carry `OPEN`.** The board marks
  *closure* ~30× more often than *openness* — inverted for a punch-list.
- **Retracted hypotheses are preserved inline as work items** (`:301`).
- The file breaks its own stated rule: *"When an item lands, strike it… Never let a done item sit here."*

**Verdict: KEEP, split.** Extract the 59 closed bullets to the Diary; move lines 1–77 to the docs
that own them. **493 → ~200 lines.** ⛔ **Not shareable as-is** — 82 warning glyphs per 100 lines
reads as a project in crisis.

## Q5 — Cross-reference integrity: three pointer forms, radically different health

**(a) Markdown links `[text](path.md)` — 104/104 resolve. ZERO dead.** Genuinely excellent.

**(b) Backtick path citations — 60.3% resolve as written; 5.4% absent anywhere.**

```bash
grep -ohE '`[A-Za-z0-9_/.\-]+\.md(:[0-9,\-]+)?' *.md | tr -d '`' | sed 's/:[0-9].*//;s#^/##' | sort -u
# 184 distinct cited paths:
#   111 (60.3%) exist AS WRITTEN
#    63 (34.2%) exist only under a different directory
#    10 ( 5.4%) exist nowhere
```

- **Shorthand (~57)** — a root doc citing `` `SURVEY.md` `` meaning the `cartograph/` copy.
  **`FEATURES.md`/`OPERATIONS.md`/`BACKLOG.md`/`ARCHITECTURE.md`/`NOTES.md` each exist in 3–7
  places**, so a bare basename is ambiguous even to an insider.
- ⛔ **Genuinely wrong (6)** — all six live in `cartograph/_archive/` but are cited from a root
  doc, so the path lands in the *wrong* archive. **Root has an `_archive/` and so does
  `cartograph/`** — the collision is structural.

The 10 absent, with citers: `ARBORIST-SLAB-WEIGHT.md` ← its own brief ·
`BRIEF-prevailing-direction-projection.md` ← **ROADMAP** · `BRIEF-through-road-edge-straight.md` ·
`BRIEF-tree-and-sky-embed.md` · `HANDOFF-boundary-trio.md` · `HANDOFF-hipointe-pour-step0.md` ·
`HANDOFF-ribbon-corners.md` · `INTEGRATION.md` · `MEMORY.md` (outside the repo) · 2 grep fragments.

**(c) Section anchors `§N` — 10/11 sampled resolve.** Miss: `cartograph/PREBAKE.md §2.5a`.

**Honest rate: 14 unresolvable of ~188 distinct pointers ≈ 7.4%. For markdown links, 0%.**

⭐ **The corpus has no doc-pointer check today.** 100% on markdown links is *discipline*, not
enforcement, and discipline does not survive a reduction pass:

```
# scratch/claims-doc-pointer-health.mjs — fails CI on:
#  (a) any markdown link OR backtick path that does not exist AS WRITTEN
#  (b) any cited path that is gitignored or untracked
#  (c) any cited § anchor with no matching heading
#  (d) any bare-basename citation whose basename exists in >1 directory
```

## Q6 — Register coverage: respected inside domains, absent at the root

```bash
find . -name 'FEATURES.md' -o -name 'OPERATIONS.md' | grep -v node_modules
# meteorologist/{OPERATIONS,FEATURES} · arborist/FEATURES · ls/{OPERATIONS,FEATURES} · cartograph/{OPERATIONS,FEATURES}
```

1. **No root `FEATURES.md` or `OPERATIONS.md`.** The kit as a whole has no capability register,
   so every cross-cutting capability (Slab format, Extent, the Pour, tenancy, instance identity)
   has nowhere to land. **That is precisely where doctrine scatters.**
2. ⚠️ **`arborist/` has `FEATURES.md` but no `OPERATIONS.md`** — while `README.md` states the
   rule as *"paired with it per domain."* **ASPIRATION class**, not rot: declared architecture,
   one of four pairs never built. **Surface as work; do not reconcile the README down.**
3. **Root doctrine scatters across five non-register homes** — NEIGHBORHOOD-INPUTS,
   INTAKE-CATALOGUE, ONBOARDING, TREE-INTAKE, PUBLISH all carry OPERATIONS material.
4. **The root is organized by artifact and episode, never by audience** — and audience is exactly
   what the FEATURES/OPERATIONS split encodes.

---

# PART 4 — External-sharing hazards (out of scope, reported anyway)

```bash
grep -lE '/Users/jacobhenderson|/Volumes/|supabase\.co|script\.google\.com|ANON_KEY' *.md
# README.md PUBLISH.md SECURITY.md THEWARD-ONLINE.md
```

- **`README.md` prints a live Supabase project URL and a live Google Apps Script `/exec`
  endpoint** as example `.env` values. The Apps Script URL is a callable production endpoint.
  **Replace with placeholders before sharing.**
- `PUBLISH.md` / `THEWARD-ONLINE.md` embed the owner's filesystem paths.
- `BUSINESS_LISTINGS.md` names 76 real local businesses. Decide deliberately whether that ships.

---

# PART 5 — ⚠️ The aspiration register

| Doc | The unbuilt thing, in its own words | Why it is at risk |
|---|---|---|
| `PROPOSAL-rubric-axes.md` | *"✅ APPROVED … Not yet executed: `arborist/rubric.json` is unchanged."* | Carries a ✅; a pruner sees a closed item. **Not on ROADMAP.** ⚠️ *Later measured as LANDED — see REPORT-05.* |
| `SALON-INTERFACE.md` | "in flight, 2026-06-25"; "Rubric-forward (**decided direction**)" | 9 weeks old; reads stale, is ratified |
| `SHOW-BIBLE.md` §0 | Cartograph=factory (licensable) · Slab=format · Consumers · API | **The commercial thesis of the company lives only here** |
| `README.md` "Architecture intent" | *"today many of these are hardwired into the LS runtime; ultimately they all route through the Slab"* | One sentence inside a 4KB line — trivially lost in a rewrite |
| `arborist/OPERATIONS.md` (absent) | README declares the pairing; arborist has none | An absence: nothing to delete, nothing to notice |
| `EXTENT-DESIGN.md §6` | The seal sequence / conform-a-town worklist | Several docs "cannot be brought to a settled state" until it lands |
| 4 abandoned briefs | terminal-node-sweep · pair-free-edge-anchor · ground-seam · excise-the-banners | **Decision records wearing brief clothing** |

---

# PART 6 — Disposition summary

```
KEEP  canon, externally shareable      12
KEEP  internal-only, never share        4   CLAUDE BOZ PIP AGENT-VALIDATION-SURFACES
KEEP  + ⚠️ ASPIRATION FLAG               3   SHOW-BIBLE SALON-INTERFACE PROPOSAL-rubric-axes
KEEP  live briefs                       2   BRIEF-freeze-the-curb  BRIEF-ls-bleed-excision
SPLIT canon+diary fused                 2   ROADMAP (→ ~200 lines) · README (→ 4 files)
MERGE                                   4   INTAKE-CATALOGUE→NEIGHBORHOOD-INPUTS ·
                                            SIEVE+LOOM+THROAT→one dated archived forensic
ARCHIVE-TO-DIARY                       19   18 superseded/abandoned + EXTENT-EXCAVATION
                                            AUDIT-MATRIX HIPOINTE-DEMUN-ROSTER DEPLOY-CHECKLIST
EXCISE                                  2   BRIEF-dead-end-mouth-junction · BUSINESS_LISTINGS
```

**Projected: 49 files / 11,697 lines → ~21 files / ~4,300 lines (−63%), zero decisions lost.**

## The three things to do before showing this repo to anyone

1. **Fix `README.md`'s first screen** — line 3 names the wrong product. Highest-leverage edit in the corpus.
2. **Evacuate the brief class from root** — 44% of the corpus, 91% of it dead. Extract the 4
   aspirations to ROADMAP, archive 18 dated, delete the 1 self-retired file.
3. **Ship two checks** — `claims-root-doc-hygiene.mjs` and `claims-doc-pointer-health.mjs`.
   Rules without forcing functions have already failed here.

**One caveat owed:** for `BRIEF-species-pipeline-adversarial.md` I could not establish whether
its work landed. **Cause not established**; treat as unclassified until someone who knows the arc
rules on it.
