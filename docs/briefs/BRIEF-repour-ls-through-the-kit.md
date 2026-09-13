# BRIEF — re-pour Lafayette Square through the kit

> ## ⛔ NOT NOW. NOT THIS WEEK.
> Drafted 2026-09-13 while Jacob was heading out of town, at his request, **to be read when he is back**. ⛔ Do not start this, do not "get a head start on the safe parts," and do not dispatch it. **Step 1 is Jacob's hands on the Extent tool**; nothing downstream is real until that happens. Boz drafted; **Jacob dispatches.**

---

## Why

Instance #1 was not built by the kit. Measured, not asserted — re-derive before building:

| | seal (`identity-registry.json`) | `content/` | bespoke render ledger |
|---|---|---|---|
| `lafayette-square` | **absent** | **absent** | `buildings.json` — **only scene with one** |
| `hipointe-demun` | present | present | — |
| `altadena` | absent | present | — |

⭐ **That is the strongest argument against the kit claim, and it is on the flagship town.** It is also plausibly upstream of several open tickets — the seven live `scene === 'lafayette-square'` conditionals in the bake, `A20`'s *"only LS has a frozen ①"*, `A11`'s authoring bleed. ⛔ *Plausibly* — **cause not established.** Do not restate that as fact; if the re-pour closes them, measure it and say so then.

---

## ⭐⭐ THE RULING THAT UNBLOCKS THIS — read it before Layer 0 stops you

**Jacob, 2026-09-13, on the 79 authored block widths and 3 material flips in `public/looks/lafayette-square/design.json`:**

> *"I just really don't care. The new skeleton and protopolygon render a lot of those previous 'workarounds' irrelevant."*

⛔ **A re-pour will not carry that authoring, and that is accepted.** The key is `skelId | side | segOrd` and it is **positional** (`EXTENT-DESIGN §4.1` — open, parity does not pass); a re-fetch may re-digitize, so the ordinals move. Production and staging already share only **4 of 27** street ids for exactly this reason.

⭐ **This is the one case where dropping operator authoring is licensed, because the operator licensed it.** `CLAUDE.md` Layer 0 Q3 protects authoring from *an agent* calling it a defect. It does not stop Jacob retiring his own work. ⛔ **Do not stall this brief on Q3, and do not build a migration to "rescue" the widths** — that was considered and declined.

⚠️ **Said once, then dropped:** Park Avenue (10 blocks, 7.54–10.76 m) and Mississippi (5.12–11.30 m) are in that set, and both are the canon's worked examples of *genuine* historical width. 16 of 26 streets vary block to block. Jacob has been told and has ruled. **Re-authoring is expected work after the pour, not a loss to prevent.**

---

## The bounds

⛔ **Keep the scene id `lafayette-square`.** Do not migrate to `lafayette-square-staging` — it is 116 tiles baked 2026-08-01 and predates the whole ① arc. The id carries the production URL, `src/instance.js`, the R2 slab prefix and `looks/index.json`; moving it buys nothing and moves all of that too.

⛔ **Nothing is deleted.** The old scene's files come out of the index with `git rm --cached`, never `rm` — same non-destructive retirement as the Polish scenes. ⛔ Never `filter-repo`.

⛔ **Not a pipeline change.** If the pour needs the pipeline edited to succeed, **that is the finding** — surface it rather than patching around it. A town that only pours with a hand-edit is the defect this brief exists to expose.

---

## The work

1. **Jacob frames and seals.** `◎ Extent` → search → SOFT fetch → author the boundary → HARD fetch = the seal → Bake. ⛔ **Eye-gated; no agent does this step.** The seal is what mints `identity-registry.json`, which LS has never had.
2. **Carry building identity.** The registry is the mechanism (`EXTENT-DESIGN §4`, R18 — *a re-fetch must preserve it*). Reconcile the old `buildings.json` render ledger against the new ids, then retire the ledger and the `scene === 'lafayette-square'` conditional that reads it.
3. **Build the content layer.** LS has no `content/` at all. HPDM's is the shape to copy.
4. **Re-author.** Widths and swaps, on the new skeleton. Jacob's hands. ⭐ Worth doing after `A17` is understood, not before — these are the flips that ticket says do not reliably take.
5. **Retire the hardwires the pour makes unnecessary**, one at a time, each with its own before/after. ⛔ Do not pre-declare the set; `git grep -n "'lafayette-square'" -- cartograph src` is the live list.

---

## Acceptance

1. **`lafayette-square` has a seal and a `content/`**, and its input set matches what a kit town tracks — `git ls-files cartograph/data/lafayette-square` against `…/hipointe-demun`, same shape.
2. **The count of `scene === 'lafayette-square'` conditionals in product code goes DOWN**, and the brief names which ones and why. ⛔ It must not go up.
3. **The pour used no hand-edited pipeline step.** If it did, that is the report.
4. **Jacob's eye on the render** — the only gate that closes this. ⛔ Record the scene the verdict was taken on (`[[feedback_an_eye_verdict_must_record_the_scene]]`); a full day was lost to exactly that confusion on 2026-08-06.

---

## Registers

`cartograph/OPERATIONS.md` (the pour runbook gains its real worked example) · `FEATURES.md` if the hardwire retirements change what the kit can claim. Commit message names the register, or says "reaches no register."

▶ Related and **not** prerequisites any more, given the ruling above: carrying OSM node ids through `fetch.js` (`EXTENT-DESIGN §4.1`, *"own ticket"* — makes the key exact rather than positional, so *future* towns re-pour without losing authoring) · `_archive/BRIEF-scene-inputs-are-not-committed-LANDED-2026-09-13.md`.
