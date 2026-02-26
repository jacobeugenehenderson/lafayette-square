import { useEffect, useState } from 'react'
import useGuardianStatus from '../hooks/useGuardianStatus'
import useListings from '../hooks/useListings'
import CATEGORIES from '../tokens/categories'

export default function ClaimPage({ listingId, secret }) {
  const { loading, claim, isGuardianOf } = useGuardianStatus()
  const getById = useListings((s) => s.getById)
  const [result, setResult] = useState(null)
  const [fired, setFired] = useState(false)
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

  return (
    <div className="min-h-screen bg-scene-bg flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-2xl bg-surface-container border border-outline-variant backdrop-blur-sm p-6 text-center space-y-5">
        {/* Header */}
        <div>
          <div className="text-4xl mb-2">{claimed ? '\ud83d\udee1\ufe0f' : '\ud83d\udd10'}</div>
          <h1 className="text-xl font-semibold text-on-surface">
            {claimed ? `Welcome, Guardian` : 'Guardian Claim'}
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
                ? `You're the guardian of ${placeName}. Manage it from the map.`
                : `This device is now the guardian of ${placeName}. You can post events, respond to reviews, and customize your QR codes from the map.`
              }
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && result && !result.success && (
          <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10">
            <p className="text-red-300 text-sm">{result.error || 'Claim failed'}</p>
            <p className="text-on-surface-subtle text-xs mt-2">
              The secret may be invalid or this place is already claimed by another device.
            </p>
          </div>
        )}

        {/* Link back */}
        <a
          href={`${import.meta.env.BASE_URL}place/${listingId}`}
          className="inline-block text-sm px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors"
        >
          {claimed ? `Open ${placeName} on the map` : 'Explore the neighborhood'} &rarr;
        </a>
      </div>
    </div>
  )
}
