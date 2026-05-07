/**
 * useSurfaceMaterial — shared factory for any ground-plane surface that
 * needs to participate in the cartograph fade + terrain-displacement +
 * shadow-tinting pipeline.
 *
 * Lifted unchanged from StreetRibbons.jsx#makeMaterial. Both StreetRibbons
 * (legacy ribbon model) and BlockGeometryV2Debug (rounded-block-clip
 * prototype) consume this so V2 surfaces match the legacy fade-shader +
 * post-FX exactly. When StreetRibbons is eventually retired, the hook
 * stays.
 *
 * Returns a `makeMaterial(color, pri, fade, opts)` factory:
 *   - color: hex/THREE.Color base palette tone
 *   - pri:   priority (used as -polygonOffsetFactor; higher = closer to camera)
 *   - fade:  optional { center: {x,z}, inner, outer } radial-fade descriptor
 *   - opts:  { measureActive, surveyActive, selectedCorridor }
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  assignTerrainUniforms,
  TERRAIN_DECL, TERRAIN_DISPLACE, TERRAIN_NORMAL,
} from '../utils/terrainShader'

export const ARCH_BLUE = '#2250E8'

const TERRAIN_CLIP_VARYING_DECL = `varying vec3 vWorldPos;`
const TERRAIN_CLIP_VERTEX = `vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`

// Shadow-tinted flat: PBR lighting collapsed to a grayscale factor that
// scales the curated palette tone. Multiply by π undoes BRDF_Lambert's 1/π
// so #RRGGBB lands at its display-target tone in full sun.
const SHADOW_TINTED_FLAT = `
#include <lights_fragment_maps>
{
  vec3 _totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float _baseLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0005);
  float _lightMul = dot(_totalLight, vec3(0.2126, 0.7152, 0.0722)) / _baseLum * 3.14159;
  float _lightFactor = clamp(_lightMul, 0.25, 1.6);

  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.directSpecular = vec3(0.0);
  reflectedLight.indirectSpecular = vec3(0.0);
  reflectedLight.indirectDiffuse = diffuseColor.rgb * _lightFactor;
}`

// Cartograph flat — exact base colors, zero lighting (Designer view).
const CARTOGRAPH_FLAT = `
#include <lights_fragment_maps>
reflectedLight.directDiffuse = vec3(0.0);
reflectedLight.directSpecular = vec3(0.0);
reflectedLight.indirectSpecular = vec3(0.0);
reflectedLight.indirectDiffuse = diffuseColor.rgb;`

export default function useSurfaceMaterial(flat) {
  return useMemo(() => {
    const fragShader = flat ? CARTOGRAPH_FLAT : SHADOW_TINTED_FLAT
    return (color, pri, fade = null, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color: opts.surveyActive ? ARCH_BLUE : color,
        roughness: 0.9, metalness: 0, side: THREE.FrontSide,
        transparent: !!fade || !!opts.measureActive || !!opts.surveyActive || !!opts.selectedCorridor,
        // Translucency strategy:
        //   Selected corridor in Measure → 0.55
        //   Selected corridor in Survey  → 0.15
        //   Survey, unselected           → 0.28
        //   Default                      → 1.0
        opacity: opts.selectedCorridor
          ? (opts.measureActive ? 0.55 : 0.15)
          : (opts.surveyActive ? 0.28 : 1),
        polygonOffset: true, polygonOffsetFactor: -pri, polygonOffsetUnits: -pri * 4,
      })
      mat.onBeforeCompile = (shader) => {
        assignTerrainUniforms(shader)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL + (flat ? '' : '\n' + TERRAIN_CLIP_VARYING_DECL))
          .replace('#include <begin_vertex>', TERRAIN_DISPLACE + (flat ? '' : '\n' + TERRAIN_CLIP_VERTEX))
          .replace('#include <beginnormal_vertex>', TERRAIN_NORMAL)
        if (flat) {
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_maps>', fragShader)
        } else {
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + TERRAIN_CLIP_VARYING_DECL + '\n' + TERRAIN_DECL)
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_maps>', fragShader)
        }
        if (fade) {
          shader.uniforms.uFadeCenter = { value: new THREE.Vector2(fade.center.x, fade.center.z) }
          shader.uniforms.uFadeInner  = { value: fade.inner }
          shader.uniforms.uFadeOuter  = { value: fade.outer }
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorldPos;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFadeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorldPos;\nuniform vec2 uFadeCenter;\nuniform float uFadeInner;\nuniform float uFadeOuter;')
            .replace('#include <opaque_fragment>',
              '#include <opaque_fragment>\n' +
              'float _fadeR = distance(vFadeWorldPos.xz, uFadeCenter);\n' +
              'gl_FragColor.a *= 1.0 - smoothstep(uFadeInner, uFadeOuter, _fadeR);')
        }
      }
      const fadeKey = fade ? `-f${fade.inner}-${fade.outer}` : ''
      mat.customProgramCacheKey = () => (flat ? 'sr-flat' : 'sr-pbr-v3') + fadeKey
      return mat
    }
  }, [flat])
}
