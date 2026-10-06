#!/usr/bin/env node
/**
 * claims-extent-fetches-every-declared-well.mjs — a declaration is a promise the fetch keeps: Extent's fetch runs every
 * fetcher that acquires a DECLARED well (sources.json).
 *
 *   node checks/claims-extent-fetches-every-declared-well.mjs
 *
 * Jackson Heights declared cropland; Extent never fetched it; the first pour died at "Pouring map" (cdl-2024.tif absent).
 * ⭐ The set is READ from the tree, never listed here: a declared-well fetcher is a `fetch-*` script (or cdl.mjs) that
 *    calls a declaration reader (`read…Sources(`). A new well kind with a new fetcher turns this RED until serve.js runs it.
 * ⭐ MUTANT (RED): delete any one `node <fetcher>` from serve.js's fetch.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const C = join(dirname(fileURLToPath(import.meta.url)), '..', 'cartograph')
const serve = readFileSync(join(C, 'serve.js'), 'utf8')
const fetchers = readdirSync(C).filter(f => /^(fetch-.*|cdl)\.m?js$/.test(f))
  .filter(f => /\bread\w*Sources\(/.test(readFileSync(join(C, f), 'utf8')))
const fails = [], ok = []
for (const f of fetchers) (new RegExp(`['\`]node ${f.replace('.', '\\.')}\\b`).test(serve) ? ok : fails).push(`Extent's fetch runs ${f}`)
if (!fetchers.length) fails.push('found no declared-well fetchers at all — the rule that finds them is broken')
for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
