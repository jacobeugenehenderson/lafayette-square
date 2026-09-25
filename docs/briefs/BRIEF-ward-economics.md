# BRIEF — Ward economics: the Host split and the Ward fund, in The Ask and The Split (Operations later)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
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
- ⛔ **A scenario, never an offer.** Every number is a knob, the page says plainly that the figures are illustrative and not an offer, and no copy says "our split", "you will earn" or anything like it.
- ⛔ **Never call the fund** an escrow, insurance, deposit, self-insurance, trust or restricted fund; no copy implies a legal or tax treatment. Jacob and counsel settle that (§5 of the reference).
- ⛔ **Agents write no legal or economic-promise wording** for the Host Agreement or any public covenant.

## The source, and Jacob's refinements (2026-09-25)

**Read in full:** `/Users/jacobhenderson/Desktop/The_Ward_Local_Economics_Operations_Reference.docx`, "model to test, not adopted".

**Jacob's refinements supersede the reference where they differ:**
- *"It ends up being more like 10/45/45 and if we keep it knob-oriented we can maintain a 'theoretical' posture … the slider defaults to 30%."*
- *"10% would come out off the top and go into the fund, up to $2500. That's rainy day for the whole company. Everything in the fund after that is for the Host to spend."*
- *"It is a building amount every year."*

**So the model is:**
1. **Direct obligations first:** the business's money, tax, courier pay and tips, and processing. These never become proceeds (reference §2).
2. **The fund skim:** **10%** (knob) of each Ward's distributable local proceeds goes into its fund.
3. **The reserve:** **each year**, the first **$2,500** (knob) of that year's skim goes to the reserve, the company's rainy-day money, drawn on by claims. It **builds every year**; it isn't a cap on the balance. (Claims are a knob: a per-Ward or portfolio loss rate.)
4. **The Host budget:** each year, everything the skim adds beyond that year's $2,500 is the **Host's to spend**. This is the Ward Budget of the Host's Agreement §8.
5. **The split:** the remaining **90%** divides Host / platform. The Host-share slider **defaults to 30%** and ranges to at least 50%. Salary is a knob **defaulting to $0**.

**Readouts** (reference §5), per year and per Ward, plus a portfolio view where useful:
- gross flow;
- direct obligations;
- the skim;
- reserve added this year, and the reserve balance;
- claims;
- the Host budget added;
- distributable after the skim;
- Host earnings;
- platform earnings.

## The phases (stop after each)

1. **The Ask:** the model and knobs above, replacing the current salary-and-secondary-share assumptions (reference §4–5). Show a small Ward and a busy Ward side by side, because the flat per-year reserve weighs differently on each.
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
