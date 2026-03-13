/**
 * Cary — Auth Flow (inline, not modal)
 *
 * Renders inside the CaryTab when user isn't signed in.
 * Phone OTP → Profile creation → ready to request.
 */

import { useState, useCallback } from 'react'
import useCary from '../hooks/useCary'

const RELATIONSHIPS = [
  { id: 'resident', label: 'I live here' },
  { id: 'worker', label: 'I work here' },
  { id: 'visitor', label: 'Visiting' },
]

export default function CaryAuth() {
  const { sendOtp, verifyOtp, createProfile, user, profile, loading, error } = useCary()
  const [step, setStep] = useState('phone') // phone | verify | profile
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [relationship, setRelationship] = useState('resident')

  const handleSendOtp = useCallback(async () => {
    // Format phone — add +1 if no country code
    let formatted = phone.replace(/[^\d+]/g, '')
    if (!formatted.startsWith('+')) formatted = '+1' + formatted
    const ok = await sendOtp(formatted)
    if (ok) {
      setPhone(formatted)
      setStep('verify')
    }
  }, [phone, sendOtp])

  const handleVerify = useCallback(async () => {
    const ok = await verifyOtp(phone, code)
    if (ok) setStep('profile')
  }, [phone, code, verifyOtp])

  const handleCreateProfile = useCallback(async () => {
    if (!displayName.trim()) return
    await createProfile(displayName.trim(), relationship)
  }, [displayName, relationship, createProfile])

  // Already signed in with profile — shouldn't render this
  if (user && profile) return null

  // Signed in but no profile yet
  if (user && !profile) {
    return (
      <div className="space-y-3">
        <p className="text-body text-on-surface font-medium">Set up your profile</p>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          maxLength={30}
          className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle"
        />
        <div className="flex gap-2">
          {RELATIONSHIPS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRelationship(r.id)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-body-sm transition-colors ${
                relationship === r.id
                  ? 'border-on-surface bg-surface-container-high text-on-surface'
                  : 'border-outline-variant text-on-surface-variant hover:border-on-surface-subtle'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreateProfile}
          disabled={loading || !displayName.trim()}
          className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
        {error && <p className="text-caption text-rose-400">{error}</p>}
      </div>
    )
  }

  // Phone entry
  if (step === 'phone') {
    return (
      <div className="space-y-3">
        <div className="text-center mb-2">
          <p className="text-body text-on-surface font-medium">Sign in to call Cary</p>
          <p className="text-body-sm text-on-surface-subtle mt-0.5">We'll text you a code</p>
        </div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(314) 555-1234"
          className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle text-center tracking-wider"
        />
        <button
          onClick={handleSendOtp}
          disabled={loading || phone.replace(/\D/g, '').length < 10}
          className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
        >
          {loading ? 'Sending...' : 'Send code'}
        </button>
        {error && <p className="text-caption text-rose-400">{error}</p>}
      </div>
    )
  }

  // OTP verification
  if (step === 'verify') {
    return (
      <div className="space-y-3">
        <div className="text-center mb-2">
          <p className="text-body text-on-surface font-medium">Enter the code</p>
          <p className="text-body-sm text-on-surface-subtle mt-0.5">Sent to {phone}</p>
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle text-center tracking-[0.5em] font-mono text-title"
        />
        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>
        <button
          onClick={() => { setStep('phone'); setCode('') }}
          className="w-full text-center text-body-sm text-on-surface-subtle hover:text-on-surface-variant transition-colors"
        >
          Use a different number
        </button>
        {error && <p className="text-caption text-rose-400">{error}</p>}
      </div>
    )
  }

  return null
}
