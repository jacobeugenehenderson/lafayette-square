import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'

function CompassRose() {
  const azimuth = useCamera((state) => state.azimuth)
  const viewMode = useCamera((state) => state.viewMode)
  const showCard = useSelectedBuilding((state) => state.showCard)
  const rotationDeg = (azimuth * 180) / Math.PI

  if (viewMode === 'hero' || showCard) return null

  return (
    <div className="absolute top-4 left-4 select-none z-50">
      <div className="relative w-16 h-16">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{ transform: `rotate(${rotationDeg}deg)` }}
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="rgba(0,0,0,0.6)"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />
          <g stroke="rgba(255,255,255,0.4)" strokeWidth="1">
            <line x1="50" y1="8" x2="50" y2="18" />
            <line x1="50" y1="82" x2="50" y2="92" />
            <line x1="8" y1="50" x2="18" y2="50" />
            <line x1="82" y1="50" x2="92" y2="50" />
          </g>
          <g stroke="rgba(255,255,255,0.2)" strokeWidth="1">
            <line x1="20" y1="20" x2="27" y2="27" />
            <line x1="80" y1="20" x2="73" y2="27" />
            <line x1="20" y1="80" x2="27" y2="73" />
            <line x1="80" y1="80" x2="73" y2="73" />
          </g>
          <polygon
            points="50,15 44,50 50,42 56,50"
            fill="#cc4444"
            stroke="#ff6666"
            strokeWidth="0.5"
          />
          <polygon
            points="50,85 44,50 50,58 56,50"
            fill="#888888"
            stroke="#aaaaaa"
            strokeWidth="0.5"
          />
          <polygon
            points="85,50 50,44 58,50 50,56"
            fill="#666666"
            stroke="#888888"
            strokeWidth="0.5"
          />
          <polygon
            points="15,50 50,44 42,50 50,56"
            fill="#666666"
            stroke="#888888"
            strokeWidth="0.5"
          />
          <circle cx="50" cy="50" r="4" fill="#444" stroke="#666" strokeWidth="1" />
          <text x="50" y="7" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="system-ui">N</text>
          <text x="50" y="99" textAnchor="middle" fill="#888888" fontSize="7" fontFamily="system-ui">S</text>
          <text x="97" y="53" textAnchor="middle" fill="#888888" fontSize="7" fontFamily="system-ui">E</text>
          <text x="3" y="53" textAnchor="middle" fill="#888888" fontSize="7" fontFamily="system-ui">W</text>
        </svg>
      </div>
    </div>
  )
}

export default CompassRose
