/**
 * Supabase client for Cary.
 * Uses Supabase Auth (phone OTP) for identity.
 * Only creates a real client when env vars are set — avoids runaway
 * reconnect loops against localhost when Supabase isn't running.
 */

import { createClient } from '@supabase/supabase-js'
import { peekDeviceHash } from './device.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Stub client: all methods return empty data so the app doesn't crash
const STUB = new Proxy({}, {
  get: () => (...args) => {
    // Return a thenable that resolves to { data: null, error: null }
    const result = { data: null, error: null }
    const chainable = new Proxy(result, {
      get: (target, prop) => {
        if (prop === 'then') return (fn) => Promise.resolve(fn(result))
        if (prop === 'catch') return () => Promise.resolve(result)
        // Allow chaining (.from().select().eq()...)
        return (...a) => chainable
      },
    })
    return chainable
  },
})

const stubAuth = {
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  signInWithOtp: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
  verifyOtp: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  signOut: () => Promise.resolve({}),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
}

const stubFunctions = {
  invoke: () => Promise.resolve({ data: null, error: null }),
}

/**
 * Attach the caller's device hash to every request.
 *
 * `requests` RLS compares this header against the row's `requester_device_hash`
 * (migration 010 / SECURITY.md F-4) — requesters have no account, so presenting
 * the hash IS how they prove a row is theirs. Read per-request rather than
 * snapshotted at construction, so a hash minted after boot, or cleared by
 * `clearCachedHash`, is picked up without rebuilding the client.
 */
const fetchWithDeviceHash = (input, init = {}) => {
  const headers = new Headers(init.headers)
  const hash = peekDeviceHash()
  if (hash) headers.set('x-device-hash', hash)
  return fetch(input, { ...init, headers })
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: fetchWithDeviceHash } })
  : { from: STUB.from, auth: stubAuth, functions: stubFunctions, removeChannel: () => {}, channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) }
