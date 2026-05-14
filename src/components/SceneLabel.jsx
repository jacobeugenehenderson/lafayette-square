import { Text } from '@react-three/drei'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

// Shared street label renderer. drei <Text> (TroikaText/SDF) sized in
// world units — labels live inside the cartographic surface, scaling
// with the map like everything else painted on the ground. Each label
// gets a width multiplier from its chain's measured pavement width so
// wide arterials read bigger than narrow residentials. Landmark labels
// (e.g. LAFAYETTE PARK) are authored directly in their own components,
// not through SceneLabel — they're singular and don't share this
// system's parametric assumptions.
//
// renderOrder=16 matches MapLayers PRI.labels so labels sit at the
// top of the transparent queue and don't get painted over by
// terrain-displaced ground or median grass.
const RENDER_ORDER = 16

// Street-label widths typically span 4–18 m in LS (Truman one-side at 4 m
// up to Lafayette at 18 m). Reference 12 m lands a typical residential
// (~13 m total) right at 1×, and clamps stop extremes from dominating.
const STREET_REFERENCE_WIDTH_M = 12
const STREET_WIDTH_MUL_MIN = 0.5
const STREET_WIDTH_MUL_MAX = 2.0

export default function SceneLabel({ position, rotation, text, widthM = null }) {
  const style = useCartographStore(s => s.labels) || {}
  const size = style.size ?? 4
  const widthMul = widthM
    ? Math.max(STREET_WIDTH_MUL_MIN, Math.min(STREET_WIDTH_MUL_MAX, widthM / STREET_REFERENCE_WIDTH_M))
    : 1
  const fontSize = size * widthMul

  const caseMode = style.case ?? 'mixed'
  const displayText = caseMode === 'upper' ? String(text).toUpperCase()
                    : caseMode === 'lower' ? String(text).toLowerCase()
                    : text
  // Derive Troika `font` URL from fontsource id + weight. Empty family
  // = Troika's built-in default (Roboto). If the chosen family doesn't
  // publish the chosen weight, the load fails and Troika falls back.
  const family = (style.fontFamily || '').trim()
  const weight = style.weight || 400
  const fontUrl = family
    ? `https://cdn.jsdelivr.net/fontsource/fonts/${family}@latest/latin-${weight}-normal.ttf`
    : undefined

  return (
    <Text
      position={position}
      rotation={rotation || [0, 0, 0]}
      fontSize={fontSize}
      font={fontUrl}
      color={style.fill ?? '#e8e8f0'}
      outlineWidth={style.haloWidth ?? 0.07}
      outlineColor={style.halo ?? '#14141c'}
      letterSpacing={style.letterSpacing ?? 0.05}
      fillOpacity={style.opacity ?? 1}
      outlineOpacity={style.opacity ?? 1}
      anchorX="center"
      anchorY="middle"
      renderOrder={RENDER_ORDER}
    >
      {displayText}
    </Text>
  )
}
