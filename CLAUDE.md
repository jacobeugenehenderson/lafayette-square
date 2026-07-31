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

### The two questions. Say the answers out loud before proposing anything.

1. **"What does this do for town #2?"** If the answer requires a human who has already looked at
   the specific street, it is not a fix — it is an instance patch wearing a method's clothes.
   ⛔ A **skip list**, an enumerated exception table, a per-street override, "I measured it on LS
   and it's better" — each fails this and each has shipped here before.
2. **"What happens when this is WRONG on a town nobody has inspected?"** The only acceptable
   answer is *it fails loudly*. ⛔ **NO FALLBACKS.** A fallback converts a failure into a
   plausible-looking success, and a plausible-looking success in a kit is the worst outcome there
   is — the operator sees a map and never learns it is wrong. Silence is the defect.

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

**The standing evidence that this is real, not rhetoric:** `measureModel.js` seeds street widths in
**every scene** from LS's `ribbons.json`, keyed by street NAME — so **24 Altadena streets silently
inherit St. Louis measurements** (incl. Allen Ave, Iowa Ave), and every town collides on the
auto-generated `motorway_link N`. Both Polish pours show **0** collisions, so the defect is
invisible in exactly the scenes you would reach for to prove the kit travels. That is what a
fallback costs. (Measured 2026-07-31; open — `ROADMAP` A-tier.)

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

## Keep it trimmed (when you touch a doc)
Once something is **subsumed/superseded** — or just older than ~the last couple of weeks of this full-time project — **trim it out of the active doc into the Diary** (`cartograph/_archive/`, dated). Active docs carry LIVE doctrine + open state only; the Diary is the verbose, rarely-read, deep-dive-only home. "RESOLVED, kept for context" left in place is the anti-pattern. Migrating a section includes **repointing refs to the live home** *(coordinator depth: `BOZ.md §3`, when you're Boz)*.

## Standup before code
After routing + reading the relevant canon, talk the plan through with Jacob (fresh eyes) before drafting/dispatching/editing *(coordinator depth: `BOZ.md §4`, when you're Boz)*. Read → align → then build.
