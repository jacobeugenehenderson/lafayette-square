import { useEffect, useState } from 'react'
import useLocalStatus from '../hooks/useLocalStatus'
import useListings from '../hooks/useListings'
import CATEGORIES from '../tokens/categories'

export default function CheckinPage({ locationId }) {
  const { isLocal, distinctDays, threshold, loading, checkin } = useLocalStatus()
  const getById = useListings((s) => s.getById)
  const [result, setResult] = useState(null)
  const [fired, setFired] = useState(false)
  const landmark = getById(locationId)
  const cat = landmark ? CATEGORIES[landmark.category] : null

  useEffect(() => {
    if (fired) return
    setFired(true)
    checkin(locationId).then(setResult)
  }, [locationId, fired, checkin])

  const accentHex = cat?.hex || '#8b5cf6'
  const emoji = cat?.emoji || '\ud83d\udccd'

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-center space-y-5">
        {/* Header */}
        <div>
          <div className="text-4xl mb-2">{emoji}</div>
          <h1 className="text-xl font-semibold text-white">
            {landmark ? landmark.name : 'Lafayette Square'}
          </h1>
          {landmark && (
            <p className="text-sm text-white/50 mt-1">{landmark.address}</p>
          )}
        </div>

        {/* Status */}
        {loading && (
          <div className="flex items-center justify-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Checking in...
          </div>
        )}

        {!loading && result && (
          <div className="space-y-4">
            {result.logged !== false ? (
              <div
                className="rounded-xl p-4 border"
                style={{ borderColor: accentHex + '40', backgroundColor: accentHex + '15' }}
              >
                <div className="text-2xl mb-1">&#10003;</div>
                <p className="text-white font-medium">Check-in recorded!</p>
              </div>
            ) : (
              <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10">
                <p className="text-red-300 text-sm">{result.error || 'Something went wrong'}</p>
              </div>
            )}

            {/* Progress toward local */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-white/50">
                <span>Local progress</span>
                <span>{distinctDays} / {threshold} days</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
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
          </div>
        )}

        {/* Link back to map */}
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
