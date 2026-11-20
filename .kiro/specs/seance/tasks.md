# Séance — Implementation Plan (Tasks)

> Kiroween 2026 · Costume Contest · Companion to `requirements.md` and `design.md`.
>
> Tasks are grouped by milestone. Each task references the requirements it satisfies.
> Lock M1–M2 (functional + MVP) before any polish. Notes in _italics_ record where the
> implementation deliberately deviates from the original plan.

## M1 — Skeleton (functional, no 3D)

- [x] 1. Scaffold Vite + TypeScript project; configure static build output.
  - _Requirements: 8.1, 8.2_
- [x] 2. Define the `Task` / `AppState` data model and `Priority`/`Status` types.
  - _Requirements: 1.1_
- [x] 3. Implement the Task Store (vanilla Zustand) with `subscribe`.
  - _Requirements: 1.1–1.7, 2.1–2.3_
- [x] 4. Persist to `localStorage` under `seance.state.v1`, with
        empty/corrupt/old-schema migration handling.
  - _Requirements: 3.1, 3.4_
  - _Hand-rolled store subscriber instead of the `persist` middleware; writes only
    when `tasks`/`settings` change (view-only churn such as search is never written)._
- [x] 5. Build the 2D parchment ledger view: full CRUD, keyboard-accessible table,
        ARIA labels, focus management.
  - _Requirements: 1.1–1.7, 7.1, 7.4, 7.5_
- [x] 6. Add filter (status/priority/due window), sort, and search to the ledger.
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 7. Add JSON import/export ("crypt ledger").
  - _Requirements: 3.2, 3.3_

## M2 — Graveyard MVP

- [x] 8. Set up Three.js scene, camera, fog, OrbitControls with low moody framing.
  - _Requirements: 5.1_
- [x] 9. Procedural grave geometry (obelisk / arched headstone / flat marker).
  - _Requirements: 4.1, 4.2, 4.3_
- [x] 10. Scene reconciler: `Map<taskId, GraveEntry>` diffing store → scene.
  - _Requirements: 1.1_
- [x] 11. Hover raycast + epitaph plaque; click → detail panel.
  - _Requirements: 1.3, 1.4_
  - _The plaque is the grave's HTML label card (title · due · priority), forced
    visible, crisp and on top while hovered — readable on video and selectable text._
- [x] 12. Add-rise animation (headstone rises from soil with dust).
  - _Requirements: 1.2, 4.7_
- [x] 13. View toggle between 3D graveyard and 2D ledger; WebGL-unavailable fallback.
  - _Requirements: 7.3_

## M3 — State Encoding

- [x] 14. Priority visuals: size/material/glow per priority with transitions.
  - _Requirements: 4.1, 4.2, 4.3, 1.5_
- [x] 15. Due-date weathering (< 24h): cracks, moss, one landed crow.
  - _Requirements: 4.4_
- [x] 16. Overdue visuals: cracked-open grave, pacing spirit, circling crows, and a
        haunting skeleton per overdue task (capped at 4).
  - _Requirements: 4.5_
- [x] 17. Completed visuals: sunken mossy mound, dormant, no glow.
  - _Requirements: 4.6_
- [x] 18. Search highlight: pulsing glow on matches, dim non-matches.
  - _Requirements: 4.8_
- [x] 19. Sort/re-layout animation when sort order changes.
  - _Requirements: 2.2_

## M4 — Signature Moments + Audio

- [x] 20. Laying-to-rest animation (grave sinks, glow fades, ghost rises).
  - _Requirements: 1.6_
- [x] 21. Exhume animation (grave pulled out, crumbles to dust).
  - _Requirements: 1.7_
- [x] 22. Day/night cycle tied to soonest due date.
  - _Requirements: 5.1_
- [x] 23. Dynamic fog density scaling with overdue count.
  - _Requirements: 5.2_
- [x] 24. Blood-moon event above overdue threshold.
  - _Requirements: 5.3_
- [x] 25. Gesture-gated ambient audio (synthesized wind/crows/bell), mute toggle,
        default muted.
  - _Requirements: 5.4_

## M5 — Polish & Performance

- [x] 26. Post-processing (bloom, vignette) via EffectComposer.
  - _Requirements: 6.1_
  - _Film grain and a depth-fog pass are deferred; scene fog is `FogExp2`._
- [x] 27. Shared geometry + shared materials for graves.
  - _Requirements: 6.1_
  - _Deviation: not `InstancedMesh`. Every grave reuses one geometry per priority and
    shared crow/crack materials; only the materials whose values animate per grave
    (glow, moss, spirit opacity) are per-instance. Decorations are built lazily.
    Instancing would force per-instance attributes for those animated values; at the
    ~100-grave target the draw-call count is acceptable without it. No textures are
    used, so no atlas is needed._
- [x] 28. Distance LOD for decorations; Three.js frustum culling.
  - _Requirements: 6.1_
  - _Only the nearest N graves (per quality tier) get crows/spirits; the ranking is
    recomputed when the camera moves, not every frame._
- [x] 29. Quality tiers (High/Medium/Low) toggling post-fx, shadows, decorations, DPR.
  - _Requirements: 6.2_
- [x] 30. Pause/throttle rendering when tab hidden or idle.
  - _Requirements: 6.3_
  - _Three rates: full while anything transitions or the user interacts; 30 fps when
    only ambient decorations move; 8 fps when the yard is fully settled._
- [x] 31. Accessibility pass: `prefers-reduced-motion`, contrast-safe overlays.
  - _Requirements: 7.2, 7.5_
  - _Users can override the OS preference (Settings → Motion)._

## M6 — Submission

- [ ] 32. Record 30–60s demo video featuring the three signature moments (< 3 min).
- [x] 33. Finalise README (overview, setup, testing, Kiro-usage write-up).
- [ ] 34. Deploy static bundle to a public URL.
  - _`.github/workflows/deploy.yml` builds, runs unit + e2e tests, and publishes to
    GitHub Pages on push to `main`. Remaining: enable Pages (Source: GitHub Actions)
    in the repo settings and push._
- [x] 35. Verify `CREDITS.md` covers every third-party asset; licenses in `assets/licenses/`.
- [ ] 36. Confirm repo is public on GitHub, root `/.kiro` present and NOT gitignored,
          LICENSE detectable in the About section.

## M7 — Hardening (post-review)

- [x] 37. Fix idle throttling (world module no longer wakes the loop every frame).
  - _Requirements: 6.3_
- [x] 38. Remove per-frame allocations in the reconciler and label layer.
  - _Requirements: 6.1_
- [x] 39. Settings + About dialogs (quality, motion, sound, show completed; legend of
        what every spooky element means).
  - _Requirements: 6.2, 7.2, 5.4_
- [x] 40. Import confirmation with Merge / Replace; inline validation errors on add/edit.
  - _Requirements: 3.3, 1.1, 7.4_
- [x] 41. Re-derive due states every minute so tasks visibly become due/overdue.
  - _Requirements: 4.4, 4.5_
- [x] 42. Self-hosted OFL fonts (Cinzel, EB Garamond) with licenses.
- [x] 43. Unit tests for atmosphere/visual/layout helpers; Playwright smoke tests.
