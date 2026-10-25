// node --import ./…/reg.mjs …/under.mjs <check.mjs>: run a kerb check with the census attached, and print its tally on exit.
// The check's own verdict and exit code are untouched (the observers only read).
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { startCensus, line } from './census.mjs'
const T = startCensus(), f = process.argv[2]
process.on('exit', () => console.error(line(f, T)))
await import(pathToFileURL(resolve(f)).href)
