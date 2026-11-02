# Séance — Design

> Kiroween 2026 · Costume Contest · Companion to `requirements.md` and `tasks.md`.

## 1. Concept & Target Experience

A user lands on a foggy, moonlit graveyard at dusk — ambient wind and distant crows, a
wrought-iron gate title card reading "Séance." They click **+ Dig a Grave** to add a
task; a headstone rises from freshly turned soil with the epitaph (task title). They
roam the graveyard (orbit / zoom), hover a grave to read details, click to edit, and
drag a lit candle onto a grave to mark it complete — releasing a ghost.

The scene's mood tracks the workload: an empty graveyard is calm and clear; a backlog
of overdue tasks summons fog, crows, and a blood moon.

The guiding principle for the Costume Contest is that **spooky elements must enhance
function** — the theme *is* the information design (see Requirement 4).

## 2. Stack (decided)

**Vanilla TypeScript + Vite + Three.js**, with a vanilla Zustand store. No React.

Rationale: the project's center of gravity is the WebGL canvas, not the DOM. The 3D
scene is reconciled manually (section 4) regardless of framework, so React adds no
value where it matters most. The DOM overlay is small (quick-add, detail panel,
filters, 2D ledger), a flat vanilla stack is faster to polish and debug in a
time-boxed hackathon, and the bundle stays lean for static hosting. react-three-fiber
was considered and rejected: its reconciler abstraction and React-coupled render loop
add cost exactly during the hardest 20% (custom shaders, instancing, post-processing).

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** | Type-safe data model; catches store/scene-diffing errors |
| Build/dev | **Vite** | Instant HMR, zero-config, static output for easy hosting |
| 3D | **Three.js** (WebGL) | Direct control over scene, instancing, shaders |
| Post-processing | **three `EffectComposer`** | Bloom, vignette, depth fog, film grain |
| State | **Zustand (vanilla build)** + `persist` | ~1KB, framework-agnostic `subscribe`; DOM overlay and Three.js reconciler both listen; `persist` middleware syncs `localStorage` |
| UI overlay | **Vanilla TS + CSS** | Small surface; gothic/parchment styling in plain CSS |
| Fonts | Bundled gothic/serif typefaces (self-hosted) | No external font CDN; offline-friendly |
| Audio | **Web Audio API / `<audio>`** | Ambient loops, mute toggle, gesture-gated |
| Build/Host | **Vite static build** → GitHub Pages / Netlify / Cloudflare Pages / S3+CloudFront | No server runtime |

A hand-rolled ~50-line observable store remains a viable fallback if dependency count
must be minimised.

## 3. Architecture (client-only)

```
+------------------------------------------------------+
|                     Browser (SPA)                    |
|                                                      |
|   UI Layer (DOM overlay)      3D Layer (Three.js)    |
|   - Quick add / detail panel  - Scene, camera, fog   |
|   - Ledger (2D fallback)      - Grave instances      |
|   - Filters / search          - Lighting / particles |
|            \                 /                       |
|             \               /                        |
|              v             v                         |
|            Task Store (observable)                   |
|                    |                                 |
|                    v                                 |
|          localStorage (versioned JSON)               |
|          + JSON import/export                        |
+------------------------------------------------------+
```

The Task Store is the single source of truth. The 3D layer subscribes to store changes
and reconciles the scene (add/update/remove grave objects). The DOM overlay reads/writes
the same store.

## 4. Data Model

```ts
type Priority = 'low' | 'medium' | 'high';
type Status = 'active' | 'completed';

interface Task {
  id: string;            // uuid
  title: string;         // epitaph
  notes?: string;
  priority: Priority;
  dueDate?: string;      // ISO date
  status: Status;
  createdAt: string;     // ISO
  completedAt?: string;  // ISO
  plot: { x: number; z: number }; // grave position in the yard
}

interface AppState {
  schemaVersion: number;
  tasks: Task[];
  settings: {
    quality: 'high' | 'medium' | 'low';
    muted: boolean;
    reducedMotion: boolean;
    showCompleted: boolean;
  };
}
```

Persisted under key `seance.state.v1`. A migration step upgrades older `schemaVersion`
payloads.

## 5. Scene Reconciliation

- Maintain a `Map<taskId, GraveObject3D>`.
- On store change: diff tasks vs. map → create risers, update materials/glow, play
  completion/exhume animations, free disposed geometry/materials.
- Use `InstancedMesh` for shared grave meshes where possible; per-grave uniforms for
  glow/weathering via instanced attributes.

## 6. Performance Strategy

- Instanced grave meshes; shared materials; texture atlases.
- Frustum culling + distance LOD (simplify distant graves, drop particles).
- Quality tiers toggle post-processing, shadow resolution, particle counts, fog steps.
- Pause rendering when tab hidden; throttle when idle.

## 7. Interaction Model

- **Navigation**: `OrbitControls` (drag to look, scroll to zoom) with a low, moody
  default framing. Scripted "fly to grave" camera tweens when a task is selected.
  WASD walk mode is explicitly deferred (stretch, post-M5 only).
- **Hover**: raycast to highlight grave + show epitaph plaque.
- **Select**: click grave → open detail panel.
- **Complete gesture**: drag the floating candle onto a grave, or click "Lay to rest".
- **Add**: "+ Dig a Grave" button → quick-add form → headstone rises.
- **Toggle views**: switch between the 3D graveyard and the 2D parchment ledger.

## 8. Accessibility & Fallback

- **2D Ledger view**: parchment-styled, fully keyboard-accessible task table with all
  CRUD/filter/search — the canonical functional surface.
- `prefers-reduced-motion`: disable rising/sinking/particle animations; instant changes.
- WebGL unavailable → auto-load the Ledger view with a tasteful static backdrop.
- Screen-reader labels for all controls; focus management for panels/modals.

## 9. Signature Moments (for the demo video)

1. **Laying to rest** — grave sinks, epitaph dissolves, a ghost rises and fades into fog.
2. **Rising headstone** — new task erupts from soil with dust and a low rumble.
3. **Blood moon backlog** — overdue tasks summon crows, fog, and a red moon.

These are the shots that must land in the < 3-minute submission video.

## 10. Asset & Licensing Plan

**Strategy: prefer code over downloads.** Grave geometry is procedural (boxes/extrusions
generated in Three.js); weathering via procedural noise. Only download assets where
self-making is impractical (realistic stone/soil textures, ambient audio).

**Approved licenses:** CC0/Public Domain (preferred), CC-BY (attribution in `CREDITS.md`),
SIL OFL (fonts), self-made.

**Avoid:** "free for personal use only," non-redistributable, unclear/missing license,
AI-generated assets unless rules explicitly permit.

**Sources:** Poly Haven / ambientCG (CC0 textures + HDRIs), Kenney.nl (CC0 props),
Freesound (CC0/CC-BY audio), Google Fonts OFL typefaces bundled locally.

**Requirement:** Maintain `CREDITS.md` from day one; keep original license files in
`assets/licenses/`.

## 11. Risks & Mitigations

- **Scope creep on effects** → lock M1–M2 (functional + MVP) before any polish.
- **Performance on weak GPUs** → quality tiers + 2D fallback from day one.
- **Autoplay audio blocked** → audio only after first user gesture; default muted.
- **Demo doesn't read on video** → design signature moments early and test on video.
- **Asset licensing violation** → CC0/OFL/self-made only; maintain `CREDITS.md`.
