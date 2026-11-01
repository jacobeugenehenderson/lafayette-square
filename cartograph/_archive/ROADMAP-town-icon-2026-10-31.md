# ROADMAP lines retired 2026-10-31 (BRIEF-a-town-has-one-icon)

Evicted when the instances' old-player branding was deleted and every town's icon became its baked Look's mark
(Jacob, 2026-10-31: "Get rid of the arch" · "All kit now" · "There is no Arch because that departs from the kit
convention"). Live home: `scripts/towns-record.mjs`, `src/lib/townIdentity.js#townIcon`, `cartograph/OPERATIONS.md`
(the share card). ▶ `node checks/claims-a-town-has-one-icon.mjs --mutants`

## From "Share and identity" (done)

- **`INSTANCE.branding.mark/markSvg/faviconUrl`**: delete at LS's cutover. Only the old LS player reads them (`townMark.js` header) Same cutover: the site Workers' `icon = t.faviconUrl || emojiIcon(t.mark)` HTMLRewriter path (`workers/{production,staging}-sites/src/index.js`) is already dead for every Ward page (the Ward sets its tab icon from the Look, theward `de6c5e9`) and only serves the old player.

## From the `claims-no-town-wears-another-towns-mark` entry (struck: overruled 2026-10-31)

Also recorded: HPDM's `markSvg: 'arch'` is its own authored choice (Jacob, 2026-09-25: *"LS and HPDM can keep the custom arch"*), not a bleed.

## The `claims-no-town-wears-another-towns-mark` entry (resolved 2026-10-31)

Jacob: "they're free to choose any emoji" (registry `r-a-town-may-choose-any-mark`). The check now fails only a mark a
town wears without authoring it (its baked `markAuthored` false) while another town wears it; mutation-tested both ways.

- **⛔ `checks/claims-no-town-wears-another-towns-mark.mjs` contradicts a ruling: it fails because HPDM and LS both author ⚜️** *(Jacob, 2026-10-04: "They're both in St. Louis, and anyway it's their prerogative")*. The defect is the INSTRUMENT (`CLAUDE.md` Layer 0 q3: never call the operator's authoring a defect). ⇒ the check must tell **inherited** (copied from the mould by a seed, the real bleed) from **authored** (a town's own choice, even when it matches another's), e.g. by the mark's provenance in the Look, and fail only on inheritance. ⛔ Not an exception list naming HPDM. Mutation-test both directions. XS–S.
