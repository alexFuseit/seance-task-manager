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
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type RenderConfig } from './quality';
import { createPostFx, type PostFx } from './postfx';

/**
 * A large inward-facing sky dome with a vertical gradient (deep violet zenith →
 * warmer teal/amber horizon). A flat background colour is the biggest "dull"
 * tell for a night scene; a gradient adds depth and a horizon glow for free.
 * The world module drives `top`/`bottom`/`horizon` colours over the day/night
 * cycle, and the uniforms are updated in place (no per-frame allocation).
 */
export interface Sky {
  mesh: THREE.Mesh;
  top: THREE.Color;
  bottom: THREE.Color;
  horizon: THREE.Color;
  /** push the current .top/.bottom/.horizon colours into the shader. */
  sync: () => void;
  /** advance the starfield twinkle animation. */
  tick: (dt: number) => void;
  dispose: () => void;
}

function createSky(): Sky {
  const top = new THREE.Color(0x120a2a);
  const bottom = new THREE.Color(0x3a2f4a);
  const horizon = new THREE.Color(0x6b4a66);
  const geo = new THREE.SphereGeometry(300, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: top },
      uBottom: { value: bottom },
      uHorizon: { value: horizon },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uHorizon;
      uniform float uTime;
      varying vec3 vWorld;

      // hash for a stable per-cell pseudo-random value
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Procedural starfield over a direction. Cells the sphere's direction
      // into a grid; a sparse subset of cells host a star with random
      // brightness + twinkle. Baked in the fragment shader so it renders
      // identically on any GPU (no gl_PointSize dependency).
      float stars(vec3 dir, float density, float threshold) {
        // map direction to 2 uv-ish coords (spherical)
        vec2 uv = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
        uv *= density;
        vec2 cell = floor(uv);
        float rnd = hash(cell);
        if (rnd < threshold) return 0.0;
        // star position jitter within the cell
        vec2 f = fract(uv);
        vec2 starPos = vec2(hash(cell + 1.3), hash(cell + 7.7));
        float dist = length(f - starPos);
        // bright compact core
        float core = smoothstep(0.08, 0.0, dist);
        // twinkle per-star
        float tw = 0.7 + 0.3 * sin(uTime * 1.8 + rnd * 6.2831);
        float bright = (0.4 + 0.6 * hash(cell + 3.1));
        return core * tw * bright;
      }

      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        // Base vertical gradient: bottom -> top across the whole dome.
        vec3 col = mix(uBottom, uTop, smoothstep(-0.25, 0.9, h));

        // --- stars (two layers: dense faint + sparse bright) ---
        float fade = smoothstep(-0.02, 0.35, h); // fade toward horizon
        float s =
          stars(dir, 55.0, 0.86) * 0.9 +
          stars(dir, 26.0, 0.78) * 1.3;
        col += vec3(0.85, 0.88, 1.0) * s * fade;

        // Warm horizon glow centred slightly BELOW the horizon so its bright
        // core sits behind the ground plane — only a soft bloom spills above
        // the skyline, hiding the sky/ground seam while staying crisp.
        float d = h - (-0.06);
        float width = h < -0.06 ? 0.26 : 0.14; // bleeds down more than up
        float glow = exp(-pow(d / width, 2.0));
        col = mix(col, uHorizon, clamp(glow, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;

  function sync(): void {
    (mat.uniforms.uTop!.value as THREE.Color).copy(top);
    (mat.uniforms.uBottom!.value as THREE.Color).copy(bottom);
    (mat.uniforms.uHorizon!.value as THREE.Color).copy(horizon);
  }
  function tick(dt: number): void {
    mat.uniforms.uTime!.value += dt;
  }
  function dispose(): void {
    geo.dispose();
    mat.dispose();
  }
  return { mesh, top, bottom, horizon, sync, tick, dispose };
}

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  graveyard: THREE.Group;
  /** scene fog, exposed so the world module can scale density. */
  fog: THREE.FogExp2;
  /** primary moonlight directional light. */
  moonLight: THREE.DirectionalLight;
  /** warm amber rim/accent light opposite the moon (complementary split). */
  rimLight: THREE.DirectionalLight;
  /** hemisphere fill light. */
  hemiLight: THREE.HemisphereLight;
  /** gradient sky dome; world.ts drives its top/bottom colours. */
  sky: Sky;
  /** the currently-applied render config (quality tier). */
  config: RenderConfig;
  /** apply a new render config at runtime (quality switch). */
  applyConfig: (cfg: RenderConfig) => void;
  /** ground rectangle the camera target may roam within (the yard extent). */
  setBounds: (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => void;
  /** request a few active frames (e.g. after a store change or animation). */
  wake: () => void;
  /**
   * Signal (from a frame callback) that continuous ambient motion is on screen
   * (crows, spirits, skeletons). When idle, the loop then runs at AMBIENT_FPS
   * instead of IDLE_FPS — lively, but well below the full display rate.
   */
  ambient: () => void;
  /** true when the loop is currently throttled (for tests/diagnostics). */
  isIdle: () => boolean;
  /** register a per-frame callback; returns an unregister fn. */
  onFrame: (cb: (dt: number) => void) => () => void;
  dispose: () => void;
}

const IDLE_FPS = 8; // nothing moving but the starfield twinkle
const AMBIENT_FPS = 30; // continuous decorative motion only
const ACTIVE_MS = 1200; // keep rendering at full rate this long after a wake

export function createScene(container: HTMLElement, initialConfig: RenderConfig): SceneHandle {
  const scene = new THREE.Scene();
  // Dusky blue-grey floor colour — kept well above black so the ground plane
  // and distant stones never collapse into a void (the world module eases this
  // toward the night/blood palette at runtime, but never to pitch black).
  scene.background = new THREE.Color(0x1d2236);
  // Moonlit fog — density tuned so distant graves fade into dusk, not vanish.
  const fog = new THREE.FogExp2(0x1d2236, 0.022);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    200,
  );
  // Low, moody framing: pulled back and slightly elevated to establish the
  // field of graves the user can roam across (drag to orbit, scroll to zoom).
  camera.position.set(2.5, 4.5, 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, initialConfig.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = initialConfig.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  // Map-style navigation: left-drag pans across the ground (so every grave in
  // a large yard is reachable), right-drag orbits, scroll zooms toward the
  // cursor. Touch: one finger pans, two fingers rotate/zoom.
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49; // don't go below the ground
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false; // pan along the ground, not the screen
  controls.target.set(0, 1, -4);

  // Keep the target inside the yard; the camera is shifted by the same amount
  // so clamping never changes the view angle. Default bounds until the
  // reconciler reports the real yard size.
  const bounds = { minX: -12, maxX: 12, minZ: -16, maxZ: 4 };
  function clampTarget(): void {
    const t = controls.target;
    const cx = Math.min(bounds.maxX, Math.max(bounds.minX, t.x));
    const cz = Math.min(bounds.maxZ, Math.max(bounds.minZ, t.z));
    const dx = cx - t.x;
    const dz = cz - t.z;
    if (dx !== 0 || dz !== 0) {
      t.x = cx;
      t.z = cz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    t.y = 1; // zoom-to-cursor can drift the target vertically; keep it on the yard
  }
  function setBounds(b: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    bounds.minX = b.minX;
    bounds.maxX = b.maxX;
    bounds.minZ = b.minZ;
    bounds.maxZ = b.maxZ;
    clampTarget();
  }

  // --- lighting ---
  const moonLight = new THREE.DirectionalLight(0xbcd4f0, 1.9);
  moonLight.position.set(-6, 12, 4);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(initialConfig.shadowMapSize, initialConfig.shadowMapSize);
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 60;
  const d = 25;
  moonLight.shadow.camera.left = -d;
  moonLight.shadow.camera.right = d;
  moonLight.shadow.camera.top = d;
  moonLight.shadow.camera.bottom = -d;
  scene.add(moonLight);
  scene.add(moonLight.target);
  // The shadow frustum (±25) follows the view so far graves still get shadows.
  const MOON_OFFSET_X = -6;
  const MOON_OFFSET_Y = 12;
  const MOON_OFFSET_Z = 4;
  function followTarget(): void {
    const t = controls.target;
    moonLight.target.position.set(t.x, 0, t.z);
    moonLight.position.set(t.x + MOON_OFFSET_X, MOON_OFFSET_Y, t.z + MOON_OFFSET_Z);
  }
  followTarget();

  // Warm amber rim/accent light from the opposite side — the complementary
  // temperature split that keeps a cold night scene from reading flat. It only
  // kisses the edges of the stones (low intensity, no shadows).
  const rimLight = new THREE.DirectionalLight(0xffa24d, 1.0);
  rimLight.position.set(9, 4, -7);
  scene.add(rimLight);

  // Overall base fill so the graveyard never goes pitch black. Cool tint so the
  // warm rim reads as a deliberate accent against it.
  const ambientLight = new THREE.AmbientLight(0x7a86b8, 0.8);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xa8b0e8, 0x3a2f5a, 1.05);
  scene.add(hemiLight);

  // --- gradient sky dome (replaces a flat background colour) ---
  const sky = createSky();
  scene.add(sky.mesh);

  // --- ground ---
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3152, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Container group for graves so the reconciler has a stable parent.
  const graveyard = new THREE.Group();
  scene.add(graveyard);

  // --- post-processing (lazy; only when the tier enables it) ---
  let config: RenderConfig = initialConfig;
  let postfx: PostFx | null = null;

  function ensurePostFx(): void {
    if (postfx || !config.postFx) return;
    postfx = createPostFx(renderer, scene, camera, { bloomStrength: config.bloomStrength });
    sizePostFx();
  }

  function sizePostFx(): void {
    if (!postfx) return;
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    postfx.setSize(w, h, Math.min(window.devicePixelRatio, config.maxPixelRatio));
  }

  ensurePostFx();

  // --- render loop with idle throttling + tab-visibility pause ---
  const frameCbs = new Set<(dt: number) => void>();
  let running = true;
  let rafId = 0;
  let lastTime = performance.now();
  let lastActiveWake = performance.now();
  let idleAccum = 0;
  let idle = false;
  // Ambient motion requested during the previous executed frame.
  let ambientActive = false;
  let ambientRequested = false;
  const clock = new THREE.Clock();

  function wake(): void {
    lastActiveWake = performance.now();
  }
  function ambient(): void {
    ambientRequested = true;
  }
  controls.addEventListener('start', wake);
  controls.addEventListener('change', wake);

  function frame(): void {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const now = performance.now();
    const sinceWake = now - lastActiveWake;
    idle = sinceWake >= ACTIVE_MS;

    // When idle, throttle by skipping frames: AMBIENT_FPS if decorations are
    // moving, otherwise IDLE_FPS.
    if (idle) {
      idleAccum += now - lastTime;
      lastTime = now;
      const fps = ambientActive ? AMBIENT_FPS : IDLE_FPS;
      if (idleAccum < 1000 / fps) return;
      idleAccum = 0;
    } else {
      lastTime = now;
    }

    const dt = clock.getDelta();
    controls.update();
    clampTarget();
    followTarget();
    ambientRequested = false;
    for (const cb of frameCbs) cb(dt);
    ambientActive = ambientRequested;
    if (postfx && config.postFx) {
      postfx.render();
    } else {
      renderer.render(scene, camera);
    }
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
    sizePostFx();
    wake();
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  frame();

  function onFrame(cb: (dt: number) => void): () => void {
    frameCbs.add(cb);
    return () => frameCbs.delete(cb);
  }

  function applyConfig(cfg: RenderConfig): void {
    config = cfg;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.maxPixelRatio));
    renderer.shadowMap.enabled = cfg.shadows;
    moonLight.castShadow = cfg.shadows;
    if (moonLight.shadow.mapSize.width !== cfg.shadowMapSize) {
      moonLight.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
      // force shadow map rebuild at the new resolution
      moonLight.shadow.map?.dispose();
      moonLight.shadow.map = null;
    }
    if (cfg.postFx) {
      if (!postfx) ensurePostFx();
      else sizePostFx();
    } else if (postfx) {
      postfx.dispose();
      postfx = null;
    }
    // materials need re-render after shadow toggle
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else m.needsUpdate = true;
      }
    });
    wake();
  }

  function dispose(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibility);
    resizeObserver.disconnect();
    postfx?.dispose();
    controls.dispose();
    renderer.dispose();
    sky.dispose();
    groundGeo.dispose();
    groundMat.dispose();
    renderer.domElement.remove();
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    graveyard,
    fog,
    moonLight,
    rimLight,
    hemiLight,
    sky,
    get config() {
      return config;
    },
    applyConfig,
    setBounds,
    wake,
    ambient,
    isIdle: () => idle,
    onFrame,
    dispose,
  };
}
