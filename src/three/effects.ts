/**
 * Signature-moment effects: the rising ghost (laying-to-rest) and the dust
 * burst (exhume). Both are procedural — no downloaded assets.
 *
 * Each effect is self-contained: construct it, add its object3d to the scene,
 * call update(dt) each frame, and remove+dispose when done() returns true.
 */
import * as THREE from 'three';

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
  const group = new THREE.Group();
  group.position.copy(origin);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xcfeef2,
    emissive: new THREE.Color(0x8fd4dc),
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  // Body: a tapered sheeted wisp (cone) with a rounded head.
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 10, 1, true), mat);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat);
  head.position.y = 1.15;
  // Two little void eyes so it reads as a face on video.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x15303a, transparent: true, opacity: 0 });
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.11, 1.18, 0.28);
  eyeR.position.set(0.11, 1.18, 0.28);

  group.add(body, head, eyeL, eyeR);

  let t = 0;
  const LIFE = 2.6;

  function update(dt: number): void {
    t += dt;
    const p = Math.min(1, t / LIFE);
    // ease: quick fade-in, long fade-out
    const alpha = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
    mat.opacity = Math.max(0, alpha) * 0.85;
    eyeMat.opacity = mat.opacity;
    // rise and sway
    group.position.y = origin.y + p * 3.2;
    group.position.x = origin.x + Math.sin(t * 2) * 0.25;
    group.rotation.y = t * 0.8;
    const s = 1 + p * 0.5;
    group.scale.setScalar(s);
  }

  function done(): boolean {
    return t >= LIFE;
  }

  function dispose(): void {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  return { object: group, update, done, dispose };
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
