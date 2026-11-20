/**
 * Procedural ghost — shared by the laying-to-rest ghost (effects.ts) and the
 * pacing spirit that haunts overdue graves (grave.ts). No downloaded assets.
 *
 * Shape: a lathed "sheet ghost" silhouette (round head, shoulders, flared
 * hem). All motion lives in the shader so the CPU only writes a few uniforms
 * per frame (no allocation):
 *  - the hem ripples and tatters, and dissolves into wisps toward the ground;
 *  - side "sleeves" billow out like raised arms;
 *  - the lower body trails behind horizontal motion (uSway);
 *  - a fresnel rim glow (picked up by bloom) with a translucent core and
 *    slowly rising ectoplasm streaks;
 *  - hollow eyes and a wailing mouth painted on the front of the head.
 *
 * The geometry is shared; materials are per ghost because their uniforms
 * (time, opacity, sway) animate independently.
 */
import * as THREE from 'three';

/** Nominal height of the ghost geometry (hem at y=0). */
export const GHOST_HEIGHT = 1.52;

let sharedGeo: THREE.LatheGeometry | null = null;

/** The shared ghost body geometry (built on first use). */
export function ghostGeometry(): THREE.LatheGeometry {
  if (sharedGeo) return sharedGeo;
  const pts: THREE.Vector2[] = [
    // flared, open hem → narrowing waist → shoulders
    new THREE.Vector2(0.46, 0.0),
    new THREE.Vector2(0.41, 0.12),
    new THREE.Vector2(0.35, 0.32),
    new THREE.Vector2(0.31, 0.55),
    new THREE.Vector2(0.305, 0.78),
    new THREE.Vector2(0.285, 0.95),
  ];
  // round head: arc of radius 0.3 centred at y=1.22, from -30° to the crown
  const R = 0.3;
  const CY = 1.22;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const a = THREE.MathUtils.degToRad(-30 + (120 * i) / steps);
    pts.push(new THREE.Vector2(Math.max(0.001, R * Math.cos(a)), CY + R * Math.sin(a)));
  }
  sharedGeo = new THREE.LatheGeometry(pts, 40);
  return sharedGeo;
}

/** Free the shared ghost geometry (when the 3D layer is torn down). */
export function disposeGhostResources(): void {
  sharedGeo?.dispose();
  sharedGeo = null;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uPhase;
  uniform float uSway;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vAngle;

  void main() {
    vec3 p = position;
    vObj = position;
    float a = atan(p.x, p.z); // 0 = facing +z (the face)
    vAngle = a;
    float t = uTime + uPhase;

    // Rippling, tattered hem (strongest at the bottom edge).
    float hem = 1.0 - smoothstep(0.0, 0.55, p.y);
    float wave = sin(a * 5.0 + t * 3.0) * 0.07 + sin(a * 11.0 - t * 4.3) * 0.035;
    p.y += wave * hem;
    p.xz *= 1.0 + sin(a * 7.0 + t * 2.2) * 0.08 * hem;

    // Billowing sleeves on either side, like half-raised arms.
    float side = smoothstep(0.7, 1.0, abs(sin(a)));
    float armBand = smoothstep(0.5, 0.72, p.y) * (1.0 - smoothstep(0.82, 1.0, p.y));
    p.xz *= 1.0 + side * armBand * (0.3 + 0.08 * sin(t * 2.0));
    p.y += side * armBand * 0.06 * sin(t * 2.0 + a);

    // Lower body trails behind horizontal motion; gentle breathing sway.
    float tail = pow(1.0 - clamp(p.y / ${GHOST_HEIGHT.toFixed(2)}, 0.0, 1.0), 2.0);
    p.x -= uSway * 0.22 * tail;
    p.z -= 0.08 * tail * sin(t * 1.3);

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPhase;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vAngle;

  float blob(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.65, 1.0, length((p - c) / r));
  }

  void main() {
    float t = uTime + uPhase;
    vec3 n = normalize(vNormalV) * (gl_FrontFacing ? 1.0 : -1.0);
    float fres = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.2);

    // Translucent core, glowing rim, rising ectoplasm streaks.
    float body = 0.18 + 0.82 * fres;
    float streak = 0.82 + 0.18 * sin(vAngle * 6.0 + vObj.y * 9.0 - t * 2.0);
    // The hem dissolves into wisps near the ground.
    float hemFade = smoothstep(0.0, 0.5, vObj.y)
      * (0.75 + 0.25 * sin(vAngle * 9.0 + t * 1.7));

    vec3 col = mix(uColor, uRim, fres);
    if (!gl_FrontFacing) col *= 0.5; // inner sheet reads dimmer
    float alpha = body * streak * hemFade;

    // Face: two hollow eyes and a wailing "O" mouth on the front of the head.
    float front = gl_FrontFacing ? smoothstep(0.14, 0.22, vObj.z) : 0.0;
    vec2 f = vObj.xy;
    float mouthH = 0.065 + 0.018 * sin(t * 2.5);
    float face = max(
      max(blob(f, vec2(-0.1, 1.28), vec2(0.052, 0.075)),
          blob(f, vec2(0.1, 1.28), vec2(0.052, 0.075))),
      blob(f, vec2(0.0, 1.12), vec2(0.045, mouthH))
    ) * front;
    col = mix(col, vec3(0.02, 0.05, 0.08), face);
    alpha = mix(alpha, 0.92, face);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface GhostOptions {
  /** core colour (sRGB hex). */
  color: number;
  /** rim glow colour (sRGB hex). */
  rim: number;
  /** multiplier on the rim so it crosses the bloom threshold. */
  rimIntensity: number;
  phase?: number;
}

export interface GhostUniforms {
  uTime: { value: number };
  uPhase: { value: number };
  uSway: { value: number };
  uOpacity: { value: number };
}

/** A per-ghost shader material. Write uniforms each frame; never reallocate. */
export function createGhostMaterial(opts: GhostOptions): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uPhase: { value: opts.phase ?? 0 },
      uSway: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(opts.color) },
      uRim: { value: new THREE.Color(opts.rim).multiplyScalar(opts.rimIntensity) },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/** Typed access to a ghost material's animated uniforms. */
export function ghostUniforms(mat: THREE.ShaderMaterial): GhostUniforms {
  return mat.uniforms as unknown as GhostUniforms;
}
