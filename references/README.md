# References — the kit's external standards and manuals

**Started 2026-09-23 at Jacob's request:** *"we will use them and as we expand they will continue to be germane."* The kit pours towns in **MO, OH, CA and MA** today. A highway is built to **its state's** design manual, so the kit's section values should come from the manual of the state the road is in, never from one national table.

**The registry is `registry.json`**: one entry per source, with its publisher, jurisdiction, URL, what it covers, and its **terms**. This file holds only the rules.

## The rules

1. **⛔ No agent reads a source until its `terms.aiUse` is `permitted`.** Someone checks the publisher's terms first, and records the date, the reviewer and a quote. `unchecked` means **do not read**.
   - The rule exists because of AASHTO's Green Book, which forbids *"the entry of AASHTO content into any AI tool"* (checked by Jacob, 2026-09-23).
2. **Cite the source the kit actually used.** A value drawn from a manual carries that source's `id` into the pour output. A value no one has cited is marked **[U]** and must never be presented as cited.
3. **Local copies stay out of git.** They go under `references/files/`, which is gitignored. The registry records the URL, the edition and where the local copy lives.
4. **Every entry declares a jurisdiction.** When a town is added, check that its state has a manual here.
5. **⛔ No finding whose AUTHORITY is AASHTO — however it arrives.** If a permitted source quotes, paraphrases or defers to AASHTO for a rule (*"AASHTO recommends…"*, *"per AASHTO…"*), that rule is not eligible: citing the permitted source would launder it. ⭐ **But a rule the permitted source asserts in its OWN voice stays eligible even if it cites AASHTO in support** (*"Lane width shall be 12 ft (see AASHTO)"* is the state's own standard). The test is whose authority the statement stands on, not whether AASHTO is mentioned. Record excluded passages on the source as `aashtoPassages`. *(Narrowed 2026-09-23 from "never record an AASHTO passage", which would have discarded legitimate state-manual standards.)*

## The database: three kinds of entry, one file

- **`sources`** — what exists: publisher, jurisdiction, **terms**, access, local copy.
- **`questions`** — what a design needs: the ask, who needs it, status **`open` / `answered` / `blocked`** (+ `blockedBy`), what was tried, where to look next.
- **`findings`** — an answer: the value, **the source id, the section, a verbatim quote**, the date, who found it. A finding may only cite a `permitted` source. `kind: "defers"` records that a source points elsewhere — a negative result is a result.

## Dispatching research

A research brief is one line: ***"Answer the open `references/` questions needed by <design>."*** The agent:
1. runs `node checks/claims-references-are-sound.mjs` — its bottom half is the **dispatch queue**;
2. reads **only `permitted` sources** (a source that is `unchecked` gets its terms looked up and brought to Jacob to approve — never read first);
3. writes a **finding** per answer (quote + section), sets the question's status, and lists what it tried when it cannot answer;
4. re-runs the check, which must pass, and commits `references/registry.json` by pathspec.

A design that uses a value carries the **finding id** into its output. A value with no finding is **[U]**.

## Codes first — and nothing is "preference" (Jacob, 2026-09-23)

> *"I would rather go by codes always… I'd still want to use the ones which STARTED from a legitimate place rather than some 'I just like a wide street' kind of judgement."*

Every value the kit draws is exactly one of:
- **finding** (`kind: value | rule | …`) — the code says so: permitted source + section + quote.
- **derived** (`kind: "derived"`) — started from one or more findings, then adjusted or interpolated **for the map**. ⛔ It MUST name `from` (the finding ids it started at — each ultimately a cited finding) and `derivation` (the stated step: *"scaled ×0.92 for legibility at map scale"*, *"interpolated between f-a and f-b"*). It cites no source of its own; its legitimacy is its ancestry.
- **[U]** — no code answers it yet. It stays on the dispatch queue. ⛔ **There is no un-anchored "house" value** — where no code speaks, the answer is [U], never taste.

## Status

▶ `node checks/claims-references-are-sound.mjs` — never a count written here.
