/**
 * graniteMasonryMaterial — the `granite` surface (`cartograph/surfaces.mjs`): coursed,
 * split-face granite for a set-piece. First wearer: the Pilgrim Monument placeholder.
 *
 * INPUTS, each from the surface's settings model (never typed in here):
 *   beds      bed-joint heights in METRES above the set-piece datum, ascending (a table
 *             drawn within the cited course range; `courseBeds` in src/setpieces/pilgrimMonument.js)
 *   jointM    joint width (finding f-pilgrim-joint-width: "not over 1″", drawn at the maximum)
 *   reliefM   split-face relief depth (authored; 0 = flat)
 *   toneVar   stone-to-stone tone variation (authored; 0 = uniform)
 *   jointShade the mortar joint's albedo as a multiple of the stone's (d-pilgrim-joint-shade,
 *             I: derived from the documented 1:3 Portland:sand mix; the colour is not documented)
 *   bond      { lengthDepths, lapDepths }: stone length and joint stagger, in multiples of
 *             the course's own depth (running bond; d-pilgrim-stone-length, from Baker 1908).
 *             null ⇒ no vertical joints: a length nobody sourced is never drawn.
 * The geometry must be in set-piece-local metres (y = height above the datum), so the
 * coursing runs continuously across every mesh.
 *
 * THE ENVIRONMENT IS IMPORTED, never re-implemented: the scene's own lights light it, wet
 * and snow come from `applyWeatherToShader` (the socket SlabBuildings uses), and cascaded
 * shadows compose through `attachCSM`.
 *
 * ⭐ The joints and seams are drawn from the sourced geometry at EVERY authored value: the
 * neutral (relief 0, tone 0) hides the look (split-face roughness, stone tones), never the
 * data. It was the other way round for one day, and Jacob saw a plain grey tower.
 * The town authors the look in `design.json#surfaces.params['pilgrim-granite']`.
 */
import * as THREE from 'three'
import { applyWeatherToShader } from '../lib/weather-uniforms.js'
import { attachCSM } from './CascadedShadows.jsx'
import { SURFACE_NOISE_GLSL } from './grassMaterial.js'

export function makeGraniteMasonryMaterial({ beds, jointM, jointShade, bond = null, reliefM = 0, toneVar = 0, color }) {
  if (!beds?.length || beds.length < 2) throw new Error('⛔ makeGraniteMasonryMaterial: no course table')
  if (!(jointM > 0)) throw new Error('⛔ makeGraniteMasonryMaterial: no joint width')
  if (!color) throw new Error('⛔ makeGraniteMasonryMaterial: no stone colour')
  if (!(jointShade > 0)) throw new Error('⛔ makeGraniteMasonryMaterial: no joint shade (d-pilgrim-joint-shade)')
  const bedTex = new THREE.DataTexture(new Float32Array(beds), beds.length, 1, THREE.RedFormat, THREE.FloatType)
  bedTex.minFilter = bedTex.magFilter = THREE.NearestFilter
  bedTex.needsUpdate = true
  // Enough halvings to search the whole table.
  const steps = Math.ceil(Math.log2(beds.length)) + 1

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uBeds: { value: bedTex }, uBedCount: { value: beds.length },
      uJointM: { value: jointM }, uReliefM: { value: reliefM }, uToneVar: { value: toneVar },
      uJointShade: { value: jointShade },
      uBondLen: { value: bond?.lengthDepths ?? 0 }, uBondLap: { value: bond?.lapDepths ?? 0 },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMasonryPos;\nvarying vec3 vMasonryNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMasonryPos = position;\nvMasonryNrm = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uBeds; uniform float uBedCount;
        uniform float uJointM, uReliefM, uToneVar, uBondLen, uBondLap, uJointShade;
        varying vec3 vMasonryPos; varying vec3 vMasonryNrm;
        ${SURFACE_NOISE_GLSL}
        float mBed(float i) { return texelFetch(uBeds, ivec2(int(i), 0), 0).r; }
        // x = course index, y = its bed, z = the bed above. Binary search of the table.
        vec3 mCourse(float y) {
          float lo = 0.0, hi = uBedCount - 1.0;
          for (int k = 0; k < ${steps}; k++) { float mid = floor((lo + hi) * 0.5); if (mBed(mid) <= y) lo = mid; else hi = mid; }
          return vec3(lo, mBed(lo), mBed(lo + 1.0));
        }
        // The face's own 2-D frame: along the wall × up, so noise never smears on a vertical face.
        vec2 mFace() {
          vec3 n = abs(vMasonryNrm);
          if (n.y > 0.5) return vMasonryPos.xz;
          return vec2(n.x > n.z ? vMasonryPos.z : vMasonryPos.x, vMasonryPos.y);
        }
        // Along a course: which stone, and the distance to its nearest side joint (metres).
        // Running bond: alternate courses shift by the lap, so no joint sits over another.
        vec2 mStone(vec3 c) {
          if (uBondLen <= 0.0) return vec2(0.0, 1e3);
          float ch = c.z - c.y, L = uBondLen * ch;
          float u = mFace().x + mod(c.x, 2.0) * uBondLap * ch;
          float s = u / L;
          return vec2(floor(s), min(fract(s), 1.0 - fract(s)) * L);
        }
        // 1 on a joint (bed or side), 0 on the stone face. GEOMETRY ONLY: the joint is sourced
        // (width f-pilgrim-joint-width, beds, bond), so no authored value can switch it off.
        float mJoint(vec3 c) {
          float d = min(vMasonryPos.y - c.y, c.z - vMasonryPos.y);
          float aa = fwidth(vMasonryPos.y);
          float j = 1.0 - smoothstep(uJointM * 0.5 - aa, uJointM * 0.5 + aa, d);
          vec2 st = mStone(c);
          float aau = fwidth(mFace().x);
          return max(j, 1.0 - smoothstep(uJointM * 0.5 - aau, uJointM * 0.5 + aau, st.y));
        }
        bool mCoursed() { return abs(vMasonryNrm.y) < 0.5 && vMasonryPos.y >= 0.0 && vMasonryPos.y <= mBed(uBedCount - 1.0); }
        // The split face as a height field (metres), recessed at the joints. Features are
        // sized in COURSE HEIGHTS, so the texture follows the stone it sits on.
        float mHeight() {
          vec2 fp = mFace();
          if (!mCoursed()) return uReliefM * (gFBM(fp * 2.0) - 0.5);
          vec3 c = mCourse(vMasonryPos.y);
          float ch = c.z - c.y;
          float joint = mJoint(c);
          vec2 st = mStone(c);
          float split = gFBM(fp / ch * 2.0 + c.x * 13.1 + st.x * 7.3) - 0.5;
          return uReliefM * (split - joint);
        }`)
      // Albedo: one tone per course, a quieter mottle within it. After the map stage so the
      // weather socket (after <color_fragment>) still sees the final stone colour.
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (mCoursed()) {
          vec3 c = mCourse(vMasonryPos.y);
          float tone = gHash(vec2(c.x, 17.0 + mStone(c).x)) - 0.5;   // one tone per STONE
          float mottle = gFBM(mFace() / (c.z - c.y) * 3.0 + c.x) - 0.5;
          diffuseColor.rgb *= 1.0 + uToneVar * (tone + 0.5 * mottle);
          // The mortar joint, at every authored value (relief only adds its cast shadow).
          diffuseColor.rgb *= mix(1.0, uJointShade, mJoint(c));
        }`)
      // Relief: bump the normal from the height field's screen derivatives.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uReliefM > 0.0) {
          float h = mHeight();
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
    applyWeatherToShader(shader)
  }
  // Authored values change live (the lab's controls, a re-baked scene) without a recompile.
  const obc = mat.onBeforeCompile
  mat.onBeforeCompile = function (shader, renderer) {
    obc.call(this, shader, renderer)
    mat.userData.__shader = shader
    const a = mat.userData.__authored
    if (a) { shader.uniforms.uReliefM.value = a.reliefM; shader.uniforms.uToneVar.value = a.toneVar }
  }
  mat.userData.setAuthored = ({ reliefM: r, toneVar: t }) => {
    mat.userData.__authored = { reliefM: r, toneVar: t }
    const sh = mat.userData.__shader
    if (sh) { sh.uniforms.uReliefM.value = r; sh.uniforms.uToneVar.value = t }
  }
  mat.customProgramCacheKey = () => `granite-masonry-${beds.length}`
  attachCSM(mat)   // last: it composes onto whatever onBeforeCompile is in place
  return mat
}
