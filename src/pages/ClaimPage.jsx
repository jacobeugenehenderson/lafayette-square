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

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-center space-y-5">
        {/* Header */}
        <div>
          <div className="text-4xl mb-2">{'\ud83d\udee1\ufe0f'}</div>
          <h1 className="text-xl font-semibold text-white">Guardian Claim</h1>
          {landmark && (
            <>
              <p className="text-white/80 mt-2">{landmark.name}</p>
              <p className="text-sm text-white/50">{landmark.address}</p>
            </>
          )}
        </div>

        {/* Already claimed */}
        {alreadyClaimed && (
          <div
            className="rounded-xl p-4 border"
            style={{ borderColor: accentHex + '40', backgroundColor: accentHex + '15' }}
          >
            <p className="text-white font-medium">You're already the guardian of this place.</p>
            <p className="text-white/50 text-sm mt-1">You can post events and specials from the main map.</p>
          </div>
        )}

        {/* Loading */}
        {loading && !alreadyClaimed && (
          <div className="flex items-center justify-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Claiming...
          </div>
        )}

        {/* Result */}
        {!loading && result && !alreadyClaimed && (
          <div>
            {result.success ? (
              <div
                className="rounded-xl p-4 border"
                style={{ borderColor: accentHex + '40', backgroundColor: accentHex + '15' }}
              >
                <div className="text-2xl mb-1">&#10003;</div>
                <p className="text-white font-medium">Claim successful!</p>
                <p className="text-white/50 text-sm mt-2">
                  This device is now the guardian of {landmark?.name || 'this place'}.
                  You can post events and specials from the map view.
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10">
                <p className="text-red-300 text-sm">{result.error || 'Claim failed'}</p>
                <p className="text-white/40 text-xs mt-2">
                  The secret may be invalid or this place is already claimed by another device.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Link back */}
        <a
          href="/"
          className="inline-block text-sm px-4 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 transition-colors"
        >
          Explore the neighborhood &rarr;
        </a>
      </div>
    </div>
  )
}
