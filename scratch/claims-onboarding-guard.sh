#!/usr/bin/env bash
# claims-onboarding-guard — does get_onboarding_status's self-guard ACTUALLY fire?
#
# ⭐ This exists because 014 shipped a guard that never fired: it tested
#    `current_user`, which inside a SECURITY DEFINER function is the function's
#    OWNER, not the caller. Reading the SQL made it look right. Only calling it
#    with a real `authenticated` token showed HTTP 200 where 42501 was required.
#
# ⛔ THE `anon` PROBE IS NOT THE TEST. anon is blocked by the GRANT (401), which
#    passes whether the guard works or not — the guard's whole job is to stop one
#    AUTHENTICATED caller reading ANOTHER's record. Probing anon and calling it a
#    pass is the silent substitution this repo keeps paying for.
#
# Requires anonymous sign-in enabled (SECURITY.md F-16) — that is what supplies
# an `authenticated` token with a uid that is nobody's courier id.
#
#   bash scratch/claims-onboarding-guard.sh
#
# Exit 0 = the guard fires. Exit 1 = it does not. Exit 2 = could not run.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${VITE_SUPABASE_URL:?}" "${VITE_SUPABASE_ANON_KEY:?}"

TOK=$(curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).access_token ?? ""')
if [ -z "$TOK" ] || [ "$TOK" = "undefined" ]; then
  echo "FAIL (2) — could not get an anonymous session. Anonymous sign-in is off?"
  echo "           That is SECURITY.md F-16, and it makes this check unrunnable."
  exit 2
fi
# ⛔ not UID — bash reserves it, and the silent fallback to 501 made an early
#    run of this probe pass a uuid of \"501\" and answer 400 instead of testing.
SELF=$(node -pe 'JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64").toString()).sub' "$TOK")
OTHER=11111111-1111-1111-1111-111111111111

call() { curl -s -o /tmp/_g.body -w '%{http_code}' \
  "$VITE_SUPABASE_URL/rest/v1/rpc/get_onboarding_status?p_courier_id=$1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOK"; }

rc=0
S=$(call "$SELF");  SB=$(cat /tmp/_g.body)
O=$(call "$OTHER"); OB=$(cat /tmp/_g.body)

# SELF: the caller asking for their OWN uid must get through the guard. (They are
# not a courier, so the body is null — that is the function's own not-found path,
# reached only because the guard let them past.)
if [ "$S" = "200" ]; then echo "[ ok   ] SELF  → HTTP 200 — authenticated retains EXECUTE and passes the guard"
else echo "[ FAIL ] SELF  → HTTP $S $SB — a courier can no longer read their OWN status"; rc=1; fi

# OTHER: the whole point.
if [ "$O" = "403" ] || grep -q '42501' /tmp/_g.body 2>/dev/null; then
  echo "[ ok   ] OTHER → HTTP $O (42501) — the guard fires"
else
  echo "[ FAIL ] OTHER → HTTP $O $OB — THE GUARD DID NOT FIRE."
  echo "         Any signed-in user can read any courier's onboarding record."
  rc=1
fi

# ── The service_role exemption ────────────────────────────────────────────────
# ⛔ THIS IS THE HALF THAT CAN CAUSE AN OUTAGE. The guard exempts service_role by
#    reading the JWT `role` claim. If that read is wrong, the edge functions
#    (onboarding, stripe/webhooks) start getting 42501 on every courier they did
#    not happen to be — i.e. all of them. Silence here is not a pass.
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  R=$(curl -s -o /tmp/_g.body -w '%{http_code}' \
    "$VITE_SUPABASE_URL/rest/v1/rpc/get_onboarding_status?p_courier_id=$OTHER" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
  if [ "$R" = "200" ]; then
    echo "[ ok   ] SERVICE_ROLE → HTTP 200 on another uuid — the exemption holds"
  else
    echo "[ FAIL ] SERVICE_ROLE → HTTP $R $(cat /tmp/_g.body) — THE EXEMPTION IS BROKEN."
    echo "         The onboarding edge function and the Stripe webhooks will 42501."
    rc=1
  fi
else
  echo "[ UNCHECKED ] SERVICE_ROLE exemption — SUPABASE_SERVICE_ROLE_KEY not set."
  echo "         ⛔ This run has NOT checked the half that can cause an outage."
  echo "         Dashboard → Project Settings → API → service_role key, then:"
  echo "           SUPABASE_SERVICE_ROLE_KEY=… bash scratch/claims-onboarding-guard.sh"
  rc=1
fi

[ $rc -eq 0 ] && echo "PASS — self-only access enforced, and service_role still exempt." || echo "FAIL — see above."
exit $rc
