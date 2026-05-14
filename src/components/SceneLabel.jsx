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

export default function SceneLabel({ position, rotation, text, tier = 'street' }) {
  const style = useCartographStore(s => s.labels) || {}
  const size = style.size ?? 4
  const tierMul = (style.tierScale && style.tierScale[tier]) ?? 1
  const fontSize = size * tierMul

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
