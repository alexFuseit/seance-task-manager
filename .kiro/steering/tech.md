# Tech Steering — Séance

## Stack (decided — do not re-litigate without reason)
- **Language:** TypeScript (strict mode).
- **Build/dev:** Vite (static output; no server runtime).
- **3D:** Three.js (WebGL) — direct scene control, instancing, custom shaders.
- **Post-processing:** Three `EffectComposer` (bloom, vignette, depth fog, film grain).
- **State:** Zustand vanilla build (`zustand/vanilla`) + `persist` middleware.
  A hand-rolled ~50-line observable store is the fallback if dependency count must drop.
- **UI overlay:** Vanilla TS + CSS (gothic/parchment). **No React.**
- **Fonts:** Self-hosted OFL gothic/serif typefaces (no external CDN).
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
- Use `InstancedMesh` + shared materials + texture atlases for graves.
- Frustum culling + distance LOD; drop particles/effects at distance.
- Quality tiers (High/Medium/Low) gate post-fx, shadow resolution, particle counts, fog steps.
- Pause rendering when the tab is hidden; throttle when idle.
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
- Add tests for the store/model and JSON import migration (the data-integrity core).
- Prefer the project's configured scripts (see `package.json`) over ad-hoc commands.
