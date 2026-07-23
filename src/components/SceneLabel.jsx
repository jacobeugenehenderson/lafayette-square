import { Text } from '@react-three/drei'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

// Shared street label renderer — a DUMB drawer. drei <Text> (TroikaText/SDF)
// sized in world units, so labels live inside the cartographic surface and
// scale with the map like everything else painted on the ground. The
// `fontSize` is computed upstream by the shared layout module (labelLayout.js,
// the size law k × widthM); SceneLabel just draws the given text at the given
// size + panel style. Landmark labels (e.g. LAFAYETTE PARK) are authored
// directly in their own components — singular, not part of this system.
//
// renderOrder=16 matches MapLayers PRI.labels so labels sit at the
// top of the transparent queue and don't get painted over by
// terrain-displaced ground or median grass.
const RENDER_ORDER = 16

export default function SceneLabel({ position, rotation, text, fontSize = 4 }) {
  const style = useCartographStore(s => s.labels) || {}

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
      outlineWidth={`${((style.haloWidth ?? 0.07) * 100).toFixed(1)}%`}
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
