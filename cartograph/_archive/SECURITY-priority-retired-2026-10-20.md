# SECURITY.md §5 — retired priority text, 2026-10-20

*Diary. Cut from `SECURITY.md §5` by Boz, 2026-10-20 night. Reason: F-4 is CLOSED (its §3 heading: migration `010`, applied + verified live 2026-08-24), and the F-13/`contact-sms` escalation nested under it is closed too (§5 item 7: capped + origin-locked 2026-08-24). Kept verbatim.*

3. **F-4** — `requests` carries an open **UPDATE** policy and is handing rows to anon right now
   (`scratch/claims-cary-anon-exposure.mjs` fails on it).
   ### ⭐ AND **F-13/`contact-sms` IS NOW ABOVE ITS OWN RANK** *(2026-08-24)*
   Jacob is adding a **public "direct contact" QR** that routes into `contact-sms`. That function is
   deployed, takes `ACAO: *`, has **no auth and no rate limit**, and every POST sends a real Twilio SMS
   to `CONTACT_PHONE` and a SendGrid email. A QR makes the endpoint *more* discoverable, and the abuse
   is billable spend plus SMS-flooding a personal phone. `ls/OPERATIONS.md` has called this a ⛔ for a
   while; this register still files it under **F-13 · LOW · broad CORS**, which is the wrong severity.
   ⛔ **Rate-limit / abuse-gate it before the QR is printed**, not after.
