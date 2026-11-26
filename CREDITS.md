# Credits & Asset Licenses

> Maintained from day one per the Séance asset plan and Kiroween 2026 Official Rules.
> Every third-party asset (texture, audio, font, model, borrowed shader/code snippet)
> must be listed here with its source, author, and license **before or when it is
> added** to the repo — not at the end. Keep original license files in
> `assets/licenses/`.

## Approved license types
| Type | Terms | Use |
|------|-------|-----|
| CC0 / Public Domain | No restrictions, no attribution required | Preferred for everything |
| CC-BY | Free use **with** attribution | OK — must be attributed below |
| SIL OFL (fonts) | Free use/embedding | OK for all gothic/serif typefaces |
| Self-made | Full rights | Procedural geometry, synthesized audio |

**Avoid:** "free for personal use only," non-redistributable, unclear/missing license,
and AI-generated assets (unless the rules explicitly permit, in which case disclose here).

## Code & libraries
| Name | Source | License | Notes |
|------|--------|---------|-------|
| Three.js | https://github.com/mrdoob/three.js | MIT | 3D rendering (0.169.0) |
| Zustand (vanilla) | https://github.com/pmndrs/zustand | MIT | State store (4.5.5) |
| Fontsource packages | https://github.com/fontsource/fontsource | MIT (packaging) | Delivers the fonts below as local files (5.3.0) |
| Vite | https://github.com/vitejs/vite | MIT | Build/dev tooling — dev only, not shipped (5.4.8) |
| Vitest | https://github.com/vitest-dev/vitest | MIT | Unit tests — dev only (2.1.2) |
| Playwright | https://github.com/microsoft/playwright | Apache-2.0 | E2E tests + screenshot harness — dev only (1.48.0) |
| TypeScript | https://github.com/microsoft/TypeScript | Apache-2.0 | Type checking — dev only (5.5.4) |

## Fonts
Bundled into `dist/` by Vite (Latin subset only); no font CDN is contacted at runtime.

| Name | Source | Author | License |
|------|--------|--------|---------|
| Cinzel (400, 700) | https://github.com/NDISCOVER/Cinzel | The Cinzel Project Authors | SIL OFL 1.1 — [`assets/licenses/Cinzel-OFL.txt`](./assets/licenses/Cinzel-OFL.txt) |
| EB Garamond (400, 400 italic, 600) | https://github.com/octaviopardo/EBGaramond12 | The EB Garamond Project Authors | SIL OFL 1.1 — [`assets/licenses/EB-Garamond-OFL.txt`](./assets/licenses/EB-Garamond-OFL.txt) |

## Textures / HDRIs
| Name | Source | Author | License |
|------|--------|--------|---------|
| _none — all surfaces are procedural materials; the sky and stars are a shader_ | | | |

## Audio
| Name | Source | Author | License |
|------|--------|--------|---------|
| _none — wind, crow caws and the bell are synthesized at runtime with the Web Audio API_ | | | |

## 3D models
| Name | Source | Author | License |
|------|--------|--------|---------|
| _none — graves, crows, spirits, ghosts and skeletons are built from Three.js primitives_ | | | |

## Self-made assets
- Procedural grave geometry, crows, spirits, ghosts, skeletons — © Séance contributors (MIT).
- Gradient sky + procedural starfield shader, vignette shader — © Séance contributors (MIT).
- Synthesized ambient audio — © Séance contributors (MIT).
- Demo-video soundtrack (`scripts/demo/soundtrack.mjs`) — fully self-synthesized with ffmpeg (lavfi sources/filters only); no third-party audio. © Séance contributors (MIT).
- Inline SVG icons (ghost, grave, pentagram, etc.) — © Séance contributors (MIT).

## AI-generated assets
None.
