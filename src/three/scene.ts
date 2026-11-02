/**
 * The Three.js graveyard scene: renderer, moody low camera, moonlit fog,
 * lighting, ground plane, and OrbitControls. Exposes a render loop that pauses
 * when the tab is hidden and throttles to a low idle framerate when the user
 * stops interacting (Requirement 6.3), then returns a disposer.
 *
 * The scene is deliberately decoupled from the store — the reconciler
 * (grave-reconciler.ts) owns the store subscription and mutates this scene.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  graveyard: THREE.Group;
  /** request a few active frames (e.g. after a store change or animation). */
  wake: () => void;
  /** register a per-frame callback; returns an unregister fn. */
  onFrame: (cb: (dt: number) => void) => () => void;
  dispose: () => void;
}

const IDLE_FPS = 8;
const ACTIVE_MS = 1200; // keep rendering at full rate this long after a wake

export function createScene(container: HTMLElement): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  // Moonlit fog — density tuned so distant graves fade into dusk.
  scene.fog = new THREE.FogExp2(0x0b0d12, 0.035);

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    200,
  );
  // Low, moody framing near ground level looking slightly up.
  camera.position.set(0, 2.2, 9);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49; // don't go below the ground
  controls.minDistance = 3;
  controls.maxDistance = 40;
  controls.target.set(0, 1, 0);

  // --- lighting ---
  const moon = new THREE.DirectionalLight(0xaecbe6, 0.8);
  moon.position.set(-6, 12, 4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 60;
  const d = 25;
  moon.shadow.camera.left = -d;
  moon.shadow.camera.right = d;
  moon.shadow.camera.top = d;
  moon.shadow.camera.bottom = -d;
  scene.add(moon);

  const ambient = new THREE.HemisphereLight(0x5a6b8c, 0x1a140e, 0.5);
  scene.add(ambient);

  // --- ground ---
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2419, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Container group for graves so the reconciler has a stable parent.
  const graveyard = new THREE.Group();
  scene.add(graveyard);

  // --- render loop with idle throttling + tab-visibility pause ---
  const frameCbs = new Set<(dt: number) => void>();
  let running = true;
  let rafId = 0;
  let lastTime = performance.now();
  let lastActiveWake = performance.now();
  let idleAccum = 0;
  const clock = new THREE.Clock();

  function wake(): void {
    lastActiveWake = performance.now();
  }
  controls.addEventListener('start', wake);
  controls.addEventListener('change', wake);

  function frame(): void {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const now = performance.now();
    const sinceWake = now - lastActiveWake;
    const active = sinceWake < ACTIVE_MS;

    // When idle, throttle to IDLE_FPS by skipping frames.
    if (!active) {
      idleAccum += now - lastTime;
      lastTime = now;
      if (idleAccum < 1000 / IDLE_FPS) return;
      idleAccum = 0;
    } else {
      lastTime = now;
    }

    const dt = clock.getDelta();
    controls.update();
    for (const cb of frameCbs) cb(dt);
    renderer.render(scene, camera);
  }

  function onVisibility(): void {
    if (document.hidden) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    } else if (!running) {
      running = true;
      lastTime = performance.now();
      clock.getDelta(); // reset delta so we don't jump
      wake();
      frame();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onResize(): void {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    wake();
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  frame();

  function onFrame(cb: (dt: number) => void): () => void {
    frameCbs.add(cb);
    return () => frameCbs.delete(cb);
  }

  function dispose(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibility);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    groundGeo.dispose();
    groundMat.dispose();
    renderer.domElement.remove();
  }

  return { scene, camera, renderer, controls, graveyard, wake, onFrame, dispose };
}
