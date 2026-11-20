/**
 * Signature-moment effects: the rising ghost (laying-to-rest) and the dust
 * burst (exhume). Both are procedural — no downloaded assets.
 *
 * Each effect is self-contained: construct it, add its object3d to the scene,
 * call update(dt) each frame, and remove+dispose when done() returns true.
 */
import * as THREE from 'three';
import { createGhostMaterial, ghostGeometry, ghostUniforms } from './ghost';

export interface Effect {
  object: THREE.Object3D;
  update: (dt: number) => void;
  done: () => boolean;
  dispose: () => void;
}

/**
 * A translucent ghost that rises from a grave, drifting and fading into the
 * fog — the climax of "laying to rest" (Signature Moment 1).
 */
export function createGhost(origin: THREE.Vector3): Effect {
  // Root stays at the grave; the ghost body rises inside it while ectoplasm
  // motes are shed in root-local space so they trail behind, not follow.
  const root = new THREE.Group();
  root.position.copy(origin);

  const mat = createGhostMaterial({
    color: 0xb8e6ee,
    rim: 0xd8fbff,
    rimIntensity: 1.8,
    phase: Math.random() * Math.PI * 2,
  });
  const u = ghostUniforms(mat);
  const ghost = new THREE.Mesh(ghostGeometry(), mat);
  ghost.renderOrder = 2;
  root.add(ghost);

  // --- ectoplasm motes (preallocated; no per-frame allocation) ---
  const MOTES = 28;
  const MOTE_LIFE = 1.4;
  const pos = new Float32Array(MOTES * 3);
  const alphaAttr = new Float32Array(MOTES);
  const vel = new Float32Array(MOTES * 3);
  const age = new Float32Array(MOTES).fill(MOTE_LIFE); // start "dead"
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  moteGeo.setAttribute('alpha', new THREE.BufferAttribute(alphaAttr, 1));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xd8fbff).multiplyScalar(1.6) } },
    vertexShader: /* glsl */ `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 60.0 / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  root.add(motes);

  let t = 0;
  let spawnAcc = 0;
  let nextMote = 0;
  const LIFE = 2.8;

  function update(dt: number): void {
    t += dt;
    const p = Math.min(1, t / LIFE);
    // ease: quick fade-in, long fade-out
    const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
    u.uOpacity.value = Math.max(0, alpha) * 0.9;
    u.uTime.value = t;

    // Rise with an ease-out, swaying; the tail trails the sway velocity.
    const rise = 1 - (1 - p) * (1 - p);
    ghost.position.y = rise * 3.4;
    ghost.position.x = Math.sin(t * 2) * 0.25;
    u.uSway.value = Math.cos(t * 2) * 0.8 + 0.2;
    // Keep the face mostly toward the viewer: oscillate instead of spinning.
    ghost.rotation.y = Math.sin(t * 1.3) * 0.45;
    ghost.rotation.z = -Math.cos(t * 2) * 0.08; // lean into the sway
    ghost.scale.setScalar(0.9 + p * 0.45);

    // Shed motes from the hem while the ghost is still visible.
    if (p < 0.75) {
      spawnAcc += dt * 22;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const i = nextMote;
        nextMote = (nextMote + 1) % MOTES;
        const a = Math.random() * Math.PI * 2;
        const r = 0.15 + Math.random() * 0.3;
        pos[i * 3] = ghost.position.x + Math.cos(a) * r;
        pos[i * 3 + 1] = ghost.position.y + Math.random() * 0.4;
        pos[i * 3 + 2] = ghost.position.z + Math.sin(a) * r;
        vel[i * 3] = (Math.random() - 0.5) * 0.3;
        vel[i * 3 + 1] = 0.3 + Math.random() * 0.5;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        age[i] = 0;
      }
    }
    for (let i = 0; i < MOTES; i++) {
      if (age[i]! >= MOTE_LIFE) {
        alphaAttr[i] = 0;
        continue;
      }
      age[i]! += dt;
      pos[i * 3]! += vel[i * 3]! * dt;
      pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
      pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;
      alphaAttr[i] = Math.max(0, 1 - age[i]! / MOTE_LIFE) * 0.5;
    }
    moteGeo.attributes.position!.needsUpdate = true;
    moteGeo.attributes.alpha!.needsUpdate = true;
  }

  function done(): boolean {
    return t >= LIFE;
  }

  function dispose(): void {
    // ghost geometry is shared (ghost.ts) — only free per-effect resources.
    mat.dispose();
    moteGeo.dispose();
    moteMat.dispose();
  }

  return { object: root, update, done, dispose };
}

/**
 * A burst of soil/dust particles for "exhume" (Signature Moment-adjacent): the
 * grave crumbles to dust before it is removed from the scene.
 */
export function createDustBurst(origin: THREE.Vector3, count = 120): Effect {
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.6;
    positions[i * 3 + 1] = origin.y + Math.random() * 1.2;
    positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.6;
    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        1.5 + Math.random() * 2.2,
        (Math.random() - 0.5) * 1.6,
      ),
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x6b5a3e,
    size: 0.12,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);

  let t = 0;
  const LIFE = 1.3;
  const GRAVITY = -5.2;

  function update(dt: number): void {
    t += dt;
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const v = velocities[i]!;
      v.y += GRAVITY * dt;
      attr.setXYZ(
        i,
        attr.getX(i) + v.x * dt,
        Math.max(origin.y - 0.1, attr.getY(i) + v.y * dt),
        attr.getZ(i) + v.z * dt,
      );
    }
    attr.needsUpdate = true;
    mat.opacity = 0.95 * Math.max(0, 1 - t / LIFE);
  }

  function done(): boolean {
    return t >= LIFE;
  }

  function dispose(): void {
    geo.dispose();
    mat.dispose();
  }

  return { object: points, update, done, dispose };
}
