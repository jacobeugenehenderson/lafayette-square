<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: RULING: the Ward reads a town's contact and service switches from Operations' published town file, and contact-sms carries no town's default address
-->
# BRIEF — A town's contact and service switches come from Operations

**For:** a fresh agent (theward-operations, the kit's `cary/supabase/functions/contact-sms`, the Ward).
**Written:** 2026-09-28 (Warden). **Report to:** Warden.
**Ruled by Jacob, 2026-09-28:** a town's contact information comes from the Operations utility, not the kit; and
the LS-named default inbox goes ("Agreed about the emails and LS email address, contact info").

## 1. Today (read by Quire, 2026-09-28; confirm)
- Operations holds **no town-level contact**. Its `contacts` collection is the Guardian outreach loop (per listing,
  private, never published). The town record (`wards`) carries `SERVICE_FIELDS` `cary` and `commerce`
  (on / off / unset) but is **not published**. Operations publishes one file per town: `live/<look>/listings.json`.
- The kit carries contact in the town's instance file (`contact.email`, `cary.email`, `cary.smsNumber`,
  `cary.smsNumberDisplay`), read by the old player (`ContactModal.jsx`, `PlaceCard.jsx`'s `sms:` links) and copied
  into the manifest (`identity.contact`, `identity.cary`). The Ward reads none of them.
- `contact-sms` forwards every town's message to one operator number and to `FORWARD_EMAIL`, whose default is
  Lafayette Square's address. It admits only listed origins; the Ward's are not on the list.
- Delivery's "coming soon / live" is not a switch anywhere (the old player's comment: remove the `isAdmin` gate).

## 2. The work
1. **The town record carries contact** (a text number and an email) beside its service switches, authored in Operations.
2. **Operations publishes a town file** (e.g. `live/<look>/town.json`: contact + `cary` + `commerce`), public
   fields only. The Ward reads it for "Text us" (the number shown when present) and for delivery's state
   (`cary` on = live; unset/off = coming soon; admin testing waits for the F-20 operator sign-in).
3. **`contact-sms` routes by town:** the Ward names its town, the function looks up that town's contact, and a
   town with none configured is refused loudly. No default address, and no town's address used for another.
   Its allowed origins cover every Ward origin (the town domains, staging, local dev) from one list.
4. **Retire the kit's copies** at cutover with the old player: the instance fields, the manifest's `identity.contact`
   and `identity.cary`. The Ward never reads them.

## 3. Checks
- No town's contact or address appears in the kit's shared code or the function's defaults.
- The Ward's contact and delivery state are read from the Operations file only.
- Every Ward origin is admitted by `contact-sms` (reads the one list).

## 4. Needs Jacob's go
Supabase secrets and the function redeploy; any Operations publish to R2.
