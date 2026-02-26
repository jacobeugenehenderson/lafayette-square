import { useEffect, useState, useRef, useCallback } from 'react'
import useLocalStatus from '../hooks/useLocalStatus'
import useListings from '../hooks/useListings'
import useHandle from '../hooks/useHandle'
import CATEGORIES from '../tokens/categories'
import { randomAvatar } from '../lib/avatars'
import AvatarCircle from '../components/AvatarCircle'
import AvatarEditor from '../components/AvatarEditor'

function HandlePicker({ accentHex, onDone }) {
  const { setHandle, checkAvailability, loading: saving } = useHandle()
  const [input, setInput] = useState('')
  const [avatar, setAvatar] = useState(() => randomAvatar())
  const [vignette, setVignette] = useState(null)
  const [available, setAvailable] = useState(null) // null | true | false
  const [checking, setChecking] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const debounceRef = useRef(null)

  const check = useCallback(async (val) => {
    if (val.length < 3) { setAvailable(null); return }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) { setAvailable(false); return }
    setChecking(true)
    const ok = await checkAvailability(val)
    setAvailable(ok)
    setChecking(false)
  }, [checkAvailability])

  const handleChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
    setInput(val)
    setAvailable(null)
    setError(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => check(val), 400)
  }

  const handleSubmit = async () => {
    if (!input || !available || !accepted) return
    const ok = await setHandle(input, avatar, vignette)
    if (ok) onDone()
    else setError('Could not save handle. Try another.')
  }

  const valid = input.length >= 3 && /^[a-zA-Z0-9_]{3,20}$/.test(input)

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 border border-outline bg-surface-container">
        <h3 className="text-on-surface font-medium text-sm mb-3">Pick a handle</h3>
        <p className="text-on-surface-subtle text-xs mb-3">
          Your handle is how neighbors will know you on the bulletin board and in threads.
        </p>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-disabled text-sm">@</span>
          <input
            type="text"
            value={input}
            onChange={handleChange}
            placeholder="your_handle"
            maxLength={20}
            className="w-full bg-surface-container border border-outline rounded-lg pl-7 pr-3 py-2 text-sm text-on-surface placeholder-on-surface-disabled focus:outline-none focus:border-on-surface-disabled"
          />
          {checking && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-on-surface-disabled border-t-on-surface-variant rounded-full animate-spin" />
            </div>
          )}
          {!checking && available === true && valid && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">Available</span>
          )}
          {!checking && available === false && input.length >= 3 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs">
              {valid ? 'Taken' : 'Letters, numbers, _'}
            </span>
          )}
        </div>
        <p className="text-on-surface-disabled text-[10px] mt-1">3-20 characters. Letters, numbers, and underscores.</p>
      </div>

      {/* Avatar picker */}
      <div className="rounded-xl p-4 border border-outline bg-surface-container">
        <h3 className="text-on-surface font-medium text-sm mb-1">Pick your avatar</h3>
        <p className="text-on-surface-subtle text-[10px] mb-3">Tap to choose your emoji and style.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditorOpen(true)} className="focus:outline-none">
            <AvatarCircle emoji={avatar} vignette={vignette} size={12} />
          </button>
          <div className="flex-1">
            <button
              onClick={() => setEditorOpen(true)}
              className="text-on-surface-variant text-xs hover:text-on-surface-medium underline transition-colors"
            >
              Choose emoji
            </button>
            <p className="text-on-surface-disabled text-[10px] mt-0.5">
              Don't make it your face or anything rude.
            </p>
          </div>
        </div>
      </div>

      {/* Guidelines */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 accent-emerald-500"
        />
        <span className="text-on-surface-subtle text-xs leading-relaxed">
          Be neighborly. No hate speech, harassment, or spam. Posts violating guidelines may be removed.
        </span>
      </label>

      {/* Terms */}
      <details className="text-on-surface-disabled text-[10px]">
        <summary className="cursor-pointer hover:text-on-surface-subtle transition-colors">Terms of use</summary>
        <div className="mt-2 space-y-1 leading-relaxed">
          <p>Your handle is tied to this device only and cannot be transferred.</p>
          <p>Community content may be removed without notice at any time.</p>
          <p>Public bulletin posts have no expectation of privacy.</p>
          <p>Private thread messages are ephemeral and auto-deleted after 7 days of inactivity.</p>
          <p>Lafayette Square provides this platform as-is. We are not liable for any transactions, agreements, or interactions between users.</p>
        </div>
      </details>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!valid || !available || !accepted || saving}
        className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ backgroundColor: accentHex + '30', color: accentHex }}
      >
        {saving ? 'Saving...' : 'Claim handle'}
      </button>

      <button
        onClick={onDone}
        className="w-full text-on-surface-disabled text-xs hover:text-on-surface-subtle transition-colors"
      >
        Skip for now
      </button>

      <AvatarEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        currentEmoji={avatar}
        currentVignette={vignette}
        onSave={(newEmoji, newVignette) => {
          setAvatar(newEmoji)
          setVignette(newVignette)
        }}
      />
    </div>
  )
}

export default function CheckinPage({ locationId }) {
  const { isLocal, distinctDays, threshold, loading, checkin } = useLocalStatus()
  const handle = useHandle((s) => s.handle)
  const getById = useListings((s) => s.getById)
  const [result, setResult] = useState(null)
  const [fired, setFired] = useState(false)
  const [showHandlePicker, setShowHandlePicker] = useState(false)
  const landmark = getById(locationId)
  const cat = landmark ? CATEGORIES[landmark.category] : null

  useEffect(() => {
    if (fired) return
    setFired(true)
    checkin(locationId).then(setResult)
  }, [locationId, fired, checkin])

  // Show handle picker after successful check-in if no handle set
  useEffect(() => {
    if (result && result.logged !== false && !handle && !loading) {
      setShowHandlePicker(true)
    }
  }, [result, handle, loading])

  const accentHex = cat?.hex || '#8b5cf6'
  const emoji = cat?.emoji || '\ud83d\udccd'

  return (
    <div className="min-h-screen bg-scene-bg flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-2xl bg-surface-container border border-outline-variant backdrop-blur-sm p-6 text-center space-y-5">
        {/* Header */}
        <div>
          <div className="text-4xl mb-2">{emoji}</div>
          <h1 className="text-xl font-semibold text-on-surface">
            {landmark ? landmark.name : 'Lafayette Square'}
          </h1>
          {landmark && (
            <p className="text-sm text-on-surface-subtle mt-1">{landmark.address}</p>
          )}
        </div>

        {/* Status */}
        {loading && (
          <div className="flex items-center justify-center gap-2 text-on-surface-variant">
            <div className="w-4 h-4 border-2 border-on-surface-disabled border-t-on-surface rounded-full animate-spin" />
            Checking in...
          </div>
        )}

        {!loading && result && !showHandlePicker && (
          <div className="space-y-4">
            {result.error ? (
              <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10">
                <p className="text-red-300 text-sm">{result.error}</p>
              </div>
            ) : result.logged === false && (result.is_local || isLocal) ? (
              <div className="rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/10">
                <div className="text-2xl mb-1">{emoji}</div>
                <p className="text-emerald-300 font-medium">Welcome back, Townie</p>
                {handle && (
                  <p className="text-on-surface-subtle text-xs mt-1">@{handle}</p>
                )}
              </div>
            ) : (
              <div
                className="rounded-xl p-4 border"
                style={{ borderColor: accentHex + '40', backgroundColor: accentHex + '15' }}
              >
                <div className="text-2xl mb-1">&#10003;</div>
                <p className="text-on-surface font-medium">Check-in recorded!</p>
                {handle && (
                  <p className="text-on-surface-subtle text-xs mt-1">Signed in as @{handle}</p>
                )}
              </div>
            )}

            {/* Progress toward local (hide for returning townies) */}
            {!(result.logged === false && (result.is_local || isLocal)) && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-on-surface-subtle">
                    <span>Local progress</span>
                    <span>{distinctDays} / {threshold} days</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (distinctDays / threshold) * 100)}%`,
                        backgroundColor: accentHex,
                      }}
                    />
                  </div>
                </div>

                {isLocal && (
                  <div className="rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/10">
                    <p className="text-emerald-300 font-medium text-sm">
                      You're a verified local! Society Pages unlocked.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Handle picker (after successful check-in, no handle yet) */}
        {showHandlePicker && (
          <HandlePicker accentHex={accentHex} onDone={() => setShowHandlePicker(false)} />
        )}

        {/* Link back to map */}
        <a
          href={import.meta.env.BASE_URL}
          className="inline-block text-sm px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors"
        >
          Explore the neighborhood &rarr;
        </a>
      </div>
    </div>
  )
}
