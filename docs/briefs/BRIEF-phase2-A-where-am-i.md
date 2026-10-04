# BRIEF — Phase 2 · A: "Where am I" has one authority (map, Look, shot)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: Stage opens from a URL naming map, Look and shot; entering on a slab older than the Look says so and offers the bake; one resolver answers "which town is this page"; no LS-name gate in Stage's camera code; claims-a-stage-entry-knows-its-slab-age is green and mutation-tested; Jacob has opened Stage from a link
-->

**Boz drafted this 2026-10-04 from Thread's continuity map; Jacob dispatches.** Phase 2, tranche 2, package **A**. It runs in
parallel with **C** and **D**. **B** (camera and framing) starts after A lands, because both touch Stage's camera code.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- Edit what this brief names, in the kit only. ⛔ No pours or bakes; run `node scripts/bake-in-flight.mjs` before saving anything
  the dev servers import (Jacob bakes often). Ports are canonical: kit 5173, Ward 5180. No new servers.
- Commit only your own paths, by name. ⛔ No stash, reset, rebase or branch switch. Packages C and D are live in the same checkout:
  `ListAgents`, and `SendMessage` before touching a file outside your list.
- **Every fix is three parts** (`CLAUDE.md`): the code works and its predecessor is GONE; the register it reaches is written
  (`cartograph/OPERATIONS.md` for the URL, at least); superseded prose goes to the Diary. The commit names the register, or says
  "reaches no register".

## Read first

1. **The spec**: `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`, the verbatim Phase 2 text at its end. Sections **Stage** and **Camera /
   Framing**. ⭐ *"Ensure standalone Stage and Stage inside Cartograph operate against the same state/runtime."*
2. **The map**: `scratch/runtime-continuity/MAP.md` **§1** (Designer → Stage rows), **§2** duplicate authority 2, **§5** (the Stage
   URL, traced). Its rows are your premises: confirm each against the code and say what you found **before** building.

## The work (each a row of the map)

1. **Stage by URL.** The address names the map, the Look and the shot (e.g. `?scene=&look=&shot=`). Today map and Look already come
   from the URL (`useCartographStore`: `?scene=` › `cartograph-scene`; `?look=` › `cartograph-active-look`; a disagreement is refused
   loudly, `checks/claims-a-look-link-opens-that-town.mjs`). **The shot comes only from localStorage `cartograph-shot`, and every
   Stage shot collapses to Hero on reload** (the `shot` initializer, `isStageShot(saved) → 'hero'`). ⇒ the shot joins the URL, and
   the URL reflects the current map/Look/shot as you move, so a copied link reopens where you were.
2. **Entering on a stale slab says so.** Today `bakeStale = !entry.bakedAt` (`_loadLooks`): "ever baked", not "baked since the last
   edit". Nothing compares the Look's last authoring time with `bakedAt`, and the index's `updatedAt` doesn't cover overlay or
   skeleton edits (map §5; cause not established). ⇒ Stage knows the slab's age against **every** authoring input the bake reads
   (the bake route already computes exactly this for its re-pour decision: `serve.js` bake route, `runIfDirty`, `codeRead`/`dataRead`;
   ⭐ **reuse it, don't build a second staleness model**), and says so loudly, offering the bake. ⛔ Never draw stale silently.
3. **One resolver for "which town is this page."** `instance.js#readLookParam` (its authoring branch, `meta ward-authoring`) and the
   store's `scene`/`activeLookId` both answer it; `CartographApp` reconciles them by **reloading the page** (`setScene`). Preview
   parses `?look=` a third time (`PreviewApp#resolvePreviewLookId`). ⇒ the store's map/Look/shot triple is the one authority for the
   authoring page; the other parsers read it or go. ⚠️ Package C shrinks `instance.js` to exactly this job: **coordinate with C**
   before editing `instance.js`.
4. **Remove the LS-name gate** in Stage's Browse branch: `mapKey !== 'lafayette-square'` (`CartographApp#CameraRig`). A poured town
   with no boundary loaded falls through to LS's poses (map §2, silent substitutions). ⛔ Not a better gate: no town name in the
   decision.

## The chain

- **Trusts:** the looks index (`public/looks/index.json`), the bake route's read-records (`bake-reads.json`, `map.json#codeRead`
  etc.), the store's hydrate.
- **Trusted by:** **B** (it builds on the shot state you make authoritative), Preview's "← Stage" link, every operator link.

## Can the instrument see it?

`claims-a-stage-entry-knows-its-slab-age` (proposed in map §7 #4): the Stage load path compares the Look's authoring inputs with the
slab's bake. ⭐ Mutation-test it: make an input newer than the slab, and the check must go red. A URL round trip (open a link, move,
copy, reopen) is the live test, on the running kit at :5173, in Stage itself. ⛔ No parallel harness.

## Deliverable

The four rows above, each with its check or live proof; the OPERATIONS entry for the Stage URL; the rot fixed where you touch it
(`runBake`'s comment says `'browse'`, the code passes `'hero'`). **Read the spec, the map rows and the code, tell Jacob what you
found, then build. If the code contradicts this brief, stop and flag him.**
