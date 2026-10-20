# BRIEF — a curbed nose has a source: answer the island-nose questions, and find manuals for the towns that have none

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-17
evict-when: RULING: the island-nose questions in references/registry.json are answered for each town's jurisdiction, or recorded as blocked with the route Jacob chose, and node checks/claims-references-are-sound.mjs passes.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to Boz.**

**The one line (`references/README.md`, "Dispatching research"):** *Answer the open `references/` questions needed by
the curbed nose.* Read `references/README.md` whole first. Its five rules bind everything below, rule 1 above all: no
source is read until its `terms.aiUse` is `permitted`.

## 1. Why (Jacob, 2026-10-17)

*"It's meant to be a real street; curbs and other built features don't come to sharp points."* Where a narrow block's
bands meet, the curb comes to a needle. That's the "nose" (Lath's work on `swale/flatten-paths-r1`; JH-1143 is the
instance Jacob saw). The fix rounds it once, inside `easeContour`. Where the nose sits and how it rounds must come from
the street-design references, not be invented.

**Ruled (Jacob, 2026-10-17): borrow with the label.** Until a town's own jurisdiction answers, the kit may use
another state's finding. It must carry its source and the words "borrowed for <state>" in the pour output, never
presented as that town's own. A borrowed value isn't silent, so it isn't a fallback.

## 2. What the registry already holds (read it, don't re-search it)

- **Answered, CA and MA only:** `f-caltrans-island-min-size` (curbed divisional island ≥ 4 ft × 20 ft; channelizing ≥
  50 sq ft), `f-massdot-island-min-size` (linear islands ≥ 2 ft wide; triangular ≥ 50 sq ft urban, one side ≥ 15 ft), and
  `f-caltrans-island-approach-nose` (approach-end offsets, 1:15 parabolic flare).
- **No permitted finding gives a nose RADIUS.** Lath files that question; answer it if a permitted source has it.
- **Already tried, and why it stopped. ⛔ Don't redo these; each needs Jacob's action, not research:**
  - MO: `modot-epg`. No terms found, and absence is not permission. Route: a written request to MoDOT
    (`q-state-manual-MO` is blocked).
  - OH: `odot-ld1`. Commercial reuse needs a waiver. Route: a written waiver request to ODOT
    (`q-state-manual-OH` is blocked).
  - National: `nacto-usdg`. Terms unread (403 to fetch); treat as not permitted.
  - AASHTO is prohibited outright, including anything that stands on AASHTO's authority (rule 5).

## 3. The work

1. **New candidates, LOCAL FIRST, terms first.** Jacob, 2026-10-17: *"look more locally."* A town's own streets are
   usually governed by its city, then its county, and only then the state, so search in that order for every town.
   Record each as a `source` with its terms checked (date, quote, URL).
   - Look for: the municipal street or public-works design standard, the subdivision regulations, standard detail
     drawings (the curb, island and median details), and the city's complete-streets guide.
   - Municipal codes are often hosted by a third party (Municode, American Legal, eCode360). Check the HOST's terms as
     well as the city's.
   - ⛔ Read nothing until Jacob approves its terms.
   - Provincetown too: the Town of Provincetown and Barnstable County, before MassDOT.
   - Jackson Heights: the **NYC DOT Street Design Manual** (and NYSDOT only if NYC defers to it).
   - LS and HPDM: the **City of St. Louis** street standards. Also check whether HPDM's streets fall under University
     City or St. Louis County.
   - Huron: the **City of Huron** or Erie County standard, if one exists.
   - Federal sources already permitted (`fhwa-*`, `prowag-2023`, `mutcd-11r1`): check whether any states a nose radius
     or the end treatment of a raised island in its OWN voice.
2. **Bring Jacob one list:** each candidate, its terms as quoted, and your read of them. He approves or declines each.
3. **Extract from the approved sources by topic** (the README's "extraction first"): every normative statement on
   island ends, noses, minimum curbed width and nose radius, each a finding with source, section and verbatim quote.
   Answer the questions they settle. Record what you tried for the ones they don't.
4. **Draft, don't send,** the two written requests (MoDOT, ODOT) for Jacob, if he wants them. Sending is his.
5. Run `node checks/claims-references-are-sound.mjs`; it must pass. Commit `references/registry.json` by pathspec.

## 4. Bounds

- Research and the registry only. No code: the nose build is Lath's, and it reads your findings.
- ⛔ Rule 1 is absolute. "Probably public domain" is not permitted. Bring it to Jacob.
- Commit by pathspec. "Reaches no register" unless a register changes. Write "not found" when nothing is found; a
  negative result is a result (`kind: "defers"`).

## 5. Done when

Every town the kit pours has an answer to "where does a curbed nose end, and how does it round", cited from its own
jurisdiction, borrowed with the label, or blocked with the route named. The registry check passes.
