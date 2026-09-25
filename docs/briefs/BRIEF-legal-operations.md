# BRIEF — Legal & Compliance in Operations, Phase 1: the records and the coverage matrix

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-25
evict-when: Operations holds every existing legal document as a managed record and every jurisdiction as a managed object, and computes each Ward's coverage (Covered / Review / Uncovered) from the Ward's own configuration; Jacob has reviewed the matrix. Phases 2–3 get their own go.
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-25, and **Jacob dispatches.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.**

- **Where you work:** the Operations repo, `~/Desktop/dev.nosync/theward-operations` (operations.theward.online; its own `README.md` owns its facts: Access, Staff vs Host, the `records` + `audit` D1 model).
  - This product repo (`lafayette-square.nosync`) holds only this brief, the legal canon in `cary/legal/`, and the Ward-side declaration (below).
- ⛔ **Agents never write or edit legal wording.** Every document goes in **verbatim**, with its status as the author set it. New jurisdiction supplements are drafted by Jacob and counsel, **after** the matrix shows they're needed (spec §12).
- ⛔ **Deploys, migrations against `--remote`, and pushes happen only on Jacob's word**, in your window. Build and test against the local database (`npx wrangler dev`, `npm test`).
- ⛔ **No per-Ward hand-set status.** Coverage is **computed** from the Ward's configuration and the document records (spec §4, §10: "Status should derive from actual requirements rather than being manually assigned").

## The spec (Jacob's, 2026-09-25)

**Read it in full first:** `/Users/jacobhenderson/Desktop/Legal & Compliance Operations.pdf` (33 pp). It has two parts:
1. **Legal & Compliance Operations** (pp. 1–12): purpose, the document model, jurisdictions, coverage, launch gating, the Ward-level view, Host access, permissions, publication, the global dashboard, the layered architecture, and the initial implementation.
2. **The Host's Agreement**, a *Working Draft for Legal Review* (pp. 13–33), with its Host Schedule.

> *"Legal is global. Compliance is inherited locally."*

## Phase 1 (this brief): spec §12, and nothing further

1. **The document model** (spec §2), as a new `records` collection. Each record carries:
   - title and type;
   - audience and jurisdiction;
   - **applicability as data**: conditions on Ward config, such as all Wards, MA Wards, or Cary-enabled Wards;
   - version and effective date;
   - status (Draft / Review / Current / Superseded / Archived);
   - shareability, and publication status, as **separate** fields (spec §8).

   Every write goes through the existing `audit` log.
2. **Jurisdictions as managed objects** (spec §3). Start with MO · OH · CA · MA · NY · IL. ⭐ **A Ward in a jurisdiction that has no object yet creates the gap loudly** (spec §5: *"Illinois — Legal coverage incomplete"*). It is never silently absent.
3. **Enter the existing documents as records, verbatim, with provenance** (the source file and its commit):
   - the Cary legal canon in this repo's `cary/legal/`: `sender-agreement.md`, `courier-agreement.md`, `places-guardian-terms.md`, `rider-template.md`;
   - the live Missouri text, `src/instances/copy/legal/cary-missouri.jsx` (the courier and restaurant sections, and privacy);
   - the Host's Agreement + Host Schedule from the PDF, **as a Draft**.

   ⚠️ `cary/legal/README.md` states that the canon and the JSX are kept in lockstep **by hand** today. Record **both**, and report any difference between them as a finding. ⛔ Don't reconcile them.
4. **The coverage computation** (spec §4): per Ward, from its configuration:
   - jurisdiction, host, legal entity and domain;
   - enabled modules, Cary and commerce status, payment and courier operations;
   - launch date.

   The result is Covered / Review / Uncovered, **with the missing instrument named.** ⛔ A config field the Ward doesn't carry yet is reported as **unknown**, not assumed. List which fields Operations' `wards` records hold today, and which the spec needs that they don't.
5. **The coverage matrix** (spec §12), per jurisdiction:
   - universal coverage;
   - state-specific requirements;
   - existing and missing supplements;
   - Host agreement status;
   - Cary/commerce implications;
   - participant-document requirements.

   ⛔ **"State-specific requirements" is a question for counsel, not for you.** Where it isn't known, mark it **[U]**; don't research law into the matrix. `cary/legal/legal-readiness-brief.md` shows what a legal question looks like when it is *flagged* rather than answered.
6. **Tests** (the repo's `npm test`):
   - coverage is computed and never stored;
   - a new jurisdiction produces Uncovered;
   - enabling Cary on a Ward whose packet lacks Cary terms flips it to Review/Uncovered;
   - a Host sees only their own Wards' documents, and a non-shareable document is never offered as shareable.

**Stop after Phase 1** and show Jacob the matrix. Phase 2 (launch gating in the UI, the Ward-level Legal view, Host view and copy-link) and Phase 3 (publication: public Ward pages read the current published documents from Operations, the same pattern as the listings layer, `SECURITY.md` "The published listings layer") each need his go.

## The Ward side today (this repo): the interim, and what Phase 3 replaces

- An installation declares `legal.documents: 'cary-missouri'` in `src/instances/<map>.js`; LS and HPDM do.
- One that declares nothing renders "not declared", never another town's terms.
- ▶ `node checks/claims-installation-legal-is-declared.mjs`.
- `ROADMAP C1a` holds the OH/MA gap.

⛔ Don't change the Ward side in Phase 1.

## Security

Operations is a write path into production content (`SECURITY.md`, "The published listings layer"). Legal records add **restricted material**: executed contracts, counsel communications, drafts and internal notes (spec §8).
- Restricted documents must be unreachable by a Host unless the metadata permits it, **enforced on the server** (the Worker's `authorize`, `HOST_FIELDS` pattern), not hidden in the page.
- A test asserts it.
- ⛔ Nothing personal or privileged goes into any published or exported artifact.

## Coordination

- This repo is shared by several sessions. Commit here only this brief's state, and only your own paths.
- In `theward-operations`, commit only your own work.
- ⛔ No stash, reset, rebase or branch switch, in either repo.
