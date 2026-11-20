# Structure Steering — Séance

## Repository layout (target)
```
/
├─ .kiro/                     # Kiro specs, steering, hooks (NEVER gitignored)
│  ├─ specs/seance/           # requirements.md, design.md, tasks.md
│  ├─ steering/               # product.md, tech.md, structure.md
│  ├─ agents/                 # seance-dev custom agent
│  └─ hooks/                  # agent hook scripts
├─ .github/workflows/         # deploy.yml — test + build + GitHub Pages
├─ assets/
│  └─ licenses/               # original license files for bundled third-party assets
├─ e2e/                       # Playwright smoke tests (run against `vite preview`)
├─ scripts/                   # dev-only tooling (shoot.mjs screenshot harness)
├─ src/
│  ├─ main.ts                 # entry point; wires store, overlay, and 3D layer
│  ├─ store/                  # Task Store (Zustand vanilla) + persistence + seed
│  ├─ model/                  # types, validation/migration, query, atmosphere rules
│  ├─ ui/                     # DOM overlay: sidebar, ledger, shell, settings/about
│  ├─ three/                  # scene, reconciler, graves, skeletons, labels, post-fx
│  ├─ audio/                  # synthesized ambient audio + mute gating
│  ├─ styles/                 # gothic/parchment CSS + self-hosted font imports
│  └─ __tests__/              # Vitest unit tests
├─ index.html
├─ CREDITS.md                 # third-party asset attributions (maintained from day one)
├─ LICENSE                    # open-source license (MIT) — detectable in GitHub About
├─ README.md                  # overview, setup, Kiro-usage write-up
├─ .gitignore                 # must NOT ignore .kiro
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## Module boundaries
- `model/` has no DOM or Three.js imports — pure data + validation; easiest to test.
- `store/` depends only on `model/`; exposes `subscribe` and actions.
- `ui/` and `three/` both depend on `store/`. `ui/app.ts` lazily imports `three/` (code
  split); `three/labels.ts` reuses the tiny `ui/dom.ts` helper. Otherwise they do not
  depend on each other.
- `three/` owns all WebGL; the overlay never touches the renderer directly.
- Pure, Three-free graveyard logic lives in `three/grave-visual.ts` and
  `model/atmosphere.ts` so it is unit-testable.

## Naming conventions
- Files: kebab-case (`task-store.ts`, `grave-reconciler.ts`).
- Types/interfaces: PascalCase (`Task`, `AppState`).
- The persisted localStorage key is `seance.state.v1`.

## Kiro directory discipline (compliance-critical)
- `/.kiro` lives at the repo root and MUST remain tracked by git.
- Do NOT add `.kiro` (or any sub-folder) to `.gitignore` — doing so risks disqualification.
- Specs follow the requirements → design → tasks structure under `.kiro/specs/<feature>/`.
- Steering docs (this folder) guide every Kiro session; keep them current as decisions change.
