# Structure Steering — Séance

## Repository layout (target)
```
/
├─ .kiro/                     # Kiro specs, steering, hooks (NEVER gitignored)
│  ├─ specs/seance/           # requirements.md, design.md, tasks.md
│  ├─ steering/               # product.md, tech.md, structure.md
│  └─ hooks/                  # agent hook definitions
├─ assets/
│  └─ licenses/               # original license files for bundled third-party assets
├─ public/                    # static files copied verbatim by Vite
├─ src/
│  ├─ main.ts                 # entry point; wires store, overlay, and 3D layer
│  ├─ store/                  # Task Store (Zustand vanilla) + persist + migrations
│  ├─ model/                  # Task/AppState types, validation, JSON import/export
│  ├─ ui/                     # DOM overlay: quick-add, detail panel, filters, ledger
│  ├─ three/                  # scene, camera, reconciler, graves, shaders, post-fx
│  ├─ audio/                  # ambient audio + mute gating
│  └─ styles/                 # gothic/parchment CSS, self-hosted fonts
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
- `ui/` and `three/` both depend on `store/` but not on each other.
- `three/` owns all WebGL; the overlay never touches the renderer directly.

## Naming conventions
- Files: kebab-case (`task-store.ts`, `grave-reconciler.ts`).
- Types/interfaces: PascalCase (`Task`, `AppState`).
- The persisted localStorage key is `seance.state.v1`.

## Kiro directory discipline (compliance-critical)
- `/.kiro` lives at the repo root and MUST remain tracked by git.
- Do NOT add `.kiro` (or any sub-folder) to `.gitignore` — doing so risks disqualification.
- Specs follow the requirements → design → tasks structure under `.kiro/specs/<feature>/`.
- Steering docs (this folder) guide every Kiro session; keep them current as decisions change.
