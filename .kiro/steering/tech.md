# Tech Steering — Séance

## Stack (decided — do not re-litigate without reason)
- **Language:** TypeScript (strict mode).
- **Build/dev:** Vite (static output; no server runtime).
- **3D:** Three.js (WebGL) — direct scene control, instancing, custom shaders.
- **Post-processing:** Three `EffectComposer` (bloom, vignette, depth fog, film grain).
- **State:** Zustand vanilla build (`zustand/vanilla`). Persistence is a store
  subscriber that writes only when `tasks`/`settings` change (view state is never
  persisted). A hand-rolled ~50-line observable store is the fallback if dependency
  count must drop.
- **UI overlay:** Vanilla TS + CSS (gothic/parchment). **No React.**
- **Fonts:** Cinzel (display) + EB Garamond (text), SIL OFL, via `@fontsource`
  packages bundled by Vite — no external CDN.
- **Audio:** Web Audio API / `<audio>`, gesture-gated, default muted.
- **Hosting:** Vite static build → GitHub Pages / Netlify / Cloudflare Pages / S3+CloudFront.

**Why no React:** the center of gravity is the WebGL canvas, which is reconciled
manually regardless of framework. react-three-fiber adds reconciler cost precisely in
the hardest 20% (shaders, instancing, post-processing). The DOM overlay is small.

## Architecture rules
- The **Task Store is the single source of truth.** Both the DOM overlay and the Three.js
  layer subscribe to it; neither holds duplicate authoritative state.
- The 3D layer **reconciles** the scene from store changes via a `Map<taskId, GraveObject3D>`
  diff — create/update/dispose. Always dispose geometry/materials on removal.
- Persist to `localStorage` under the versioned key `seance.state.v1`; migrate older
  `schemaVersion` payloads; survive empty/corrupt data without crashing.

## Performance rules
- Share geometry (one per grave shape) and stateless materials across graves; only
  materials whose values animate per grave may be per-instance. Build decorations
  lazily. Never allocate (`new Vector3`, `.map`, `.clone`) inside per-frame callbacks.
  `InstancedMesh` is the next step if grave counts grow well beyond ~100.
- Frustum culling + distance LOD; decorations only on the nearest N graves.
- Quality tiers (High/Medium/Low) gate post-fx, shadow resolution, decorations, DPR.
- Pause rendering when the tab is hidden. Render-rate contract: frame callbacks call
  `scene.wake()` only while something *transitions*, `scene.ambient()` for continuous
  decorative motion; never call `wake()` unconditionally every frame.
- Target 60 fps with ~100 graves.

## Coding conventions
- TypeScript strict; no `any` without justification.
- Keep the DOM overlay framework-free; prefer small pure modules.
- Favour procedural geometry over downloaded models (licensing + bundle size).
- Secure, defensive data handling for import (validate/parse untrusted JSON).

## Asset/licensing rules (hard requirement)
- Only CC0 / Public Domain / CC-BY / SIL OFL / self-made assets.
- Every third-party asset recorded in `CREDITS.md`; license files in `assets/licenses/`.
- No "personal use only," non-redistributable, unclear-license, or (unless rules permit)
  AI-generated assets.

## Tooling & verification
- Run the Vite build before presenting changes.
- Unit tests (Vitest, `src/**/*.test.ts`) cover the store/model, JSON import
  migration, and pure graveyard helpers (`model/atmosphere.ts`, `three/grave-visual.ts`).
  Keep new visual-mapping logic in pure modules so it stays testable in Node.
- E2E smoke tests (Playwright, `e2e/`) run against the production build:
  `npm run test:e2e`. CI (`.github/workflows/deploy.yml`) runs both before deploying.
- Pin dependency versions exactly (no `^`/`~`).
- Prefer the project's configured scripts (see `package.json`) over ad-hoc commands.
