import { useEffect, useState, useCallback } from 'react'
import useGuardianStatus from '../hooks/useGuardianStatus'
import useListings from '../hooks/useListings'
import useHandle from '../hooks/useHandle'
import AvatarEditor from '../components/AvatarEditor'
import AvatarCircle from '../components/AvatarCircle'
import CATEGORIES from '../tokens/categories'

export default function ClaimPage({ listingId, secret }) {
  const { loading, claim, isGuardianOf, roleFor } = useGuardianStatus()
  const getById = useListings((s) => s.getById)
  const handle = useHandle((s) => s.handle)
  const avatar = useHandle((s) => s.avatar)
  const vignette = useHandle((s) => s.vignette)
  const updateAvatar = useHandle((s) => s.updateAvatar)
  const [result, setResult] = useState(null)
  const [fired, setFired] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const landmark = getById(listingId)
  const cat = landmark ? CATEGORIES[landmark.category] : null
  const alreadyClaimed = isGuardianOf(listingId)

  useEffect(() => {
    if (fired || alreadyClaimed) return
    setFired(true)
    claim(listingId, secret).then(setResult)
  }, [listingId, secret, fired, alreadyClaimed, claim])

  const accentHex = cat?.hex || '#0ea5e9'
  const placeName = landmark?.name || 'this place'
  const claimed = alreadyClaimed || result?.success

  // Determine role: from fresh claim result, or from stored state
  const role = result?.role || (alreadyClaimed ? roleFor(listingId) : null)
  const isGuardianRole = role === 'guardian'

  const needsHandle = claimed && !loading && !handle
  const needsAvatar = claimed && !loading && handle && !avatar

  return (
    <div className="min-h-screen bg-scene-bg flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-2xl bg-surface-container border border-outline-variant backdrop-blur-sm p-6 text-center space-y-5">
        {/* Header */}
        <div>
          <div className="text-4xl mb-2">
            {claimed ? (isGuardianRole ? '\ud83d\udee1\ufe0f' : '\ud83d\udd11') : '\ud83d\udd10'}
          </div>
          <h1 className="text-xl font-semibold text-on-surface">
            {claimed
              ? isGuardianRole ? 'Welcome, Guardian' : 'Welcome, Staff'
              : 'Claiming...'}
          </h1>
          {landmark && (
            <>
              <p className="text-on-surface-medium mt-2">{landmark.name}</p>
              <p className="text-sm text-on-surface-subtle">{landmark.address}</p>
            </>
          )}
        </div>

        {/* Loading */}
        {loading && !alreadyClaimed && (
          <div className="flex items-center justify-center gap-2 text-on-surface-variant">
            <div className="w-4 h-4 border-2 border-on-surface-disabled border-t-on-surface rounded-full animate-spin" />
            Claiming...
          </div>
        )}

        {/* Claimed — either just now or returning */}
        {claimed && !loading && (
          <div
            className="rounded-xl p-5 border"
            style={{ borderColor: accentHex + '40', backgroundColor: accentHex + '15' }}
          >
            <p className="text-on-surface font-medium text-lg mb-2">
              {alreadyClaimed && !result ? 'Welcome back' : 'You\'re in'}
            </p>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              {alreadyClaimed && !result
                ? isGuardianRole
                  ? `You're the guardian of ${placeName}. Manage it from the map.`
                  : `You're staff at ${placeName}.`
                : isGuardianRole
                  ? `This device is now the guardian of ${placeName}. You can post events, respond to reviews, and customize your QR codes from the map.`
                  : `You're now staff at ${placeName}. You're a recognized local in the neighborhood. Your guardian will set your permissions.`
              }
            </p>
          </div>
        )}

        {/* Handle selection — shown after successful claim if no handle set */}
        {needsHandle && <HandleStep accentHex={accentHex} />}

        {/* Avatar selection — shown after handle is set if no avatar */}
        {needsAvatar && !needsHandle && (
          <div className="rounded-xl p-4 border border-outline-variant bg-surface-container-high space-y-3">
            <p className="text-on-surface font-medium text-sm">Choose your avatar</p>
            <p className="text-on-surface-subtle text-xs">Pick an emoji and style for your identity in the neighborhood.</p>
            <button
              onClick={() => setAvatarOpen(true)}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors text-white"
              style={{ backgroundColor: accentHex }}
            >
              Pick an emoji
            </button>
            <button
              onClick={() => {
                // Skip avatar — go straight to map link
                // Set a default so this step doesn't re-show
                updateAvatar('\ud83d\udc64', 'v0')
              }}
              className="w-full py-1.5 text-xs text-on-surface-subtle hover:text-on-surface-variant transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        <AvatarEditor
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          currentEmoji={avatar}
          currentVignette={vignette}
          onSave={(emoji, vig) => updateAvatar(emoji, vig)}
        />

        {/* Error */}
        {!loading && result && !result.success && (
          <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10">
            <p className="text-red-300 text-sm">{result.error || 'Claim failed'}</p>
            <p className="text-on-surface-subtle text-xs mt-2">
              The secret may be invalid or this place is already claimed by another device.
            </p>
          </div>
        )}

        {/* Link back — only show after setup is complete */}
        {claimed && !needsHandle && !needsAvatar && (
          <div className="space-y-3">
            {avatar && (
              <div className="flex justify-center">
                <AvatarCircle emoji={avatar} vignette={vignette} size={12} />
              </div>
            )}
            <a
              href={`${import.meta.env.BASE_URL}place/${listingId}`}
              className="inline-block text-sm px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors"
            >
              Open {placeName} on the map &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function HandleStep({ accentHex }) {
  const { setHandle, checkAvailability } = useHandle()
  const [input, setInput] = useState('')
  const [available, setAvailable] = useState(null) // null | true | false
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const valid = /^[a-zA-Z0-9_]{3,20}$/.test(input)

  // Debounced availability check
  useEffect(() => {
    if (!valid) { setAvailable(null); return }
    setChecking(true)
    const t = setTimeout(async () => {
      const ok = await checkAvailability(input)
      setAvailable(ok)
      setChecking(false)
    }, 400)
    return () => { clearTimeout(t); setChecking(false) }
  }, [input, valid, checkAvailability])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!valid || !available) return
    setSaving(true)
    setError(null)
    const ok = await setHandle(input)
    if (!ok) {
      setError('Could not save handle. Try another.')
      setSaving(false)
    }
  }, [input, valid, available, setHandle])

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 border border-outline-variant bg-surface-container-high space-y-3">
      <p className="text-on-surface font-medium text-sm">Choose your handle</p>
      <p className="text-on-surface-subtle text-xs">This is how you'll appear in the neighborhood. Don't use your real name.</p>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-disabled text-sm">@</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
          placeholder="your_handle"
          autoFocus
          className="w-full pl-7 pr-9 py-2 rounded-lg bg-surface-dim border border-outline text-on-surface text-sm placeholder:text-on-surface-disabled outline-none focus:border-on-surface-subtle transition-colors"
        />
        {valid && !checking && available !== null && (
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${available ? 'text-green-400' : 'text-red-400'}`}>
            {available ? '\u2713' : '\u2717'}
          </span>
        )}
        {checking && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="w-3.5 h-3.5 border-2 border-on-surface-disabled border-t-on-surface rounded-full animate-spin inline-block" />
          </span>
        )}
      </div>

      {input.length > 0 && input.length < 3 && (
        <p className="text-on-surface-disabled text-xs">At least 3 characters</p>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={!valid || !available || saving}
        className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white"
        style={{ backgroundColor: accentHex }}
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </form>
  )
}
