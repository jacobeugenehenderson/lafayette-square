<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: a bake writes only to disk; Publish is the one gesture that uploads to staging (slab and player, bake-first if needed) and Promote the one that reaches production; each button names what is stale (slab · player · both) and a blocked button prints its reason on the panel, not only on hover; a failed upload fails Publish loudly; checks green and mutation-tested; Jacob has run bake → Publish → Promote on one town and called it truthful.
-->

# BRIEF — Publish is the upload; the buttons say what they ship

**Boz the Younger drafted this 2026-10-04; Jacob dispatches.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- `cartograph/serve.js` (the bake chain and the publish/promote endpoints), `src/preview/PreviewApp.jsx` (the panel), the
  upload scripts. ⛔ **No upload, Publish or Promote without Jacob's go in your window**: they reach real sites. Use `--dry-run`
  where a script has one. Ports 5173 / 5180; reuse the running servers. Commit only your paths.
- **Three-part fix.** Registers: `cartograph/OPERATIONS.md` ("THE UPLOAD — NOT A COMMIT", § Publish) · `cartograph/FEATURES.md`.
  `PUBLISH` if it describes the bake's upload.

## The ask (Jacob, 2026-10-04, verbatim)

*"Publish is available but Promote isn't; I guess it doesn't know it's got player updates. We should make the buttons and the
action more truthy; and anyway I don't think it makes sense to 'upload' at that step. If the operator turns things off or adjusts
the pyramid, that's supposed to be 'accepted' when they publish and promote. This one I just did seems extra for no reason."*

⇒ **Jacob's design:** a bake is local. What the operator adjusts in Preview (deployment toggles, the pyramid) is **accepted at
Publish**, and Publish is the upload to staging. Promote is production. ⛔ Do not argue it from the code; the code is what
**is**, he rules what **should be** (`docs/agents/BOZ.md §2`).

## What the code does today (read by Boz 2026-10-04; confirm)

- **The bake uploads.** `cartograph/serve.js:3188` runs `scripts/upload-baked-to-r2.mjs --env=staging` as the bake's last step,
  and a failed upload **fails the bake** (`:3196–3200`). ⭐ **Why it exists, and keep the protection:** the comment above it
  (`:3175–3184`) records that one bucket once served staging and prod at the same keys, so a pour reached the live site the
  instant it uploaded. The fix was *"A BAKE MAY ONLY EVER WRITE STAGING."* Moving the upload into Publish keeps that rule
  (a bake still never touches production) and moves "a failed upload is loud" into Publish with it.
- **Publish** (`PreviewApp.jsx:888`) ships slab **and** player; it rests ("Published to Staging") only when both are current
  (`stagingDone`, `:815`). Its label never says **which** is stale, so after a bake that already uploaded the slab it reads as
  uploading the same thing twice. `status.unbaked` already makes Publish bake first (`:881`).
- **Promote** (`PreviewApp.jsx:892`) is disabled by `prodBlocked = !status.sites?.prod?.url || status.sites?.prod?.legacy`
  (`:822`): **the town has no production address** (or is on legacy hosting). The reason is in a hover `title` only
  (`status.sites.prod.why`, built at `serve.js:254–261`). ⇒ Jacob read a greyed button as "it doesn't know it has player
  updates." That is the truthfulness defect in one picture. On Huron tonight it was most likely "no address" (not verified).
- Prod player state: `serve.js:3296–3306` (`prodPlayer.why`).
- Existing checks: `checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` ·
  `checks/claims-the-publish-button-can-say-it-is-done.mjs` · `checks/claims-the-slab-envs-do-not-collide.mjs`.

## The work. Stop and report after step 1.

1. **Confirm and map.** What exactly do Preview's adjustments write (deployment toggles, the pyramid tuner,
   `PreviewApp.jsx:451`), and does the slab Publish uploads carry them? Today a bake runs before them, so name every path where
   an adjustment could reach staging without a Publish, or a Publish could ship without it. Report to Jacob.
2. **The bake stops uploading.** Publish becomes the upload: bake-first if unbaked (as today), then slab + player to staging,
   loud on failure. The bake's `upload` step and its comment move, not duplicate (three-part fix part 1).
3. **Truthful buttons.** Each says what it will ship: *Publish slab · Publish player · Publish slab + player*, and rests when
   nothing is stale. A blocked Promote prints **why** on the panel (no address · legacy · staging not published yet · player not
   pinned), never hover-only.
4. **A check that a bake never uploads**, mutation-tested by restoring the call.

**Confirm-then-build:** read the code sites, tell Jacob what you found, and stop if the code contradicts this brief.
