#!/usr/bin/env node
/**
 * claims-contact-sms-rate-limit — can a stranger still flood the Host's phone?
 *
 * `contact-sms` is public by design: the whole point is that someone with no
 * account can reach the Host. So there is no caller to authenticate, and the
 * rate limiting IS the security control — the only thing between a
 * `while true; do curl` and a flooded personal phone plus a Twilio bill
 * (SECURITY.md F-13).
 *
 * ⭐ Loads the REAL helpers out of the function's source and runs them. A check
 * that re-implements the thing it checks passes forever, including after the
 * source breaks.
 *
 * The cases that matter most are the ones where a limiter fails OPEN — a
 * mis-set env var read as "unlimited", or an unreadable counter treated as
 * "probably fine". Both turn a money-spending endpoint back into an open one
 * while still looking like it has a limit.
 *
 *   node scratch/claims-contact-sms-rate-limit.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cary/supabase/functions/contact-sms/index.ts');

const source = readFileSync(SRC, 'utf8');
const cut = source.indexOf('Deno.serve(');
if (cut === -1) {
  console.error(`FAIL — no \`Deno.serve(\` in ${SRC}; the file's shape changed.`);
  process.exit(2);
}

const NEEDED = ['overLimit', 'cap', 'hashIp', 'clientIp', 'corsHeaders'];
const helpers = source.slice(0, cut);
for (const n of NEEDED) {
  if (!helpers.includes(`function ${n}`)) {
    console.error(`FAIL — \`${n}\` is not defined above Deno.serve in ${SRC}. Guard removed or moved?`);
    process.exit(2);
  }
}

const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };

const mod = await import(
  'data:text/javascript;base64,' +
    Buffer.from(`${helpers}\nexport { ${NEEDED.join(', ')} };`).toString('base64')
);
const { overLimit, cap, hashIp, clientIp, corsHeaders } = mod;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`[${ok ? ' ok ' : 'FAIL'}] ${name}${detail ? `  — ${detail}` : ''}`);
};

// ── A fake sms_messages that answers a count, or an error ─────────────────
function fakeDb({ counts = {}, error = null }) {
  return {
    from: () => {
      const q = {
        _label: 'global/day',
        select: () => q,
        eq(col, val) {
          if (col === 'sender_ip_hash') q._label = 'ip/hour';
          if (col === 'device_hash') q._label = 'device/hour';
          return q;
        },
        gte: () => q,
        then: (resolve) =>
          resolve(error ? { count: null, error: { message: error } } : { count: counts[q._label] ?? 0, error: null }),
      };
      return q;
    },
  };
}

const src = { ipHash: 'a'.repeat(64), deviceHash: 'dead' };

console.log('── the limiter holds ──');
check('quiet traffic is allowed through',
  !(await overLimit(fakeDb({ counts: {} }), src)).over);

let v = await overLimit(fakeDb({ counts: { 'global/day': 200 } }), src);
check('the GLOBAL daily ceiling refuses at the cap', v.over, v.which);

v = await overLimit(fakeDb({ counts: { 'ip/hour': 10 } }), src);
check('one address hammering it is refused', v.over, v.which);

v = await overLimit(fakeDb({ counts: { 'device/hour': 5 } }), src);
check('one device hammering it is refused', v.over, v.which);

console.log('\n── ⛔ the ways a limiter fails OPEN ──');
v = await overLimit(fakeDb({ error: 'connection reset' }), src);
check('an UNREADABLE counter refuses (fails closed, not open)', v.over, v.which);

for (const [name, val] of [['unset', undefined], ['garbage', 'lots'], ['zero', '0'], ['negative', '-1']]) {
  delete ENV.CONTACT_CAP_GLOBAL_DAY;
  if (val !== undefined) ENV.CONTACT_CAP_GLOBAL_DAY = val;
  check(`a ${name} cap env falls back to the default, never to unlimited`,
    cap('CONTACT_CAP_GLOBAL_DAY', 200) === 200, `got ${cap('CONTACT_CAP_GLOBAL_DAY', 200)}`);
}
delete ENV.CONTACT_CAP_GLOBAL_DAY;

ENV.CONTACT_CAP_GLOBAL_DAY = '25';
check('a valid cap env IS honoured', cap('CONTACT_CAP_GLOBAL_DAY', 200) === 25);
delete ENV.CONTACT_CAP_GLOBAL_DAY;

// A caller who simply omits device_hash must not skip the global ceiling.
v = await overLimit(fakeDb({ counts: { 'global/day': 200 } }), { ipHash: null, deviceHash: null });
check('omitting device_hash AND ip does not bypass the global ceiling', v.over, v.which);

console.log('\n── the IP key is a key, not an IP log ──');
ENV.IP_HASH_SALT = 'pepper';
const h1 = await hashIp('203.0.113.9');
const h2 = await hashIp('203.0.113.9');
const h3 = await hashIp('203.0.113.10');
check('the same address hashes the same (usable as a key)', h1 === h2);
check('a different address hashes differently', h1 !== h3);
check('the stored value contains no part of the address', !h1.includes('203') && !h1.includes('113'));
check('no address, no key', (await hashIp(null)) === null);
ENV.IP_HASH_SALT = 'different-pepper';
check('the salt actually salts', (await hashIp('203.0.113.9')) !== h1);
delete ENV.IP_HASH_SALT;

check('the client IP is the left-most forwarded entry, not the proxy',
  clientIp({ headers: { get: (h) => (h === 'x-forwarded-for' ? '203.0.113.9, 10.0.0.1' : null) } }) === '203.0.113.9');

console.log('\n── origin lock (browsers only, and it knows it) ──');
const originOf = (o) => corsHeaders({ headers: { get: (h) => (h === 'Origin' ? o : null) } })['Access-Control-Allow-Origin'];
check('our own site is allowed', originOf('https://lafayette-square.com') === 'https://lafayette-square.com');
check('localhost dev is allowed', originOf('http://localhost:5173') === 'http://localhost:5173');
check("someone else's site gets NO allow-origin header", originOf('https://evil.example.com') === undefined);
check('and it is never echoed back as a wildcard', originOf('https://evil.example.com') !== '*');

console.log('');
if (failed) {
  console.log(`FAIL — ${failed} check(s) failed. contact-sms does not hold the line.`);
  process.exit(1);
}
console.log('PASS — the caps hold, they fail closed, and the origin lock does not wildcard.');
