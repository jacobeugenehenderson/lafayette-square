#!/usr/bin/env node
/**
 * claims-twilio-webhook-guard — does sms-webhook actually reject a forged POST?
 *
 * `sms-webhook` is a PUBLIC endpoint: Twilio is the caller, so there is no user
 * to authenticate. The `X-Twilio-Signature` HMAC is the ONLY thing separating a
 * real inbound text from a forged one, and a forged one drives SendGrid spend,
 * a row into `sms_messages`, and a TwiML response Twilio executes
 * (SECURITY.md F-5, F-9).
 *
 * ⭐ This check LOADS THE REAL HELPERS out of the function's source and runs
 * them — it does not restate the algorithm. A check that re-implements what it
 * is checking passes forever, including after the source is broken.
 *
 *   node scratch/claims-twilio-webhook-guard.mjs
 *
 * The expected signatures below are not remembered constants — they were
 * produced by the OFFICIAL `twilio` package's `getExpectedTwilioSignature()`
 * and pinned here so this check runs offline. To re-derive them:
 *   npm i twilio && node -e "import('twilio/lib/webhooks/webhooks.js').then(w=>
 *     console.log(w.getExpectedTwilioSignature(TOKEN, URL, PARAMS)))"
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cary/supabase/functions/sms-webhook/index.ts');

// ── Load the real helpers out of the source ────────────────────────────────
// Everything above `Deno.serve(` is pure helper code. Import it as a module so
// the thing under test IS the deployed source, not a copy of it.
const source = readFileSync(SRC, 'utf8');
const cut = source.indexOf('Deno.serve(');
if (cut === -1) {
  console.error(`FAIL — no \`Deno.serve(\` found in ${SRC}. The file's shape changed; fix this check.`);
  process.exit(2);
}

const NEEDED = ['verifyTwilioSignature', 'escapeXml', 'timingSafeEqual'];
const helpers = source.slice(0, cut);
for (const name of NEEDED) {
  if (!helpers.includes(`function ${name}`)) {
    console.error(`FAIL — \`${name}\` is not defined above Deno.serve in ${SRC}.`);
    console.error('       Either the guard was removed, or it moved below the handler.');
    process.exit(2);
  }
}

// The helpers read Deno.env; give them a controllable one.
const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };

const mod = await import(
  'data:text/javascript;base64,' +
    Buffer.from(`${helpers}\nexport { ${NEEDED.join(', ')} };`).toString('base64')
);
const { verifyTwilioSignature, escapeXml } = mod;

// ── Fixtures ───────────────────────────────────────────────────────────────
const TOKEN = 'sekrit-token';
const URL_ = 'https://ngbvgjzrpnfrqmzkqvch.supabase.co/functions/v1/sms-webhook';
const PARAMS = {
  From: '+13145551212',
  Body: 'hello </Message><Message to="+1666">pwned',
  MessageSid: 'SM0123456789abcdef',
  AccountSid: 'AC0123',
};
// Verified against twilio@5 getExpectedTwilioSignature (see header).
const VALID_SIG = 'pp7NFVmk4FAqYs/8rideHz3xBMA=';

const fakeReq = (sig, url = URL_) => ({
  url,
  headers: { get: (h) => (h.toLowerCase() === 'x-twilio-signature' ? sig : null) },
});
const formData = new Map(Object.entries(PARAMS));

// ── Cases ──────────────────────────────────────────────────────────────────
const cases = [
  {
    name: 'a correctly signed request is ACCEPTED',
    env: { TWILIO_AUTH_TOKEN: TOKEN },
    req: fakeReq(VALID_SIG),
    want: true,
  },
  {
    name: 'a FORGED request (no signature header) is rejected',
    env: { TWILIO_AUTH_TOKEN: TOKEN },
    req: fakeReq(null),
    want: false,
  },
  {
    name: 'a WRONG signature is rejected',
    env: { TWILIO_AUTH_TOKEN: TOKEN },
    req: fakeReq('AAAAAAAAAAAAAAAAAAAAAAAAAAA='),
    want: false,
  },
  {
    name: 'a signature valid for a DIFFERENT url is rejected',
    env: { TWILIO_AUTH_TOKEN: TOKEN },
    req: fakeReq(VALID_SIG, 'https://evil.example.com/functions/v1/sms-webhook'),
    want: false,
  },
  {
    name: 'a signature made with a DIFFERENT auth token is rejected',
    env: { TWILIO_AUTH_TOKEN: 'some-other-token' },
    req: fakeReq(VALID_SIG),
    want: false,
  },
  {
    // ⛔ The F-11 shape: `if (secret && header !== secret)` skips the check when
    // the secret is unset. Here that would make every forged POST indistinguishable
    // from a real text. Unverifiable MUST mean rejected.
    name: 'NO FAIL-OPEN: an unset TWILIO_AUTH_TOKEN rejects rather than skips',
    env: {},
    req: fakeReq(VALID_SIG),
    want: false,
  },
  {
    name: 'TWILIO_WEBHOOK_URL overrides req.url when a proxy rewrites it',
    env: { TWILIO_AUTH_TOKEN: TOKEN, TWILIO_WEBHOOK_URL: URL_ },
    req: fakeReq(VALID_SIG, 'http://localhost:9000/sms-webhook'),
    want: true,
  },
];

let failed = 0;
for (const c of cases) {
  for (const k of Object.keys(ENV)) delete ENV[k];
  Object.assign(ENV, c.env);
  const verdict = await verifyTwilioSignature(c.req, formData);
  const pass = verdict.ok === c.want;
  if (!pass) failed++;
  console.log(
    `[${pass ? ' ok ' : 'FAIL'}] ${c.name}` + (verdict.ok ? '' : `  — rejected: ${verdict.why}`)
  );
}

// ── F-9 · TwiML escaping ───────────────────────────────────────────────────
console.log('');
const attack = 'hi</Message><Message to="+15550000">stolen';
const escaped = escapeXml(attack);
const escOk = !/[<>]/.test(escaped) && escaped.includes('&lt;') && escaped.includes('&gt;');
if (!escOk) failed++;
console.log(`[${escOk ? ' ok ' : 'FAIL'}] F-9: TwiML injection in the message body is escaped`);
console.log(`        ${attack}\n     →  ${escaped}`);

// The body must actually BE escaped at the interpolation site, not merely
// escapable — check the handler source, since that is where F-9 lives.
// ⭐ Scope to the TwiML assembly ONLY. The same values are also interpolated
// into a console.log and into a `text/plain` SendGrid body, where escaping
// would be wrong; a checker that flags those is crying wolf, and a checker
// that cries wolf gets ignored.
const twimlLines = source
  .slice(cut)
  .split('\n')
  .filter((l) => /\btwiml\s*\+?=/.test(l));

if (!twimlLines.length) {
  console.log('[FAIL] F-9: found no `twiml +=` lines to check — the handler changed shape.');
  failed++;
} else {
  const raw = twimlLines.filter((l) => /\$\{\s*(?!escapeXml\s*\()[A-Za-z_$]/.test(l));
  if (raw.length) failed++;
  console.log(
    `[${raw.length ? 'FAIL' : ' ok '}] F-9: every value interpolated into TwiML goes through escapeXml ` +
      `(${twimlLines.length} twiml line(s) checked)`
  );
  for (const l of raw) console.log(`        unescaped: ${l.trim()}`);
}

console.log('');
if (failed) {
  console.log(`FAIL — ${failed} check(s) failed. sms-webhook does not hold the line.`);
  process.exit(1);
}
console.log('PASS — sms-webhook rejects forged, misrouted, mis-keyed and unverifiable requests, and escapes TwiML.');
