# BRIEF — Domains in Operations: Namecheap registers, Cloudflare runs DNS, Operations sees it all

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-25
evict-when: every domain Jacob owns is a record in Operations, attached to its Ward or marked unassigned, and shows its live state (nameservers, DNS records, whether it answers), read from Cloudflare; Jacob has seen the list.
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-25, and **Jacob dispatches.**

## Who you are, and the bounds

**Name yourself: one word, your own.** **Agent: FRESH.**

- **Where you work:** `~/Desktop/dev.nosync/theward-operations` (its `README.md` owns Access, Staff vs Host and the `records` + `audit` model).
- ⛔⛔ **OUTWARD ACTIONS ARE JACOB'S, ONE AT A TIME:**
  - adding a zone to Cloudflare;
  - changing a domain's nameservers at Namecheap;
  - creating or changing any DNS record;
  - deploying the Worker.

  Propose each in his window and act only on his word. Reading is yours.
- ⛔ **Credentials never touch the repo or the page.** Cloudflare API tokens are **Wrangler secrets**:
  - a **read-only** token (Zone:Read, DNS:Read) for the sync;
  - any edit-scoped token is separate, created only when Jacob asks, and never stored in the Worker.

  Namecheap credentials stay on Jacob's machine.

## Jacob's rulings (2026-09-25)

- He has **just bought a batch of domains at Namecheap** and wants *"the initial connection between the DNS info and the Operations utility."*
- **Nameservers go to Cloudflare** (*"nameservers to Cloudflare, yes"*). Namecheap stays the **registrar**, and Cloudflare runs the **DNS**.
  - Why: Namecheap's API accepts calls only from whitelisted IPs, and a Worker's egress IPs change.
  - And a Ward served by The Ward on its own domain needs the zone on Cloudflare anyway.

## The work

1. **The list:**
   - Get the domains from Jacob. He can paste them, or export the list from Namecheap's dashboard.
   - A small **local** script using the Namecheap API is optional and LATER: it needs Jacob's API key and his Mac's IP whitelisted, and is only for registrar facts like expiry and auto-renew.
2. **Onboarding each domain to Cloudflare:** a per-domain checklist Jacob approves: add the zone → note Cloudflare's two nameservers → set them at Namecheap → wait for activation. Script what's safe to script, and prompt him for each outward step.
3. **In Operations:**
   - a domain record (or the Ward's existing `domain` / `aliases` / `records` fields, whichever the model already intends; read `src/index.js` first);
   - a **read-only sync from Cloudflare's API** (zone status, nameservers, DNS records);
   - attach each domain to its Ward or mark it **unassigned**.

   Show each domain's live state:
   - active, or pending nameservers;
   - its records;
   - whether it answers (the Worker already checks a published Ward's domain).

   A Host sees only their own Ward's domain; staff see all.
4. **Tests** (`npm test`):
   - the sync never writes to Cloudflare;
   - a Host can't see another Ward's domain;
   - no token value appears in any response or log.

**Stop after the list is in Operations and Jacob has seen it.** Pointing a domain at a live Ward is a later step, with its own go.

## Read first

- `theward-operations/README.md`;
- `src/index.js` (`HOST_FIELDS`, the Ward model, the published-site check);
- this repo's `SECURITY.md` (the Operations section);
- `PUBLISH.md` (staging vs production, `staging.theward.online/<map>/`).
