#!/usr/bin/env node
/**
 * claims-cary-anon-exposure — what can the PUBLIC anon key actually reach?
 *
 * The Supabase anon key ships in the browser bundle. RLS + grants are the ONLY
 * wall (SECURITY.md §2). This is the acceptance test for F-1 / F-4 / F-7, and
 * the standing detector for their CLASSES — a table added by a future migration
 * with RLS forgotten, or a policy widened to `using (true)`, lands here on the
 * next run with nobody having to have looked at it.
 *
 * It reads TWO independent sources and requires them to agree:
 *   STATIC  — the migrations themselves: which relations exist, which get
 *             `enable row level security`, which carry a `using (true)` policy.
 *             (Parsed from the source, never restated, so it cannot go stale.)
 *   DYNAMIC — the live PostgREST API, as anon: does it hand over rows?
 *
 * ⭐ Requiring both is the point. A table that is EMPTY and has RLS OFF answers
 *    the live probe with a harmless-looking `200, 0 rows` — that is precisely
 *    the silent substitution CLAUDE.md Layer 0 q2 forbids, and only the static
 *    read catches it. Conversely a `using (true)` policy passes the static RLS
 *    check and only the live probe catches it.
 *
 * ⛔ NO FALLBACKS. Missing config, an unreachable API, or a status this script
 *    does not recognise is a LOUD failure — never a quiet pass.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<the public anon key> \
 *   node scratch/claims-cary-anon-exposure.mjs
 *
 * Exit 0 = clean. Exit 1 = at least one finding. Exit 2 = could not run.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'cary/supabase/migrations');

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;

if (!URL_ || !KEY) {
  console.error(
    'FAIL — SUPABASE_URL and SUPABASE_ANON_KEY must both be set.\n' +
      '       Both are public values (the anon key ships in the browser bundle);\n' +
      '       they are absent from the repo because there is no .env here.\n' +
      '       Supabase dashboard → Project Settings → API.'
  );
  process.exit(2);
}

// ── STATIC: read the schema's intent out of the migrations ─────────────────
function readMigrations() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.error(`FAIL — no .sql migrations found under ${MIGRATIONS}`);
    process.exit(2);
  }

  const rels = new Map(); // name -> { kind, source, rlsEnabled, invoker, openPolicies[] }
  const rlsOn = new Set();
  const invokerViews = new Set();
  const openPolicies = new Map(); // relation -> [policy names with `using (true)`]

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');

    // create table / create view / create or replace view
    const reCreate =
      /^\s*create\s+(?:or\s+replace\s+)?(table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gim;
    for (let m; (m = reCreate.exec(sql)); ) {
      const kind = m[1].toLowerCase().includes('view') ? 'view' : 'table';
      const prev = rels.get(m[2]);
      rels.set(m[2], { kind, source: prev?.source ?? f, lastTouched: f });
    }

    // alter table X enable row level security
    const reRls =
      /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+enable\s+row\s+level\s+security/gim;
    for (let m; (m = reRls.exec(sql)); ) rlsOn.add(m[1]);

    // create view ... with (security_invoker = true)
    const reInv =
      /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\n?\s*with\s*\([^)]*security_invoker\s*=\s*true/gim;
    for (let m; (m = reInv.exec(sql)); ) invokerViews.add(m[1]);

    // create policy "name" on X for <cmd> ... using (true)   ← the F-4 shape.
    // ⛔ The body is bounded by [^;]* — a window that can cross the statement
    //    terminator will read the NEXT policy's `using (true)` and pin it on
    //    this policy. That misattribution is worse than no detector at all.
    const rePol =
      /create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?([^;]*);/gim;
    for (let m; (m = rePol.exec(sql)); ) {
      const [, rawName, rel, body] = m;
      if (!/(?:using|with\s+check)\s*\(\s*true\s*\)/i.test(body)) continue;
      const cmd = (body.match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1] ?? 'all').toLowerCase();
      if (!openPolicies.has(rel)) openPolicies.set(rel, []);
      openPolicies.get(rel).push({ name: rawName.trim(), cmd, file: f, write: cmd !== 'select' });
    }

    // ⛔ …and DROP POLICY, or this check reports ghosts forever. Migrations are
    // cumulative: a later one replacing an open policy leaves the `create` in
    // the older file, so a parser that only accumulates keeps failing on a
    // finding that was fixed. A detector that cries wolf gets switched off.
    const reDrop =
      /drop\s+policy\s+(?:if\s+exists\s+)?"?([^"\n;]+?)"?\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gim;
    for (let m; (m = reDrop.exec(sql)); ) {
      const [, dropName, rel] = m;
      const list = openPolicies.get(rel);
      if (list) openPolicies.set(rel, list.filter((x) => x.name !== dropName.trim()));
    }
  }

  for (const [name, r] of rels) {
    r.rlsEnabled = rlsOn.has(name);
    r.invoker = invokerViews.has(name);
    r.openPolicies = openPolicies.get(name) ?? [];
  }
  return [...rels.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// ── The two roles a stranger can hold ──────────────────────────────────────
/**
 * ⭐⭐ Since migration 010, "a random visitor" is NOT the anon role. Requesters
 * get an anonymous Supabase session, and an anonymous user holds the
 * **`authenticated`** role — so any policy written as `auth.uid() is not null`
 * now admits the whole internet. That is exactly how F-10 (live courier GPS)
 * silently widened, and an anon-only census cannot see it: the two roles get
 * different policy sets.
 *
 * ⛔ So this probes BOTH, and if the anonymous session cannot be obtained it
 * says so and refuses to report a pass. Checking half the surface and printing
 * PASS is the silent substitution this whole file exists to prevent.
 */
async function anonymousSessionToken() {
  try {
    const res = await fetch(`${URL_.replace(/\/$/, '')}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: '{}', // no email/password = anonymous sign-in
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.access_token) return { token: body.access_token };
    return { error: body?.msg || body?.error_description || `HTTP ${res.status}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ── DYNAMIC: ask PostgREST what it hands over, as a given bearer ───────────
async function probe(name, bearer = KEY) {
  const url = `${URL_.replace(/\/$/, '')}/rest/v1/${name}?select=*&limit=1`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${bearer}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
  } catch (err) {
    return { state: 'UNREACHABLE', detail: err.message, rows: null };
  }

  const count = res.headers.get('content-range')?.split('/')?.[1] ?? '?';

  if (res.status === 401 || res.status === 403) return { state: 'DENIED', detail: `HTTP ${res.status}`, rows: 0 };
  if (res.status === 404) return { state: 'DENIED', detail: 'HTTP 404 (not exposed)', rows: 0 };
  if (res.status === 200) {
    const rows = count === '*' ? 0 : Number(count);
    return {
      state: rows > 0 ? 'ROWS' : 'EMPTY',
      detail: `HTTP 200, ${rows} row(s) visible`,
      rows,
    };
  }
  return { state: 'UNEXPECTED', detail: `HTTP ${res.status}`, rows: null };
}

// ── Adjudicate static vs dynamic ───────────────────────────────────────────
// ok        — the wall is standing and both sources agree it is.
// FINDING   — a defect in ANY town: anon was handed rows, an open WRITE policy,
//             a table with no RLS at all, or a definer view anon can reach.
// OPEN-READ — an open `for select using (true)` on a table that is empty today.
//             ⭐ Not auto-classified either way: whether that is a deliberate
//             public reference table or an oversight is a judgement about the
//             DATA, and the checker must not guess it (CLAUDE.md Layer 0 q3 —
//             don't call the operator's decision a defect). Reported separately
//             and loudly, for a human ruling. ⛔ Not a skip list: nothing is
//             enumerated by name; the class is derived from the policy command.
// BROKEN    — the probe could not run; this run proves nothing about that row.
function adjudicate(name, r, p) {
  if (p.state === 'UNREACHABLE' || p.state === 'UNEXPECTED')
    return { level: 'BROKEN', why: `probe failed (${p.detail}) — this row proves nothing` };

  const fmt = (ps) => ps.map((x) => `${x.name} [for ${x.cmd}] (${x.file})`).join(', ');
  const writeOpen = r.openPolicies.filter((x) => x.write);
  const readOpen = r.openPolicies.filter((x) => !x.write);

  if (p.state === 'ROWS')
    return {
      level: 'FINDING',
      why: r.openPolicies.length
        ? `anon was handed ${p.rows} row(s); open policy: ${fmt(r.openPolicies)}`
        : `anon was handed ${p.rows} row(s)`,
    };

  if (r.kind === 'view') {
    if (p.state === 'DENIED') return { level: 'ok', why: `grant revoked (${p.detail})` };
    return {
      level: 'FINDING',
      why: r.invoker
        ? 'view is security_invoker but still anon-reachable — revoke the grant'
        : 'DEFINER view reachable by anon — it bypasses the caller RLS (F-7 class)',
    };
  }

  // table, and anon got no rows
  if (!r.rlsEnabled)
    return {
      level: 'FINDING',
      why:
        p.state === 'DENIED'
          ? 'no `enable row level security` in any migration — only a grant is holding this shut'
          : 'NO RLS IN ANY MIGRATION, and anon can reach it — it reads clean only because the table is empty (F-1 class)',
    };

  // An open WRITE is never a design choice: anon can insert/update/delete rows
  // it does not own, and an empty table proves nothing about that.
  if (writeOpen.length) return { level: 'FINDING', why: `anon can WRITE — open policy: ${fmt(writeOpen)}` };

  if (readOpen.length) return { level: 'OPEN-READ', why: `open read policy: ${fmt(readOpen)}` };

  return {
    level: 'ok',
    why: p.state === 'DENIED' ? `grant revoked (${p.detail})` : 'RLS on, anon-scoped policies return nothing',
  };
}

const rels = readMigrations();
console.log(`Cary anon-exposure census — ${rels.length} relations read from ${MIGRATIONS}`);
console.log(`Target: ${URL_}\n`);

const MARK = { ok: '   ok    ', FINDING: ' FINDING ', 'OPEN-READ': ' OPEN-READ', BROKEN: ' BROKEN  ' };
const findings = [];
const openReads = [];
const brokenRows = [];

for (const [name, r] of rels) {
  const p = await probe(name);
  const v = adjudicate(name, r, p);
  if (v.level === 'FINDING') findings.push([name, v.why]);
  if (v.level === 'OPEN-READ') openReads.push([name, v.why]);
  if (v.level === 'BROKEN') brokenRows.push([name, v.why]);
  const rls = r.kind === 'view' ? (r.invoker ? 'invoker' : 'definer') : r.rlsEnabled ? 'rls:on' : 'rls:OFF';
  console.log(`[${MARK[v.level]}] ${name.padEnd(26)} ${r.kind.padEnd(5)} ${rls.padEnd(8)} ${p.detail.padEnd(26)} ${v.why}`);
}

// ── Second pass: the same surface as an ANONYMOUS AUTHENTICATED visitor ────
console.log('');
const anonAuth = await anonymousSessionToken();
if (anonAuth.error) {
  console.log(`⚠️  COULD NOT check the \`authenticated\` role: ${anonAuth.error}`);
  console.log('    Anonymous sign-in appears to be disabled on this project. Since migration 010');
  console.log('    the requester flow needs it, and a policy reading `auth.uid() is not null` is');
  console.log('    invisible to the anon-only pass above.');
  console.log('    ⛔ This run has checked HALF the surface. It is not a pass.');
  brokenRows.push(['<authenticated role>', 'anonymous sign-in unavailable — half the surface unchecked']);
} else {
  console.log('Same relations, as an anonymous AUTHENTICATED visitor (the post-010 stranger):');
  for (const [name, r] of rels) {
    const p = await probe(name, anonAuth.token);
    // A stranger holding only an anonymous session must be handed nothing.
    // Rows here mean a policy is gating on the SHAPE of the caller rather than
    // on a relationship — the F-10 defect.
    const bad = p.state === 'ROWS';
    if (bad) findings.push([`${name} (authenticated)`, `an anonymous visitor was handed ${p.rows} row(s) — a policy is gating on "is authenticated" rather than on a relationship`]);
    if (p.state === 'UNREACHABLE' || p.state === 'UNEXPECTED') {
      brokenRows.push([`${name} (authenticated)`, p.detail]);
    }
    console.log(`[${bad ? ' FINDING ' : '   ok    '}] ${name.padEnd(26)} ${p.detail}`);
  }
}

console.log('');
if (brokenRows.length) {
  console.log(`FAIL — ${brokenRows.length} relation(s) could not be probed. Do NOT read this run as a pass.`);
  for (const [n, why] of brokenRows) console.log(`  · ${n}: ${why}`);
}
if (findings.length) {
  console.log(`FAIL — ${findings.length} finding(s) — a defect in any town:`);
  for (const [n, why] of findings) console.log(`  · ${n}: ${why}`);
}
if (openReads.length) {
  console.log(`RULING NEEDED — ${openReads.length} relation(s) world-readable by policy, empty today:`);
  for (const [n, why] of openReads) console.log(`  · ${n}: ${why}`);
  console.log('  Scope the policy, or record that the table is deliberately public reference data.');
}
if (brokenRows.length || findings.length || openReads.length) process.exit(1);
console.log(`PASS — all ${rels.length} relations: RLS declared in migrations AND anon handed nothing.`);
