# BRIEF: a town has one icon (the kit)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-31
evict-when: node checks/claims-a-town-has-one-icon.mjs --mutants
-->

**Owner:** Boz. **Reviewer:** Zob (co-signs your plan before code). **Repo:** the kit, branch off
`integration/2026-10-20` in `.claude/worktrees/`. The Ward is Ward's: anything there goes through Boz to Ward.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.** Small and self-contained; no live window holds it.

## 0. The defect, and the ruling

**Measured by Ward (2026-10-31, curl, cache-busted):** the HTML served on lafayettesquare.online and hipointedemun.online
carries `<link rel="icon" href="https://lafayette-square.com/favicon.svg">`. Since LS's cutover, that 301s to
`lafayettesquare.online/favicon.svg`, which is a **404**. provincetown.online's tag is a `data:` SVG (🦞) and works.

**Ruling (Jacob, 2026-10-31): "Get rid of the arch."** A town's icon is its Look's `identity.mark` (the 10-07 ruling: "the
identity emoji is the favicon"). LS's becomes ⚜️, which the Ward already shows after boot.

## 1. What the code says (Ward, read in source; ⛔ confirm each by symbol before you plan, and stop if it's wrong)

- **The static tag** comes from the serving Worker's `towns.json` `faviconUrl`, which `scripts/publish-player-to-staging.mjs`
  writes from `INSTANCE.branding.faviconUrl`. LS and HPDM name the .com arch file; PTown has none, so its tag is built
  from the mark. *(Ward inferred the Worker side by the tag's shape and hasn't read the Worker's code; read it.)*
- **The Ward** (`theward src/town/favicon.js#applyFavicon`) overwrites the tag at boot with `identity.mark` as a `data:` URI.
  So the 404 bites the first instant, crawlers and share previews.
- **The kit's old reader:** `src/lib/townMark.js#applyTownBranding` ("an explicit faviconUrl wins"). Its own comment files
  the deletion of `branding.faviconUrl` / `markSvg` / `mark` as due at LS's cutover. LS has cut over.

## 2. The job

1. `towns.json`'s icon is **derived from the town's Look `identity.mark`**, as a `data:` URI: one source, no hosted file,
   no cross-domain URL. A town with no mark gets the Ward's stated default (its initial, as `favicon.js#iconFor` does),
   stated, never a silent 404.
2. **Delete** the instances' old-player branding (`faviconUrl`, `markSvg`, `mark`, the "UNTIL CUTOVER" lines) and
   `townMark.js`'s reader, or whatever of it only that branding feeds. Say what you removed. If a live reader still needs
   one, stop and report.
3. The arch file (`public/favicon.svg`): delete it if nothing reads it after (2) (grep); otherwise name the reader.
4. **The check** `checks/claims-a-town-has-one-icon.mjs --mutants`: every registered town's icon in what publish writes
   is a `data:` URI from its OWN Look, never a URL and never another town's. Mutants: a URL back · another town's mark ·
   the instance branding restored as a source. Register it in `checks/TIERS.json`.

## 3. Bounds

- Write: the instances' branding lines, `scripts/publish-player-to-staging.mjs`, `src/lib/townMark.js`, the check,
  `checks/TIERS.json`, `cartograph/OPERATIONS.md` (one line: where a town's icon comes from).
- ⛔ No publish, no Promote. Rewriting `towns.json` on staging is a press, and it's Jacob's. **Establish (read, don't
  press) how `towns.json` reaches the production hosts** (does Promote copy it, or does the prod Worker read staging's?)
  and say so in the commit.
- Commit with `git commit -- <paths>` only. Surface scope drift to Boz; don't absorb it.

## 4. Done

Zob's PASS → Boz merges after `node checks/tier.mjs --check` → the staging publish and its route to production on Jacob's
press → the four hosts' served tags re-measured → this brief retires to `cartograph/_archive/` dated.
