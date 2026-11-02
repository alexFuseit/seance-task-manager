# Séance — Implementation Plan (Tasks)

> Kiroween 2026 · Costume Contest · Companion to `requirements.md` and `design.md`.
>
> Tasks are grouped by milestone. Each task references the requirements it satisfies.
> Lock M1–M2 (functional + MVP) before any polish.

## M1 — Skeleton (functional, no 3D)

- [ ] 1. Scaffold Vite + TypeScript project; configure static build output.
  - _Requirements: 8.1, 8.2_
- [ ] 2. Define the `Task` / `AppState` data model and `Priority`/`Status` types.
  - _Requirements: 1.1_
- [ ] 3. Implement the Task Store (vanilla Zustand) with `subscribe`.
  - _Requirements: 1.1–1.7, 2.1–2.3_
- [ ] 4. Add `persist` middleware → `localStorage` under `seance.state.v1`, with
        empty/corrupt/old-schema migration handling.
  - _Requirements: 3.1, 3.4_
- [ ] 5. Build the 2D parchment ledger view: full CRUD, keyboard-accessible table,
        ARIA labels, focus management.
  - _Requirements: 1.1–1.7, 7.1, 7.4, 7.5_
- [ ] 6. Add filter (status/priority/due window), sort, and search to the ledger.
  - _Requirements: 2.1, 2.2, 2.3_
- [ ] 7. Add JSON import/export ("crypt ledger").
  - _Requirements: 3.2, 3.3_

## M2 — Graveyard MVP

- [ ] 8. Set up Three.js scene, camera, fog, OrbitControls with low moody framing.
  - _Requirements: 5.1_
- [ ] 9. Procedural grave geometry (headstone/cross/obelisk/flat marker).
  - _Requirements: 4.1, 4.2, 4.3_
- [ ] 10. Scene reconciler: `Map<taskId, GraveObject3D>` diffing store → scene.
  - _Requirements: 1.1_
- [ ] 11. Hover raycast + epitaph plaque; click → detail panel.
  - _Requirements: 1.3, 1.4_
- [ ] 12. Add-rise animation (headstone rises from soil with dust).
  - _Requirements: 1.2, 4.7_
- [ ] 13. View toggle between 3D graveyard and 2D ledger; WebGL-unavailable fallback.
  - _Requirements: 7.3_

## M3 — State Encoding

- [ ] 14. Priority visuals: size/material/glow per priority with transitions.
  - _Requirements: 4.1, 4.2, 4.3, 1.5_
- [ ] 15. Due-date weathering (< 24h): cracks, moss, one landed crow.
  - _Requirements: 4.4_
- [ ] 16. Overdue visuals: cracked-open grave, pacing spirit, circling crows.
  - _Requirements: 4.5_
- [ ] 17. Completed visuals: sunken mossy mound, dormant, no glow.
  - _Requirements: 4.6_
- [ ] 18. Search highlight: pulsing glow on matches, dim non-matches.
  - _Requirements: 4.8_
- [ ] 19. Sort/re-layout animation when sort order changes.
  - _Requirements: 2.2_

## M4 — Signature Moments + Audio

- [ ] 20. Laying-to-rest animation (grave sinks, epitaph dissolves, ghost rises).
  - _Requirements: 1.6_
- [ ] 21. Exhume animation (grave pulled out, crumbles to dust).
  - _Requirements: 1.7_
- [ ] 22. Day/night cycle tied to soonest due date.
  - _Requirements: 5.1_
- [ ] 23. Dynamic fog density scaling with overdue count.
  - _Requirements: 5.2_
- [ ] 24. Blood-moon event above overdue threshold.
  - _Requirements: 5.3_
- [ ] 25. Gesture-gated ambient audio with mute toggle, default muted.
  - _Requirements: 5.4_

## M5 — Polish & Performance

- [ ] 26. Post-processing (bloom, vignette, depth fog, film grain) via EffectComposer.
  - _Requirements: 6.1_
- [ ] 27. InstancedMesh + shared materials + texture atlases for graves.
  - _Requirements: 6.1_
- [ ] 28. Frustum culling + distance LOD; particle/effect drop at distance.
  - _Requirements: 6.1_
- [ ] 29. Quality tiers (High/Medium/Low) toggling post-fx, shadows, particles, fog.
  - _Requirements: 6.2_
- [ ] 30. Pause/throttle rendering when tab hidden or idle.
  - _Requirements: 6.3_
- [ ] 31. Accessibility pass: `prefers-reduced-motion`, contrast-safe overlays.
  - _Requirements: 7.2, 7.5_

## M6 — Submission

- [ ] 32. Record 30–60s demo video featuring the three signature moments (< 3 min).
- [ ] 33. Finalise README (overview, setup, Kiro-usage write-up).
- [ ] 34. Deploy static bundle to a public URL (GitHub Pages / Netlify / etc.).
- [ ] 35. Verify `CREDITS.md` covers every third-party asset; licenses in `assets/licenses/`.
- [ ] 36. Confirm repo is public on GitHub, root `/.kiro` present and NOT gitignored,
          LICENSE detectable in the About section.
