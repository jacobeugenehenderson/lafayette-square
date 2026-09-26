# BRIEF — Ward economics: the Host split and the Ward fund, in The Ask and The Split (Operations later)

<!-- BRIEF-STATE
status: OPEN — re-scoped 2026-09-25 to Jacob's ring design (below); phase 1's knob-panel approach rejected and parked on theward-online branch `ward-economics` (456c2cd, 17dc9e3); reuse its model + conservation check, not its page
dispatched: 2026-09-25, Tally — awaiting Jacob's go on the ring design
written: 2026-09-25
evict-when: The Ask and The Split model the 10% fund skim, the per-year reserve and the Host's overflow budget as scenario knobs, and Jacob has approved both; the Operations ledger (phase 3) gets its own go.
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-25, and **Jacob dispatches.** One agent, sequenced; **stop after each phase for Jacob.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.**

- **Where you work:** `~/Desktop/dev.nosync/theward-online`, the marketing site (`js/ask.js`, `js/split.js`, `works/ask/`, `works/split/`). Read its `README.md` first; it owns its rules.
  - ⛔ It is **public**: GitHub Pages deploys `main`. Commit on a branch; **push only on Jacob's word.**
  - Phase 3 is in `theward-operations`, and needs its own go.
- ⛔ **No framing copy.** Every number is a knob; add NO disclaimer, explanatory or "illustrative" text about the model (Jacob, 2026-09-25: *"The numbers/knobs are what they are, and it's up to me to present it."*). Labels name what a knob or readout is, nothing more.
- ⛔ **Never call the fund** an escrow, insurance, deposit, self-insurance, trust or restricted fund; no copy implies a legal or tax treatment. Jacob and counsel settle that (§5 of the reference).
- ⛔ **Agents write no legal or economic-promise wording** for the Host Agreement or any public covenant.

## The source, and Jacob's refinements (2026-09-25)

**Read in full:** `/Users/jacobhenderson/Desktop/The_Ward_Local_Economics_Operations_Reference.docx`, "model to test, not adopted".

**Jacob's refinements supersede the reference where they differ:**
- *"It ends up being more like 10/45/45 and if we keep it knob-oriented we can maintain a 'theoretical' posture … the slider defaults to 30%."*
- *"10% would come out off the top and go into the fund, up to $2500. That's rainy day for the whole company. Everything in the fund after that is for the Host to spend."*
- *"It is a building amount every year."*

**So the model is** (Jacob + Boz, 2026-09-25, superseding the reference's ever-growing till):
1. **Direct obligations first:** business money, tax, courier pay and tips, processing. These never become proceeds (reference §2).
2. **The skim:** **10%** (knob) of a Ward's distributable local proceeds goes into its **cushion**, at up to **$2,500 a year** (knob).
3. **The cushion builds to a target** (knob, default **$7,500**; a future option scales it with the Ward's activity). **Once it is at target, the whole skim overflows to the Host's budget** (the Ward Budget of the Host's Agreement §8).
4. **Claims** are paid from the **company pool** (every Ward's cushion together). A Ward is charged at most its own cushion; anything larger is the pool's, and real insurance sits above both. **After a claim, the cushion refills first** (still at no more than $2,500 a year), so the Host's budget **pauses**; it never resets to year one.
5. **The split:** the remaining 90% divides Host / platform. The Host-share slider **defaults to 30%** and ranges to at least 50%. Salary is a knob **defaulting to $0**.
6. **Interest** is conservative and principal-safe (Jacob: a savings-and-loan account) and never required for the model to work.

**Its real audience (Jacob): "This is a sneak recruiting tool for Hosts."** Build The Ask for a prospective Host modelling **their own** Ward: inputs they can estimate (households, businesses, orders per week), outputs that include the **Host budget**, the money to program their neighbourhood. That stays scenario-framed. The pages are **already public and linked**; Jacob presents them himself. The changes ship to the existing pages, on his word.

**Readouts** (reference §5), per year and per Ward, plus a portfolio view where useful:
- gross flow;
- direct obligations;
- the skim;
- cushion added this year, its balance and target;
- claims;
- the Host budget (overflow) added;
- distributable after the skim;
- Host earnings;
- platform earnings.

## ⭐ THE ASK'S DESIGN (Jacob, 2026-09-25 — supersedes phase 1's knob panel)

**One dominant object that explains the economics: a nested-ring model. The visualization IS the control.**
- **Outer ring = the Ward economy** (where transaction volume comes from): food/Cary, other local commerce, later other classes. **Centre:** total annual local commerce.
- **Inner ring = the Ward's proceeds and where they go:** the **Cushion · the Local Host · the Studio.** Local commerce → Ward proceeds → allocation.
- **The inner ring's boundaries are draggable.** They replace the Host-share / Cushion / Studio sliders. As a boundary moves, each section's size, percentage and dollars change together.
- **Hover/touch a section:** the centre shows its name, $ and %, with no big permanent legend.
- **Only a few real controls:** activity/scale · allocation (the ring itself) · time.
- **Time = small side-by-side SNAPSHOTS** of the same ring (Year 1 — Cushion $2,500 · Year 2 — $5,000 · Year 3 — $7,500 · Steady state — Cushion funded), not four interactive diagrams. They show the Cushion as an accumulating reserve, whose share goes elsewhere once funded.
- **Everything else is an Assumption** (processing rates, sales tax…): stated in an Assumptions disclosure, not a knob.
- **Distinct jobs:** The Split = what happens to a TRANSACTION (it keeps the detailed transaction controls); The Ask = what happens when Wards operate AT SCALE (it consumes The Split's economics rather than recreating its controls).

## The phases (stop after each)

1. **The Ask:** the model and knobs above, replacing the current salary-and-secondary-share assumptions (reference §4–5). One Ward is modelled (Jacob, 2026-09-25: "I don't think the small/busy is helpful"); the studio reading is that Ward × the number of Wards.
2. **The Split:**
   - the Host shown as its own recipient, never folded into "The Ward";
   - **one graphic that follows a dollar all the way through**: obligations → proceeds → the 10% skim → reserve / Host budget → the Host / platform split.
   - ⚠️ The per-year $2,500 is annual, not per order. Show order economics and the annual fund in **linked but separate** panels, or state the allocation method (reference §6).
3. **Operations** (`theward-operations`, its own go):
   - Ward economics records (share, skim %, reserve per year, effective date);
   - a fund ledger where **balances come from the entries, never hand-edited**;
   - claims and incidents;
   - a Host view;
   - a staff portfolio view;
   - controls: a Host can't alter the percentages, the ledger, or the reconciliation (reference §7).

## Checks

- A check that the page's arithmetic conserves money: the flows sum to gross, every destination is non-negative, and a knob change moves only what it should. Mutation-tested.
- The build and audit tools in the repo pass.

## Coordination

- Commit only your own work, and on a branch in `theward-online`.
- ⛔ No force-push; nothing to `main` without Jacob.
- Report to Boz.
