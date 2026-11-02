# Séance — Requirements

> Kiroween 2026 · Costume Contest · Frontend-only, statically hosted
>
> This document captures the functional and non-functional requirements for Séance,
> a 3D graveyard task manager. The full design rationale lives in `design.md`; the
> implementation plan lives in `tasks.md`.

## Introduction

Séance is a fully functional task manager whose to-do list is a navigable 3D
graveyard. Every task is a grave, and each grave's appearance and behaviour encodes
the task's real state — priority, due date, completion — so the spooky theme *is* the
information design rather than decoration bolted on top.

Everything runs in the browser: no backend, no accounts, no build server required to
host. The app persists to `localStorage` and deploys as a static bundle.

## Requirements

### Requirement 1 — Task CRUD

**User story:** As a user, I want to create, read, update, complete, and delete tasks,
so that I can manage my to-do list.

#### Acceptance Criteria
1. WHEN the user adds a task with a title THEN the system SHALL create a task with a
   required title, optional notes, a priority (Low/Medium/High), and an optional due date.
2. WHEN a task is created THEN the system SHALL animate a headstone rising from the ground.
3. WHEN the user hovers a grave THEN the system SHALL show a floating epitaph plaque
   with title, due date, and priority.
4. WHEN the user clicks a grave THEN the system SHALL open a detail panel for editing any field.
5. WHEN the user changes a task's priority THEN the system SHALL re-size and re-light
   the headstone with a transition.
6. WHEN the user completes a task THEN the system SHALL play the "laying to rest"
   animation and move the grave to a `completed` (sunken, mossy, dormant) state.
7. WHEN the user deletes a task THEN the system SHALL play the "exhume" animation
   (grave pulled out, crumbles to dust).

### Requirement 2 — Organisation & Filtering

**User story:** As a user, I want to filter, sort, and search tasks, so that I can
focus on what matters.

#### Acceptance Criteria
1. WHEN the user applies a filter THEN the system SHALL filter by status
   (active/completed/overdue), priority, and due window.
2. WHEN the user chooses a sort THEN the system SHALL re-arrange graves by due date or
   priority with animation.
3. WHEN the user searches by title/notes THEN the system SHALL glow matching graves and
   dim non-matches.

### Requirement 3 — Persistence

**User story:** As a user, I want my tasks to persist and be portable, so that I never
lose data and can back it up.

#### Acceptance Criteria
1. WHEN the app state changes THEN the system SHALL store all tasks in `localStorage`
   as JSON under a versioned key (`seance.state.v1`).
2. WHEN the user exports THEN the system SHALL produce a JSON file of all tasks.
3. WHEN the user imports a JSON file THEN the system SHALL load those tasks.
4. WHEN stored data is empty, corrupt, or from an older schema version THEN the system
   SHALL handle it gracefully (migrate or reset without crashing).

### Requirement 4 — Visual State Encoding

**User story:** As a user, I want each grave's appearance to encode its task's real
state, so that the graveyard is readable at a glance.

#### Acceptance Criteria
1. WHEN a task is High priority THEN the system SHALL render a tall obelisk/cross with
   brighter rune glow and cold light.
2. WHEN a task is Medium priority THEN the system SHALL render a standard headstone
   with soft glow.
3. WHEN a task is Low priority THEN the system SHALL render a small flat marker with faint glow.
4. WHEN a task is due within 24h THEN the system SHALL crack the stone, grow moss, and land one crow.
5. WHEN a task is overdue THEN the system SHALL crack the grave open with a pacing spirit and circling crows.
6. WHEN a task is completed THEN the system SHALL render a sunken mossy mound with no glow.
7. WHEN a task is newly created THEN the system SHALL raise it from turned soil with dust particles.
8. WHEN a task matches an active search THEN the system SHALL pulse its glow and dim non-matches.

### Requirement 5 — Ambient / World

**User story:** As a user, I want the world's mood to track my workload, so that the
scene communicates urgency.

#### Acceptance Criteria
1. WHEN the soonest upcoming due date approaches THEN the system SHALL advance a
   day/night cycle (dusk → midnight).
2. WHEN the count of overdue tasks increases THEN the system SHALL increase fog density.
3. WHEN overdue tasks exceed a threshold THEN the system SHALL trigger a "blood moon" event.
4. WHEN the user has interacted (first gesture) THEN the system SHALL allow ambient
   audio (wind, crows, distant bell) with a mute toggle, defaulting to muted and
   respecting autoplay rules.

### Requirement 6 — Performance

**User story:** As a user on typical hardware, I want smooth performance, so that the
scene stays responsive.

#### Acceptance Criteria
1. WHEN rendering ~100 graves THEN the system SHALL target 60 fps using instanced
   rendering and LOD/culling.
2. WHEN running on a weak GPU THEN the system SHALL degrade effects gracefully via a
   quality setting (High/Medium/Low).
3. WHEN the tab is hidden or idle THEN the system SHALL pause or throttle rendering.

### Requirement 7 — Accessibility & Fallback

**User story:** As a user who cannot use the 3D scene, I want a fully functional 2D
view, so that the app is usable by everyone.

#### Acceptance Criteria
1. The system SHALL provide a parchment-styled, fully keyboard-accessible 2D "ledger"
   view supporting all CRUD/filter/search as the canonical functional surface.
2. WHEN `prefers-reduced-motion` is set THEN the system SHALL disable heavy animation
   and use instant state changes.
3. WHEN WebGL is unavailable THEN the system SHALL auto-load the ledger view with a
   static backdrop.
4. The system SHALL provide ARIA labels for all controls and manage focus for panels/modals.
5. The system SHALL keep text overlays colour-contrast-safe.

### Requirement 8 — Offline & Privacy

**User story:** As a user, I want the app to work offline and keep my data private, so
that I can trust it.

#### Acceptance Criteria
1. WHEN the app has loaded once THEN the system SHALL remain fully functional offline.
2. The system SHALL make no network calls required for core function; all data stays
   in the browser.

## Out of Scope (Non-Goals)
- No server, database, authentication, or multi-user sync.
- No real-time collaboration.
- No native/mobile app (responsive web only; mobile falls back to the 2D ledger).
- No AI/LLM runtime dependency.
- PWA/service-worker installability is not pursued.
- WASD walk mode is a disposable stretch goal only (orbit-only for the core build).

## Compliance Notes (Kiroween 2026 Official Rules)
- Project is newly created within the Submission Period (Oct 30 – Dec 4, 2026).
- Repo contains a root `/.kiro` directory (specs, steering, hooks); `.kiro` is NOT gitignored.
- Repo is public on GitHub with a detectable open-source LICENSE file.
- All third-party assets are CC0/OFL/self-made and tracked in `CREDITS.md`.
- A public functional URL and a demo video (< 3 min) are provided at submission.
- A Kiro-usage write-up accompanies the submission (see `README.md`).
