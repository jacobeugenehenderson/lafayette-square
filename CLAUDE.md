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
   > ### ⭐⭐⭐ THE SHARPENED FORM, AND IT IS THE ONE THAT KEEPS FAILING *(Jacob, 2026-08-11, enraged — and right)*
   > **A DIFFERENCE BETWEEN BLOCKS IS THE PRODUCT. IT IS NEVER, BY ITSELF, EVIDENCE OF A BUG.**
   > `SURVEY §4` / `ORIENTATION` step 4, verbatim: ***"A single block may change width several times
   > across its span — LS is historical and idiosyncratic, and this is what the authoring tools are FOR."***
   > ⛔ So *"adjacent blocks have different widths"* · *"half the override slots don't resolve"* ·
   > *"the change stops partway along the street"* are **descriptions of a working product.**
   > ⭐⭐ **AND THE TRAP THAT CAUGHT ME: I USED *SYMMETRY* AS EVIDENCE OF A MECHANICAL WRITE** — *"it stops
   > on both sides at the same place, a human drag wouldn't do that."* **A street's width changes AT A
   > CROSS-STREET, on both sides at once, because that is where blocks end.** The very shape I called
   > suspicious is the expected one. **Before calling a write partial, ask what the map looks like if it
   > is CORRECT — and if the answer is "exactly this," there is no finding.**
   > **Instance, 2026-08-11:** Boz measured Park Avenue's per-block `pavementHW`, found the west stretch
   > widened and the east at default, and reported it to Jacob twice as a probable authoring bug —
   > *"a curb kink, the write not the geometry."* **Park Avenue is genuinely different widths on different
   > blocks. Jacob had said so, the canon says so, and the map on his screen was the most correct it has
   > ever been.** ⛔ **The cost is not the wrong claim — it is that the day went into probing something
   > already worked out, while the real defects (`A0`'s endcaps, chain artifacting) waited.**
   **The three earlier instances, all on 2026-07-31, all reported as damage:** `litmus-curb-parallel` ran
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

**The standing evidence that this is real, not rhetoric — `POLYGON-FIRST §2.1` Check A, measured
2026-07-31, OPEN and verified still open 2026-08-06:** the kit's whole premise is *"let the machine
catch the bugs — that checker is the real prize"* (`ORIENTATION`). **Our flagship curb checker is
blind in both of Layer 0's failure modes at once.** `cartograph/litmus-curb-parallel.mjs:77` passes
**`blockCustoms: null`** — it runs with **authoring switched off** — so it compares an *authored* curb
against the *un-authored* width and reports **the operator's own decision as a defect**. Mississippi
Avenue: authored half-width 8.70 m, curb at 8.70 m, dead parallel — scored a **3.13 m bow**. ⭐ That
is **question 3 committed by an instrument**, and it fails *worst on the most heavily authored town
and cleanest on a fresh pour* — blind exactly where the map is most worked-on. And `:86` —
`if (!tile?.iA?.length) continue` — **silently skips a tile with no curb ring at all**, so *"this
block has no curb"* prints as *"bows 3.9 m."* ⭐ That is **question 2**: a silent substitution inside
the one place it must never happen — the detector itself. *(The fix is not a better threshold: run it
**with** the scene's `blockCustoms`, and report an absent/degenerate ring as its own **loud** failure
class. Until then Check A's aggregate is not evidence of anything.)*

> *Receipt re-armed 2026-08-06, twice over. This slot cited `measureModel.js` bleeding LS widths into
> every scene — **fixed 2026-07-31 (`08d61ce1`)**; it was then re-armed with A07's two-producer
> disclosure — **which landed 2026-08-04** (`producer` + `producerReason` are stamped on every tile,
> `tileGround.js:3749`; the census prints per pour; the *"Falling back to legacy is never a
> regression"* comment is gone). Both times the text sat here claiming OPEN what was closed — the gate
> doc proving its own doctrine with an expired receipt, **including the line numbers, which had all
> drifted.** ⭐ **When you close a fallback, come back and re-arm this slot with a live one — and
> RE-VERIFY the receipt in the code before you trust it.** A doctrine whose evidence doesn't check out
> teaches agents to stop trusting the first read, which is the adherence we can least afford to lose.*

---

## Before you diagnose, run a forensic, or edit ANY topic — ROUTE FIRST

> ⛔ **Fires on EVERY topic you engage — including one that surfaces mid-session or feels like Jacob redirecting you.** A felt "new topic" is most often *you drifting off the plan*, not a real change of plan: route to the canon FIRST and it pulls you back. (2026-06-13 — the session "changed topics" repeatedly; every time, *"is this chains again?"* showed it was the **same** plan — a return, not a redirect — and the day was lost patching downstream before re-routing.) When the topic shifts, you do **not** skip the route; you re-run it for the new topic before touching anything. **Documentation first, every time, period.**
>
> ### ⛔⛔ A MEASUREMENT IS A TOPIC. **EVERY question asks the docs FIRST** *(Jacob, 2026-08-09)*
> **The hole this closes: a fresh finding in hand does not FEEL like a new topic — it feels like continuing — so the gate above never fires, and you reason forward from the number instead of routing.** ⭐ **That is exactly when routing matters most, because a measurement is precisely the thing the canon can already explain.**
> **⇒ Before you interpret a result, size a class, or name a consequence: route it. The finding is the topic.**
> *Receipt — one coordinator, one day, four times, having read this gate that morning:* **(1)** sized the mint class from source without reading `SURVEY` — which says *"the curb is the last unfrozen polygon"* · **(2)** claimed the offset path keeps provenance after reading its loop and not its return · **(3)** called a raw cross-scene count a portability finding, unnormalised · **(4)** wrote *"③ is downstream of `A3`"* when `WALL §1` says **freezing wrong data is worse than not freezing** and `§5` prints the opposite order. **Every one was already answered in a doc, and #4's root had been diagnosed to the line on 2026-06-14 and left unfixed for want of anyone routing to it.** ⭐ **The cost is not the wrong claim — it is that a claim from a high-context seat sounds like recall** (`BOZ.md §0`), so Jacob has to re-teach the premise instead of doing the work.

0. **Orient first — the curriculum, in this order.** `ORIENTATION.md` (root) is the **universal first read**: what we're building · the dependency chain · the settled doctrine in plain language. It's the *mental model* every other doc hangs off — skip it and you re-derive what we've already settled. **The one canonical reading order is: `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon.** (One path — not competing front doors. `BOZ.md` is the coordinator's doc, summoned only when you're Boz; it is not a step here.)
1. **Open the front door.** Repo-root `README.md §⭐ START HERE` (settled-state, by topic) + its **cross-cutting feature index** ("where does X live"). Find your topic → it names the **home doc + the one-line conclusion + the existing forensic.**
2. ### ⛔⛔ **READ THE DOCS *AND* THE CODE FOR THE TASK — BOTH, BEFORE YOU FORM A PLAN.** *(Jacob, 2026-08-11, after an agent burned a session on a brief whose premise nobody had confirmed.)*
   **Read the cited canon to the section**, *and* **open the code sites it names.** Rebuilding the model from grep + first-principles when the canon already spells it out is *the* recurring, expensive failure — and taking the canon's word for what the code does is the **other half of the same failure**. A hard gate, not advice.
   - ⭐ **A BRIEF'S PREMISES ARE CLAIMS, NOT FACTS — and so are a doc's.** Your first act is to confirm them against the source and **say what you found**, before building anything. ⛔ If the code contradicts the brief or the canon, **STOP AND FLAG IT** — that is the work, not an interruption of it. *(This has already saved us twice: the gate that could not see its own cure, and the miter clamp that was algebraically dead — `BOZ.md §3`. Both times the agent caught it and the doc treated it as luck.)*
   - **Counts, greps, "this shipped," "it's not skeleton" — check the code and the lit app, never memory alone.** Code drifts faster than docs, docs faster than memory. ⛔ **Absence is a claim too:** *"X doesn't exist"* needs a grep, and in this repo it is usually wrong — the thing is demoted, gated, or described by a stale line. **Proxy renders mislead on this map; the operator's eye is the gate** (`feedback_proxy_render_is_not_the_operator_eye`).
3. **Reuse forensics — never re-derive.** If a harness or forensic exists for the symptom, run/read it instead of building a new one (`scratch/` holds 200+; the studies are `*-FORENSIC.md`, the `cartograph/_archive/` forensics, the `HANDOFF-*` ledgers).
4. **Name the layer before you fix.** SHAPE (the frozen polygon / curb — Survey · skeleton · prebake) vs FILL (the inward ped strokes — Section)? Ask **"is this chains again?"** (`PIPELINE §Wall`). A wrong *silhouette* is upstream; how the *ribbon bends* is Section. Patching the wrong layer is the recurring waste — confirm the layer, in the canon, before editing.

## Stay inside the project — no stray folders, no stray servers
> ⛔ **Hard rule, no exception without Jacob's explicit say-so.** Everything you create lives **inside `lafayette-square.nosync/`**. Do **not** create folders on the Desktop or anywhere outside the project — that clutter is Jacob's to clean and he shouldn't have to. Git worktrees go under **`.claude/worktrees/`**, never on the Desktop (the old sibling `lafayette-*` Desktop worktrees were removed 2026-07-13; don't reintroduce that pattern). Likewise, **do not spawn new local/dev servers** — reuse the running one; a new server is warranted only for the same reason a new folder is: Jacob authorized it or the task genuinely requires it (`feedback_do_not_spawn_new_dev_servers`). When in doubt on either, **ask first**.

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
