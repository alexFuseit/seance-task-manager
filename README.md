# Séance — A 3D Graveyard Task Manager

> **Kiroween 2026 · Costume Contest entry** · Frontend-only, statically hosted.

Séance is a fully functional task manager whose to-do list is a navigable **3D
graveyard**. Every task is a grave, and each grave's appearance and behaviour *encode
the task's real state* — priority, due date, and completion. The spooky theme is not
decoration bolted onto a list; it **is** the information design.

- A new task is a **headstone that rises** from freshly turned soil.
- **Priority** drives headstone size, material, and glow intensity.
- **Due dates** drive a day/night cycle and weathering — stones crack, moss creeps in,
  crows circle; overdue graves crack open with a pacing spirit.
- **Completing a task** sinks the grave, dissolves the epitaph, and releases a ghost
  into the fog — the task is "laid to rest."

Everything runs in the browser. No backend, no accounts, no network calls required;
data persists to `localStorage` and the app ships as a static bundle.

## Status

**M1 (functional 2D ledger), M2 (graveyard MVP), M3 (visual state encoding), and
M4 (signature moments + audio) complete.** The planning artifacts live under
[`.kiro/`](./.kiro/):
- Spec: [`.kiro/specs/seance/`](./.kiro/specs/seance/) — `requirements.md`, `design.md`, `tasks.md`.
- Steering: [`.kiro/steering/`](./.kiro/steering/) — `product.md`, `tech.md`, `structure.md`.
- Automation: [`.kiro/agents/seance-dev.json`](./.kiro/agents/seance-dev.json) + [`.kiro/hooks/`](./.kiro/hooks/).

## Tech stack

**Vanilla TypeScript + Vite + Three.js** with a vanilla **Zustand** store. **No React.**
The center of gravity is the WebGL canvas, which is reconciled manually regardless of
framework, so a flat vanilla stack keeps the bundle lean and the hardest 20% (custom
shaders, instancing, post-processing) under direct control. See
[`.kiro/steering/tech.md`](./.kiro/steering/tech.md) for the full rationale.

## Getting started

> These commands assume the Vite project has been scaffolded (see
> [`.kiro/specs/seance/tasks.md`](./.kiro/specs/seance/tasks.md), task M1.1).

```bash
# Install dependencies
npm install

# Start the dev server (HMR)
npm run dev

# Type-check and produce a static build in dist/
npm run build

# Preview the production build locally
npm run preview
```

The `dist/` output is a static bundle deployable to GitHub Pages, Netlify,
Cloudflare Pages, or S3 + CloudFront — no server runtime.

## Accessibility

Séance is function-first. The **2D parchment "ledger"** is the canonical,
fully keyboard-accessible surface with all CRUD, filtering, and search. The 3D
graveyard is the showcase layered on top — never a prerequisite for core use. The app
respects `prefers-reduced-motion` and falls back to the ledger when WebGL is
unavailable.

## How Kiro was used

This project is built with Kiro using a spec-driven, steering-guided workflow. The
`/.kiro` directory is committed at the repo root (and never gitignored) to document that
usage.

### Spec-driven development
Instead of vibe-coding, the project is anchored by a three-part spec under
[`.kiro/specs/seance/`](./.kiro/specs/seance/):
- **`requirements.md`** — user stories with EARS-style acceptance criteria (WHEN/THEN),
  grouped into eight numbered requirements (CRUD, filtering, persistence, visual state
  encoding, ambient world, performance, accessibility, offline/privacy).
- **`design.md`** — the technical design: stack rationale, client-only architecture,
  data model, scene-reconciliation strategy, performance plan, interaction model, and
  the asset/licensing plan.
- **`tasks.md`** — an implementation plan broken into milestones M1–M6, where each task
  cites the requirement IDs it satisfies, so progress is always traceable back to a
  requirement.

The spec-first approach kept scope controlled (functional M1–M2 before any polish) and
made each coding step a small, verifiable unit tied to an acceptance criterion — the
opposite of open-ended vibe coding.

### Steering docs
Three steering files in [`.kiro/steering/`](./.kiro/steering/) are loaded into context
every session to keep Kiro's output consistent:
- **`product.md`** — positioning and the function-first / "spooky = signal" principles.
- **`tech.md`** — the locked stack, architecture rules, performance rules, coding
  conventions, and the hard asset-licensing rules.
- **`structure.md`** — target repo layout, module boundaries, and the rule that `.kiro`
  is never gitignored.

The highest-leverage steering was encoding the non-negotiables — "no React,"
"function first, 2D ledger is canonical," and "only CC0/OFL/self-made assets" — so every
response respected them without re-litigation.

### Custom agent + agent hooks
A custom agent, [`seance-dev`](./.kiro/agents/seance-dev.json), scopes the toolset and
auto-loads the steering and spec as resources. It wires three agent hooks that automate
the development loop:
- **`agentSpawn`** → `git status --short --branch` for instant repo orientation.
- **`postToolUse` (on `write`)** → [`typecheck.mjs`](./.kiro/hooks/typecheck.mjs) runs
  `tsc --noEmit` after file writes so type errors surface immediately (fails open until
  the project is scaffolded).
- **`stop`** → [`asset-license-check.mjs`](./.kiro/hooks/asset-license-check.mjs) warns
  if any file under `assets/` is newer than `CREDITS.md`, enforcing the licensing
  guardrail that protects against disqualification.

### Compliance built in
The scaffolding was designed against the Kiroween 2026 Official Rules from the first
commit: a public-ready repo with a detectable MIT [`LICENSE`](./LICENSE), the committed
`/.kiro` directory, a [`CREDITS.md`](./CREDITS.md) maintained from day one, and a plan
for a public functional URL and a sub-3-minute demo video at submission.

## License

[MIT](./LICENSE). Third-party asset attributions are tracked in
[`CREDITS.md`](./CREDITS.md).
