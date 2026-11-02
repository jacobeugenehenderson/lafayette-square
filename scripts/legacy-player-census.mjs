#!/usr/bin/env node
/**
 * legacy-player-census.mjs — DOES ANY TOWN STILL NAME THE RETIRED PLAYER? Read-only; the precondition for deploying the
 * Workers that no longer serve it (the LS bleed (b); Zob's condition: a check, not a one-off log).
 *
 *   node scripts/legacy-player-census.mjs
 *
 * Lists every production host record (`hosts/*.json`) and every staging player record (`staging/sites/<map>/player.json`)
 * in the bucket, reads each, and prints its town and player. Exit 1 when any is not "ward" (a host record's `app`, a
 * staging record's `player`) or cannot be read; exit 0 only when every one plays the Ward. ⛔ It holds no list of towns or
 * hosts: it lists the bucket.
 * ▶ Run it after the merge AND again immediately before Jacob deploys the production Worker: a Promote in between could
 *   write a record (Zob, 2026-11-01).
 */
import { r2, BUCKET } from './_r2api.mjs'
import { freshUrl } from '../src/lib/freshUrl.js'

const PUBLIC_BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const read = async (key) => { const r = await fetch(freshUrl(PUBLIC_BASE + key)); if (!r.ok) throw new Error(`${key} answered ${r.status}`); return r.json() }

;(async () => {
  const b = await r2()
  const hosts = (await b.list('hosts/')).filter((k) => k.endsWith('.json'))
  const stagingRecs = (await b.list('staging/sites/')).filter((k) => /^staging\/sites\/[^/]+\/player\.json$/.test(k))
  const bad = []
  console.log(`bucket ${BUCKET}: ${hosts.length} production host record(s), ${stagingRecs.length} staging player record(s)\n`)
  for (const k of hosts) {
    try { const r = await read(k); const ok = r.app === 'ward'
      console.log(`${ok ? '  ' : '⛔'} ${k.padEnd(48)} app=${r.app ?? '(none)'} map=${r.map ?? '?'}${r.ward ? ` ward=${r.ward.slice(0, 8)}` : ''}`)
      if (!ok) bad.push(`${k}: app ${JSON.stringify(r.app)}`) } catch (e) { console.log(`⛔ ${k}: ${e.message}`); bad.push(`${k}: unreadable`) }
  }
  for (const k of stagingRecs) {
    try { const r = await read(k); const ok = r.player === 'ward'
      console.log(`${ok ? '  ' : '⛔'} ${k.padEnd(48)} player=${r.player ?? '(none)'}`)
      if (!ok) bad.push(`${k}: player ${JSON.stringify(r.player)}`) } catch (e) { console.log(`⛔ ${k}: ${e.message}`); bad.push(`${k}: unreadable`) }
  }
  console.log(bad.length ? `\n⛔ ${bad.length} record(s) do not play the Ward — do NOT deploy the Workers:\n  · ${bad.join('\n  · ')}`
    : '\n✅ every production host and staging town plays the Ward')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error(`⛔ NOT MEASURED — legacy-player-census: ${e.message}`); process.exit(2) })
