import { Text } from '@react-three/drei'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

// Shared text label renderer. drei <Text> (TroikaText/SDF) sized in
// world units — labels live inside the cartographic surface, scaling
// with the map like everything else painted on the ground.
//
// `tier` ('street' | 'park') multiplies the base size via
// labels.tierScale[tier]. New tiers (landmark, poi, …) add an entry
// there — no renderer change.
//
// renderOrder=16 carries over from the retired canvas-sprite
// LabelSprite layering (matches PRI.labels in MapLayers).
const RENDER_ORDER = 16

// Street-label widths typically span 4–18 m in LS (Truman one-side at 4 m
// up to Lafayette at 18 m). Reference 12 m lands a typical residential
// (~13 m total) right at 1×, and clamps stop extremes from dominating.
const STREET_REFERENCE_WIDTH_M = 12
const STREET_WIDTH_MUL_MIN = 0.5
const STREET_WIDTH_MUL_MAX = 2.0

export default function SceneLabel({ position, rotation, text, tier = 'street', widthM = null }) {
  const style = useCartographStore(s => s.labels) || {}
  const size = style.size ?? 4
  const tierMul = (style.tierScale && style.tierScale[tier]) ?? 1
  // Width-aware sizing for street tier — bigger pavement, bigger label.
  // Park (and any future fixed-size tier) ignores widthM.
  const widthMul = (tier === 'street' && widthM)
    ? Math.max(STREET_WIDTH_MUL_MIN, Math.min(STREET_WIDTH_MUL_MAX, widthM / STREET_REFERENCE_WIDTH_M))
    : 1
  const fontSize = size * tierMul * widthMul

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

  // Halo is authored in absolute world meters so a 0.3 m outline reads
  // the same on every label regardless of fontSize. Troika's
  // outlineWidth wants fontSize-relative, so divide here.
  const haloMeters = style.haloWidth ?? 0.3
  const haloRel = fontSize > 0 ? haloMeters / fontSize : 0
  return (
    <Text
      position={position}
      rotation={rotation || [0, 0, 0]}
      fontSize={fontSize}
      font={fontUrl}
      color={style.fill ?? '#e8e8f0'}
      outlineWidth={haloRel}
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
