# The 2026-10-30 morning release — DONE (moved to the Diary 2026-10-30)

Shipped: PTown and HPDM promoted on Ward 4334c64 / kit 2a44e317 with compressed slabs, the overhead near (phone water), the place share card, one place per building, the docks; both Workers deployed; backups in scratch/promote-rollback/*-prod-20261030. The hand purges in steps 2 and 8 are RETIRED: the staging purge was a one-time migration (unchanged names whose stored encoding changed), and since groyne/reads-bypass-the-edge our own readers never read a cached copy (visitors read content names; .json is never cached; plain-key copies are max-age=300). Verbatim:

### ⭐⭐ MORNING RELEASE — 2026-10-30 (Boz). PTown stable for outreach. Run in this order; paste any refusal to Boz.
Merged on integration (head 2a44e317+): the overhead camera's near (phone water/seabed fix, 3a032bd5) · slab compression (br-5, 801fc795) ·
per-place share cards (1d7a0743) · PTown's tagline (64aa9fb3) · one place per building + Jacob's 17 (2a44e317). Commands from
`~/Desktop/lafayette-square.nosync/.claude/worktrees/integration` unless named.
1. **Publish each town's slab to staging** (every .bin/.glb re-uploads once, brotli): `! curl -s -X POST localhost:3333/looks/<id>/publish` for
   provincetown, huron, hipointedemun (the panel's "bakes first: coast" on PTown/Huron is the judge's re-run, a no-op; the direct POST skips it).
   PTown's content also re-bakes for the duplicates: Stage Bake on PTown first if its plan shows content (it asks nothing else).
2. **Purge the staging edge once, AFTER all publishes:** Cloudflare dashboard → zone theward.online → Caching → Configuration → Purge Cache →
   Custom Purge → Prefix → `assets.theward.online/staging/baked/` → Purge.
3. **Gate staging:** `! node scratch/slab-compressed-gate.mjs https://assets.theward.online/staging/ provincetown` (and huron, hipointedemun). Exit 0.
4. **Deploy the Workers** (each refuses if a town would go dark; they also ship the place share card):
   `! cd workers/staging-sites && npx wrangler deploy` then `! cd workers/production-sites && npx wrangler deploy`.
   ⛔ production-sites BEFORE any Promote (today's Worker would serve a brotli file unlabelled).
5. **The new player to staging:** Ward's pin 4334c64 on kit 2a44e317 (96e9b15 + a check-only fix; built; the reds are the standing six): `! cd ~/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit && node scripts/publish-kit-bundle.mjs`
   then `! cd ~/Desktop/dev.nosync/theward && npm run publish:staging`.
6. **⭐ JACOB'S PHONE on staging.theward.online/provincetown/:** Browse and Society water reads as water (no sand), the movie, a place link.
7. **The open production question, on a scratch key** (Groyne's C1–C4: does a .online zone decode br for a non-br client?): the commands are in
   Groyne's message to Boz, 2026-10-30. Run them, read the [gzip]/[identity] rows, and delete the key.
8. **Promote provincetown and hipointedemun:** back up first, `! node scratch/promote-rollback/backup-prod-slab.mjs --look=<id> --out=scratch/promote-rollback/<id>-prod-$(date +%Y%m%d) --list-from=public/baked`
   (it keeps production's manifest.json too: the only way back, since a Promote overwrites it; the script refuses on any mismatch);
   then `! curl -s -X POST localhost:3333/looks/<id>/promote`; then purge prefix `assets.theward.online/baked/`;
   then `! node scratch/slab-compressed-gate.mjs https://provincetown.online/ provincetown` (and hipointedemun). Exit 0.
9. **Re-time PTown:** `scratch/browse-perf/load.mjs` cold ×3 + a throttled run (before: 7.2–8.5 s desktop, 120.9 MB).
OPEN for Jacob: ✅ the MARINA DOCKS are DECIDED and MERGED (Jacob 2026-10-30, by eye on `scratch/docks-frames/`: water now, the dock
object later, floating docks ride the tide; rule (A1)); PTown's bake carries it. · the share image fixed vs time-of-day (it works as designed; send links by day) · hours (56/447) · the
preview-photo licence (parked) · a floating dock riding the tide · LS's cutover. In progress: Plumb on the marina docks drawn as treelawn.

