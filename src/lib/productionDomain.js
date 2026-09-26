/**
 * decideProductionDomain — is this Operations answer a domain a town may be served and printed at?
 *
 * ⭐ ONE DECISION, THREE CALLERS: Promote (`cartograph/operations-domain.mjs`), the staging Worker
 * and the production Worker all import this, so the address on a printed claim card, the address
 * a town is promoted to, and the address its page names can never disagree about the rule.
 * Pure — no fetch, no env — so a check can drive it.
 *
 * `answer` is Operations' `GET /api/production-domain/<mapId>`:
 *   { domain, owned, zoneStatus, syncedAt }  or  { error }
 * ⛔ Anything but "owned, and its zone active" is a refusal with its reason — never a guess.
 */
export function decideProductionDomain(mapId, answer) {
  if (!answer || typeof answer !== 'object') return { domain: null, why: `Operations gave no answer for "${mapId}"` }
  if (answer.error) return { domain: null, why: `Operations: ${answer.error}` }
  if (!answer.domain) return { domain: null, why: `no Ward in Operations names "${mapId}" with a domain` }
  if (!answer.owned) return { domain: null, why: `${answer.domain} is not on the registrar list in Operations, so it is not ours` }
  if (answer.zoneStatus !== 'active') {
    return { domain: null, why: `${answer.domain}'s Cloudflare zone is "${answer.zoneStatus ?? 'absent'}" at the last `
      + `Operations sync (${answer.syncedAt ?? 'never'}) — it must be active before a site can be bound to it` }
  }
  return { domain: String(answer.domain).toLowerCase() }
}
