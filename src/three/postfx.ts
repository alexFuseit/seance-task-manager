/**
 * Post-processing (design.md §2): an EffectComposer with UnrealBloom (so the
 * rune glow and moon bloom) and a vignette (to darken the frame edges for a
 * moody, focused look). Gated by the quality tier — low quality skips the
 * composer entirely and renders directly.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** A simple radial vignette darkening the frame edges. */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 1.15 },
    darkness: { value: 1.1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = clamp(1.0 - dot(uv, uv) * darkness, 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vig, texel.a);
    }
  `,
};

export interface PostFx {
  composer: EffectComposer;
  setSize: (w: number, h: number, pixelRatio: number) => void;
  render: () => void;
  dispose: () => void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { bloomStrength: number },
): PostFx {
  const composer = new EffectComposer(renderer);

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    opts.bloomStrength, // strength
    0.5, // radius
    0.2, // threshold — only bright things (glow, moon) bloom
  );
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  composer.addPass(new OutputPass());

  function setSize(w: number, h: number, pixelRatio: number): void {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }

  function render(): void {
    composer.render();
  }

  function dispose(): void {
    composer.dispose();
  }

  return { composer, setSize, render, dispose };
}
