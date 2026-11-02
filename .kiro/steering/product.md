# Product Steering — Séance

## What this is
Séance is a frontend-only task manager whose to-do list is a navigable 3D graveyard.
Each task is a grave; the grave's appearance and behaviour encode the task's real state
(priority, due date, completion). The spooky theme IS the information design.

Kiroween 2026 entry — **Costume Contest** category. The judged differentiator is that
every spooky element must *enhance function*, not decorate it.

## Who it's for
Anyone who wants a memorable, genuinely usable personal task manager that runs entirely
in the browser with no account and no backend. Also an audience of hackathon judges who
value a polished, coherent product experience and a demo that reads on video.

## Core value
- Readable at a glance: priority = headstone size/glow; urgency = weathering/crows/fog;
  completion = the "laying to rest" moment.
- Zero friction: no sign-up, no server, works offline, data stays local.
- Unforgettable presentation without sacrificing real utility.

## Product principles
1. **Function first.** The 2D parchment "ledger" is the canonical, fully accessible
   surface. The 3D graveyard is the showcase layered on top — never a prerequisite for
   core use.
2. **Spooky = signal.** Never add an effect that doesn't encode real task state or mood.
3. **Signature moments matter.** Laying-to-rest, rising headstone, and blood-moon
   backlog are the three shots the demo must land.
4. **Graceful degradation.** Weak GPU, reduced-motion, or no WebGL must still yield a
   fully usable app.
5. **Privacy by default.** No required network calls; all data in `localStorage`.

## Explicit non-goals
No backend, accounts, multi-user sync, real-time collaboration, native/mobile app, or
AI/LLM runtime dependency. PWA installability and WASD walk mode are not pursued for the
core build.
