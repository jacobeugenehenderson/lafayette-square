# `host/` — what a Host is handed

⭐ **A Host is not a guardian.** A guardian claims one business and edits its own card. A **Host**
knows the whole town and corrects the *directory*: duplicates, dead listings, wrong URLs, successive
tenants. ⛔ A business owner will never delete a competitor's stale listing, so the guardian channel
structurally cannot produce these corrections — which is why this folder exists (`ROADMAP` H-28).

Two files per town, and they are the same job from two sides:

| file | what it is |
|---|---|
| `<scene>/contact-sheet.html` | **what the town looks like.** Every listing in the order a visitor meets them, photographs loaded live from wherever they are published. Open it in a browser. |
| `<scene>/worklist.md` | **what to ask about.** The places whose existence or identity is in doubt, the ones a researcher hedged, and the records that are mis-labelled. |

⛔ **Both are DERIVED. Regenerate, never hand-edit** — a hand-edit is a fact with no source, and the
next pour overwrites it. Corrections belong in `cartograph/data/<scene>/content/listings.overrides.json`,
where they are reviewable in git and survive a fresh intake.

▶ `node cartograph/contact-sheet.mjs --scene=<scene>`
▶ the worklist is written by the research merge (`scratch/merge-research-tiered.mjs`).

⭐ **The contact sheet is a CHECK as well as a view.** It references photo URLs exactly as the product
does and rehosts nothing, so a dead link, a hotlink block or a wrong-building image shows up as a
broken tile the moment the page opens. A URL we cannot render is not evidence of anything.
