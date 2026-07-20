/**
 * Run CityModel's real onBeforeCompile against three's actual MeshStandardMaterial
 * shader source and inspect the result. A malformed onBeforeCompile does not throw
 * — it produces a shader that fails to link, which shows up as a BLACK SCREEN.
 * (`blank/black render? CHECK SHADER COMPILE FIRST`.)
 *
 * ⚠️ This file HAND-COPIES CityModel's shader strings, so it can drift from the
 * component (it already did once — a stale vertex declaration list produced a
 * false failure). If a check here fails, confirm against the component before
 * believing it.
 */
import * as THREE from 'three'
import { applyWeatherToShader } from '../src/lib/weather-uniforms.js'

const WALL_HEX='#8d5a49', ROOF_HEX='#4a4a52', XRAY_DIST=12, XRAY_BAND=9
const GLSL_OVERLAY = `
vec3 cmOverlay(vec3 base, vec3 tex) {
  return mix(2.0 * base * tex, 1.0 - 2.0 * (1.0 - base) * (1.0 - tex), step(0.5, base));
}`
const wallTex = {}, roofTex = {}   // pretend both loaded (desktop path)
const src = THREE.ShaderLib.physical
const shader = {
  uniforms: THREE.UniformsUtils.clone(src.uniforms),
  vertexShader: src.vertexShader,
  fragmentShader: src.fragmentShader,
}
// ── verbatim from CityModel.jsx ──
const wall = new THREE.Color(WALL_HEX).convertSRGBToLinear()
const roof = new THREE.Color(ROOF_HEX).convertSRGBToLinear()
const hsl = {}
wall.getHSL(hsl)
const wallNight = new THREE.Color().setHSL(hsl.h + 0.03, hsl.s * 0.55, hsl.l * 0.32)
applyWeatherToShader(shader)
shader.uniforms.uWallColor={value:wall}; shader.uniforms.uWallNight={value:wallNight}
shader.uniforms.uRoofColor={value:roof}; shader.uniforms.uDarkFactor={value:0}
shader.uniforms.uSelectedId={value:-1}; shader.uniforms.uHoveredId={value:-1}
shader.uniforms.uCamPos={value:new THREE.Vector3()}
shader.uniforms.uDissolveDist={value:XRAY_DIST}; shader.uniforms.uDissolveBand={value:XRAY_BAND}
shader.vertexShader = shader.vertexShader
  .replace('#include <common>', `#include <common>\nattribute float aRoof;\nattribute float aBuildingId;\nvarying float vRoof;\nvarying float vBId;\nvarying vec3 vBPos;\nvarying vec3 vBNorm;`)
  .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRoof = aRoof;\nvBId = aBuildingId;\nvBPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvBNorm = normalize(mat3(modelMatrix) * normal);`)
shader.fragmentShader = shader.fragmentShader
  .replace('#include <common>', `#include <common>\nvarying float vRoof;\nvarying float vBId;\nvarying vec3 vBPos;\nvarying vec3 vBNorm;\nuniform sampler2D uWallTex;\nuniform sampler2D uRoofTex;\nuniform float uTexStrength;\nuniform float uTexScale;\n${GLSL_OVERLAY}\nuniform vec3 uWallColor;\nuniform vec3 uWallNight;\nuniform vec3 uRoofColor;\nuniform float uDarkFactor;\nuniform float uSelectedId;\nuniform float uHoveredId;\nuniform vec3 uCamPos;\nuniform float uDissolveDist;\nuniform float uDissolveBand;`)
  .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (uDissolveDist > 0.0) { float camDist = distance(vBPos, uCamPos); float keep = smoothstep(uDissolveDist, uDissolveDist + uDissolveBand, camDist); if (keep < 1.0) { float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (keep < ign) discard; } }`)
  .replace('#include <color_fragment>', `#include <color_fragment>
vec3 cmWall = mix(uWallColor, uWallNight, uDarkFactor);
vec3 cmRoof = uRoofColor * (1.0 - uDarkFactor * 0.75);
vec2 wuv = (abs(vBNorm.x) > abs(vBNorm.z)) ? vec2(vBPos.z, vBPos.y) * 0.25 / uTexScale : vec2(vBPos.x, vBPos.y) * 0.25 / uTexScale;
vec3 wts = texture2D(uWallTex, wuv).rgb;
cmWall = mix(cmWall, cmOverlay(cmWall, wts), uTexStrength);
vec2 ruv = vBPos.xz * 0.2 / uTexScale;
vec3 rts = texture2D(uRoofTex, ruv).rgb;
cmRoof = mix(cmRoof, cmOverlay(cmRoof, rts), uTexStrength);
diffuseColor.rgb *= mix(cmWall, cmRoof, step(0.5, vRoof));`)
  .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nfloat selT = step(abs(vBId - uSelectedId), 0.5);\nfloat hovT = step(abs(vBId - uHoveredId), 0.5);\ntotalEmissiveRadiance += vec3(selT * 0.2 + (1.0 - selT) * hovT * 0.133);`)

const V=shader.vertexShader, F=shader.fragmentShader
let bad=0
const chk=(ok,msg)=>{ console.log(`  ${ok?'✓':'⛔'} ${msg}`); if(!ok) bad++ }

chk(V.includes('attribute float aRoof'),'vertex: aRoof declared')
chk(V.includes('attribute float aBuildingId'),'vertex: aBuildingId declared')
chk(V.includes('vBPos = (modelMatrix'),'vertex: vBPos assigned')
chk(V.includes('vWeatherWorldNormal ='),'vertex: weather body injected')
chk(F.includes('uniform vec3 uWallNight'),'frag: night uniform declared')
chk(F.includes('diffuseColor.rgb *= mix(cmWall, cmRoof'),'frag: albedo+night applied')
chk(F.includes('totalEmissiveRadiance += vec3(selT'),'frag: selection emissive applied')
chk(F.includes('if (keep < ign) discard;'),'frag: x-ray dissolve applied')
chk(F.includes('uWetness'),'frag: weather uniforms present')
chk(F.includes('cmOverlay(cmWall, wts)'),'frag: wall texture overlay applied')
chk(F.includes('cmOverlay(cmRoof, rts)'),'frag: roof texture overlay applied')
chk((F.match(/vec3 cmOverlay\(/g)||[]).length===1,'frag: cmOverlay defined exactly once')
chk(F.indexOf('vec3 cmOverlay(') < F.indexOf('cmOverlay(cmWall'),'frag: cmOverlay defined BEFORE use')

// ordering: albedo must run BEFORE the weather body (matches the live building)
const iAlbedo=F.indexOf('cmWall'), iWeather=F.indexOf('uWetness', F.indexOf('#include <color_fragment>'))
chk(iAlbedo>0 && iWeather>iAlbedo, `frag: albedo (${iAlbedo}) precedes weather body (${iWeather})`)

// every varying used in frag must be declared exactly once in each stage
for (const v of ['vRoof','vBId','vBPos','vBNorm','vWeatherWorldNormal']) {
  const dv=(V.match(new RegExp(`varying [\\w]+ ${v}\\b`,'g'))||[]).length
  const df=(F.match(new RegExp(`varying [\\w]+ ${v}\\b`,'g'))||[]).length
  chk(dv===1&&df===1, `varying ${v}: declared ${dv}× vertex / ${df}× fragment (want 1/1)`)
}
for (const s of [['vertex',V],['fragment',F]]) {
  const o=(s[1].match(/{/g)||[]).length, c=(s[1].match(/}/g)||[]).length
  chk(o===c, `${s[0]}: braces balanced (${o}/${c})`)
}
console.log(bad? `\n  ⛔ ${bad} problem(s)` : '\n  ✅ shader patches structurally sound')
