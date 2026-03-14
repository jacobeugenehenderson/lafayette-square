# Cary — Project Brief (March 14, 2026)

## What's done

### Onboarding pipeline (complete)
- Two-tier system: **Deliver** (identity + agreement, free, 14+) and **Drive** (full TNC pipeline, ~$42, 18+)
- URLs: `/cary/deliver`, `/cary/drive`, `/cary/apply` (tier chooser)
- Multi-step wizard with progress bar, preview mode (`?preview=true`)
- Supabase schema: profiles, courier_profiles, verification_checks, onboarding_step state machine
- DB functions: `try_activate_courier()`, `get_onboarding_status()`, `suspend_expired_couriers()`
- Edge functions: onboarding orchestrator, credential-check cron
- Webhook handlers: Stripe Identity, Checkr background checks, Stripe Connect
- Auto-suspension on expired credentials, 30-day SMS reminders

### Courier dashboard (complete)
- Online/offline toggle with GPS tracking
- Request cards with accept button
- Live meter (time, distance, fare breakdown)
- Safety report system
- Real-time subscriptions (both courier and requester sides)

### Migration 005 applied to hosted Supabase

---

## What's next — in order

### 1. Get yourself through the pipeline
**Goal:** One working Deliver courier (you) and one working Drive courier (you).

- [ ] Set GitHub Secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from Supabase dashboard → Settings → API)
- [ ] Configure Twilio SMS in Supabase Auth (dashboard → Auth → Providers → Phone)
- [ ] Go to `/cary/deliver` on production, sign in with real phone, complete delivery onboarding
- [ ] Sign up for Checkr account (checkr.com) — get API key
- [ ] Set Checkr API key as Supabase secret (`CHECKR_API_KEY`)
- [ ] Set Stripe secret key as Supabase secret (`STRIPE_SECRET_KEY`)
- [ ] Deploy edge functions: `supabase functions deploy onboarding` and `supabase functions deploy credential-check`
- [ ] Go to `/cary/drive`, complete full pipeline (identity verification, background check, insurance, vehicle)

### 2. Build the delivery request flow
**Goal:** A resident can request a delivery from a Place on the map.

What to build:
- [ ] Add destination fields to `requests` table (destination address, unit number, or destination place_id)
- [ ] Add `order_total_cents` to requests (for calculating 20% delivery fee)
- [ ] Delivery request UI in PlaceCard: "Request delivery from [Place]" button
- [ ] Requester enters: what's being picked up, order total, destination
- [ ] Courier sees the request, accepts, picks up, delivers
- [ ] Completion logs the delivery to the ledger

### 3. Build the settlement ledger
**Goal:** Track what each restaurant owes Cary and what Cary owes each courier, nightly.

- [ ] `delivery_ledger` table: session_id, restaurant (place_id), order_total, delivery_fee, platform_cut, courier_payout, settled (boolean), settled_at
- [ ] Nightly summary view: per-restaurant totals, per-courier totals
- [ ] Simple admin page or edge function that generates the nightly Venmo amounts
- [ ] Mark settlements as complete

### 4. Restaurant relationships
**Goal:** Get 2-3 restaurants on board for a pilot.

- [ ] Talk to Sasha's, Bellwether, 1-2 others
- [ ] Explain the model: 20% service charge, nightly Venmo, no tech changes on their end
- [ ] Discuss packaging (Cary provides containers? Or restaurant handles?)
- [ ] Get Venmo handles for settlement

### 5. TNC license application
**Goal:** File with Missouri DOR to carry passengers.

- [ ] Complete your own Drive onboarding (proves the system works)
- [ ] Write privacy policy (required for TNC application)
- [ ] Apply at MyDMV: online application + privacy policy PDF + $5,000 annual fee
- [ ] Standard St. Louis business license for delivery side

---

## Architecture reminder

- **Working directory:** `~/Desktop/lafayette-square` (NOT the external drive)
- **Supabase project:** `ngbvgjzrpnfrqmzkqvch` (hosted, do NOT run locally)
- **Deploy frontend:** `git push` → GitHub Actions → GitHub Pages
- **Deploy Apps Script:** `cd apps-script && npx clasp push && npx clasp deploy -i <ID>`
- **Deploy edge functions:** `cd cary && npx supabase functions deploy <name>`
- **Push migrations:** Run SQL in Supabase dashboard → SQL Editor

---

## Pricing summary

| | Delivery | Ride |
|---|---|---|
| Customer pays | Restaurant (food + 20% service) | Cary (metered fare) |
| Platform fee | $1 + 5% of delivery fee | 5% of fare |
| Courier keeps | ~85% of delivery fee | ~95% of fare |
| Settlement | Nightly Venmo | Real-time Stripe Connect |
| Onboarding cost | Free | ~$42 (Checkr + Stripe Identity) |
| Min age | 14 | 18 |
