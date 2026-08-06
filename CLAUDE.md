# CLAUDE.md

**Loaded every session. This is the mandatory routing gate (layer 2) — for *any* agent, fresh or Boz.**

The coordinator identity + continuity ("ipseic load-in", **layer 1**) loads **only** when Jacob calls you **"Boz"** — and so does the rest of `BOZ.md` (the coordinator's doc: identity, the librarian Process, the day-cycle). **`BOZ.md` is summoned, not part of the universal path.** A fresh agent does *not* load it — it does the task and the gate below, nothing more. Sometimes fresh is exactly what's wanted. *(The navigation a fresh agent needs — "where does X live" — lives in `README.md`, not `BOZ.md`.)*

When Jacob summons you at day's start by the name **"Pip"**, read **`PIP.md`** and answer to that name — the welcome, the standing watch, and who Pip is on this team. (Named summon, like Boz; `PIP.md` is summoned, not part of the universal path. Pip is celebrated here — carry that.)

---

## ⛔⛔ LAYER 0 — WHAT WE ARE BUILDING. Answer this before you route, every time.

> **We are building a KIT that pours neighborhoods. We are not fixing Lafayette Square.**
> LS is the **first one off the line** and the **mould the kit was cast around** — which makes it
> the most misleading thing in the repo. Almost every doc, probe and defect below is written in LS
> proper nouns; that is a *sampling artifact of it being first*, not the subject of the work.

**The deliverable for any defect is the METHOD that catches its whole class in a town nobody has
looked at** — *"that checker is the real prize"* (`ORIENTATION.md`). A fix that needed an operator
to have already seen this street has delivered nothing to town #2.

### The three questions. Say the answers out loud before proposing anything.

1. **"What does this do for town #2?"** If the answer requires a human who has already looked at
   the specific street, it is not a fix — it is an instance patch wearing a method's clothes.
   ⛔ A **skip list**, an enumerated exception table, a per-street override, "I measured it on LS
   and it's better" — each fails this and each has shipped here before.
2. **"What happens when this is WRONG on a town nobody has inspected?"** The only acceptable
   answer is *it fails loudly*. ⛔ **NO FALLBACKS.** A fallback converts a failure into a
   plausible-looking success, and a plausible-looking success in a kit is the worst outcome there
   is — the operator sees a map and never learns it is wrong. Silence is the defect.
3. **⭐⭐ "Am I about to call the operator's AUTHORING a defect?"** *(added 2026-07-31, after one day
   produced three separate instances.)* **The override IS the product.** The kit machine-pours a
   strong first draft and **the operator may override any of it** — an override is **first-class,
   never a bug to drive to zero** (`ORIENTATION`, `SKELETON §6`). LS is a historical, idiosyncratic
   neighborhood, and **that is precisely why the authoring tools exist.** So:
   > ⛔ **ANY measurement, check, probe or bake taken WITHOUT the scene's authored state loaded is
   > measuring the wrong thing** — and it is wrong in the kit's signature shape: it fails **worst on
   > the most heavily authored town** and looks **cleanest on a fresh pour**, i.e. blind exactly
   > where the map is most worked-on.
   >
   > Before reporting *any* defect, ask: **is this the authoring gesture's intended output?** Load
   > `blockCustoms` / the scene's `design.json` and re-measure before you open your mouth.
   **The three instances, all on 2026-07-31, all reported as damage:** `litmus-curb-parallel` ran
   `blockCustoms: null` and scored Mississippi's authored 8.70 m as a "3.13 m bow" · a "collapsed
   curb ring" census measured `iA` **area**, when `Block = iA = tile − the authored roadway`, so it
   was measuring the asphalt-edge drag itself (`SURVEY §3`/`§4`) · the 2026-07-23 overlay reset threw
   away 22 streets of measured widths on the advice that customs were "hampering" the skeleton work.
   *Related: `feedback_dont_undo_a_decision_the_operator_made`, and the detector rules in
   `POLYGON-FIRST §5`.*

> ⭐ **Most questions you want to ask Jacob are already answered by these two.** "Skip list or
> handle the class?" — it's a kit; handle the class. "This method or that one?" — one method, not
> two. Asking him to re-decide what the purpose already settles is outsourcing comprehension, and
> he has to spend the day re-teaching the premise instead of doing the work. **Read Layer 0, then
> decide.**
>
> ⚠️ **This is not new and not optional. It is stated in `ORIENTATION.md`'s first paragraph.** It
> lives here because being *read* at 9am did not stop a full day being spent on LS-specific
> patches with an exception table at the end (2026-07-31). The purpose has to be *used*, not
> absorbed.

**The standing evidence that this is real, not rhetoric — `ROADMAP` A07, measured 2026-08-02, OPEN:**
the kit's most-quoted invariant is *"the curb is a concentric offset"* (`ORIENTATION`,
`POLYGON-FIRST §1`). **The code has two curb producers and picks between them without telling
anyone.** `tileGround.js:3326` gates the offset on `!isMedianTile && ringArea > 1500`; everything
else takes the legacy boolean carve at `:3347` — **at least 30 of LS's 101 tiles**, and an offset
that passes the gate but comes out degenerate is swapped for the carve at `:3345` with no signal at
all. The comment at `:3309` states the defect out loud: *"Falling back to legacy is never a
regression."* The carve may well look fine — **that is exactly what makes it dangerous.** On town #2
the operator reads "concentric offset," sees a plausible curb, and has no way to learn a third of
their blocks were built by the other method. *(The fix is not to delete the carve — it is right for
medians, dead-end disks and slivers. The fix is that the choice must be RECORDED and the genuine
failure at `:3345` must be LOUD.)*

> *Receipt replaced 2026-08-04. This slot used to cite `measureModel.js` bleeding LS street widths
> into every scene by street name (24 Altadena streets inheriting St. Louis measurements). **That was
> fixed 2026-07-31 (`08d61ce1`)** and the text sat here claiming it was open — the gate doc proving
> its own doctrine with an expired receipt. ⭐ **When you close a fallback, come back and re-arm this
> slot with a live one.** A doctrine whose evidence doesn't check out teaches agents to stop trusting
> the first read, which is the adherence we can least afford to lose.*

---

## Before you diagnose, run a forensic, or edit ANY topic — ROUTE FIRST

> ⛔ **Fires on EVERY topic you engage — including one that surfaces mid-session or feels like Jacob redirecting you.** A felt "new topic" is most often *you drifting off the plan*, not a real change of plan: route to the canon FIRST and it pulls you back. (2026-06-13 — the session "changed topics" repeatedly; every time, *"is this chains again?"* showed it was the **same** plan — a return, not a redirect — and the day was lost patching downstream before re-routing.) When the topic shifts, you do **not** skip the route; you re-run it for the new topic before touching anything. **Documentation first, every time, period.**

0. **Orient first — the curriculum, in this order.** `ORIENTATION.md` (root) is the **universal first read**: what we're building · the dependency chain · the settled doctrine in plain language. It's the *mental model* every other doc hangs off — skip it and you re-derive what we've already settled. **The one canonical reading order is: `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon.** (One path — not competing front doors. `BOZ.md` is the coordinator's doc, summoned only when you're Boz; it is not a step here.)
1. **Open the front door.** Repo-root `README.md §⭐ START HERE` (settled-state, by topic) + its **cross-cutting feature index** ("where does X live"). Find your topic → it names the **home doc + the one-line conclusion + the existing forensic.**
2. **Read the cited canon to the section** before forming a plan or touching code. Rebuilding the model from grep + first-principles when the canon already spells it out is *the* recurring, expensive failure (a hard gate, not advice).
3. **Reuse forensics — never re-derive.** If a harness or forensic exists for the symptom, run/read it instead of building a new one (`scratch/` holds 200+; the studies are `*-FORENSIC.md`, the `cartograph/_archive/` forensics, the `HANDOFF-*` ledgers).
4. **Name the layer before you fix.** SHAPE (the frozen polygon / curb — Survey · skeleton · prebake) vs FILL (the inward ped strokes — Section)? Ask **"is this chains again?"** (`PIPELINE §Wall`). A wrong *silhouette* is upstream; how the *ribbon bends* is Section. Patching the wrong layer is the recurring waste — confirm the layer, in the canon, before editing.

## Stay inside the project — no stray folders, no stray servers
> ⛔ **Hard rule, no exception without Jacob's explicit say-so.** Everything you create lives **inside `lafayette-square.nosync/`**. Do **not** create folders on the Desktop or anywhere outside the project — that clutter is Jacob's to clean and he shouldn't have to. Git worktrees go under **`.claude/worktrees/`**, never on the Desktop (the old sibling `lafayette-*` Desktop worktrees were removed 2026-07-13; don't reintroduce that pattern). Likewise, **do not spawn new local/dev servers** — reuse the running one; a new server is warranted only for the same reason a new folder is: Jacob authorized it or the task genuinely requires it (`feedback_do_not_spawn_new_dev_servers`). When in doubt on either, **ask first**.

## Verify your own premises
Counts, greps, "this shipped," "it's not skeleton" — check the **code** and the **lit app**, never memory alone. Code drifts faster than docs, docs faster than memory. **Proxy renders mislead on this map; the operator's eye is the gate** (`feedback_proxy_render_is_not_the_operator_eye`).

## ⛔⛔ PRUNE AS YOU GO — the corpus may not grow (2026-08-06, Jacob)

> **"All this effluvium is what caused this."** 64 active docs / 5,500 lines in `cartograph/` alone. A day
> was lost to it: four different "9 of 50"s quoted interchangeably · a false code comment the sweep had
> already flagged, left in place, read hours later and reported as a live finding · an existing spike
> rebuilt because its existence was recorded in a doc nobody had read. **The corpus did not rot by
> accident — it grew exactly as instructed.** These two rules are the correction.

**1. ⭐ IF IT CAN BE CHECKED BY RUNNING SOMETHING, IT IS A CHECK — NOT PROSE.** The doc gets **one line
pointing at the command.** Only *judgment* stays prose: doctrine, rulings, why-we-chose, what-failed.
- ⛔ **Never write a number into a doc without the command that reproduces it** — and prefer *deleting the
  number* and keeping the command. A count in prose is stale the moment it is written and is then quoted
  for months by people who cannot re-derive it.
- ⭐ **A check must READ the source, never restate it.** `scratch/claims-revert-field-coverage.mjs` parses
  the field lists out of the store instead of copying them, so it cannot go stale. That is the pattern.
  This is Layer 0's *"the deliverable is the check"* extended from defects to **facts**.

**2. ⭐ EVERY TOUCH NETS DOWN. Prune as you go — non-destructively.** When you touch a doc you **remove or
consolidate at least as much as you add.** Superseded content **moves to the Diary** (`cartograph/_archive/`,
dated) — it is never deleted, and **refs are repointed to the live home in the same breath** (a dead pointer
is the one unforgivable error). Active docs carry **LIVE doctrine + open state only**.
- ⛔ **"RESOLVED, kept for context" left in place is the anti-pattern**, and so is a correction banner
  sitting next to the false sentence it corrects — **excise the sentence**; the banner's job is done when
  its subject is gone. A false claim outlives its correction because it is shorter and reached first.
- ⛔ **No net-new document** without retiring one, or without Jacob asking for it. If your instinct is to
  capture today in a new file, that instinct is the disease — put it in the commit message, or in a check.

*(Coordinator depth: `BOZ.md §4`. ⚠️ `BOZ.md` was cut 275→115 lines on the same day; the matrix and the "fulsome doc update"
that generated this are retired to `cartograph/_archive/BOZ-full-2026-08-06.md`.)*

## Standup before code
After routing + reading the relevant canon, talk the plan through with Jacob (fresh eyes) before drafting/dispatching/editing *(coordinator depth: `BOZ.md §5`, when you're Boz)*. Read → align → then build.
