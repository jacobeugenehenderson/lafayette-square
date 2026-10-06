// overpass.mjs — the ONE Overpass call every OSM fetcher makes (moved out of fetch.js, 2026-10-06, so the kerb
// fetcher shares it rather than copying it). `tmpDir` is where the response lands before it is parsed: the caller's
// raw directory, so a partial download never sits beside another town's data.
import { mkdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const TIMEOUT = 120

export function overpassQuery(queryBody, tmpDir, attempt = 1) {
  const MAX_ATTEMPTS = 4
  const full = `[out:json][timeout:${TIMEOUT}];${queryBody}`
  console.log(`  Overpass query (${full.length} chars)${attempt > 1 ? ` [retry ${attempt}/${MAX_ATTEMPTS}]` : ''}...`)

  // Overpass now rejects requests without a User-Agent (HTTP 406); a
  // descriptive UA is also Overpass etiquette. Without this the public
  // instance returns an HTML 406 page that fails JSON.parse.
  //
  // ⭐ curl writes to a FILE, not through a pipe. This used to capture stdout with
  // `maxBuffer: 50 MB`, which is a ceiling on how big a neighborhood can be: a
  // 33 km² fetch of Centrum, Łódź returned 52.49 MB and execSync threw. The failure
  // is also invisible — the thrown error carries the whole 52 MB body, so serve.js's
  // lastLine() reports the Node version banner and the operator is told
  // "OSM fetch failed — Node.js v22.20.0". Writing to a file removes the ceiling
  // rather than moving it, and keeps the error surface small.
  const tmp = join(tmpDir, `.overpass-${process.pid}-${attempt}.json`)
  mkdirSync(tmpDir, { recursive: true })
  try {
    execSync(
      `curl -s -A "cartograph/1.0 (neighborhood pour; jacob@jacobhenderson.studio)" --max-time ${TIMEOUT + 30} --data-urlencode "data=${full}" -o ${JSON.stringify(tmp)} "${OVERPASS_URL}"`,
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
  } catch (e) {
    try { rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw new Error(`curl failed: ${String(e.stderr || e.message).slice(0, 200)}`)
  }
  const bytes = statSync(tmp).size
  console.log(`  → ${(bytes / 1048576).toFixed(1)} MB`)
  const result = readFileSync(tmp, 'utf8')
  rmSync(tmp, { force: true })

  // Back-to-back queries can be refused while a prior slot frees (Overpass
  // returns an HTML/XML error page, not JSON). Retry with backoff.
  if (!result.trimStart().startsWith('{')) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`Overpass returned non-JSON after ${MAX_ATTEMPTS} attempts: ${result.slice(0, 160)}`)
    }
    const waitMs = 4000 * attempt
    console.log(`  ⚠ non-JSON response (likely rate-limit); waiting ${waitMs / 1000}s...`)
    execSync(`sleep ${waitMs / 1000}`)
    return overpassQuery(queryBody, tmpDir, attempt + 1)
  }

  const data = JSON.parse(result)
  console.log(`  → ${data.elements?.length ?? 0} elements`)
  return data
}
