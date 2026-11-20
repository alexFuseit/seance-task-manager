/**
 * Scene reconciler — the bridge between the task store and the Three.js scene
 * (design.md §5). Maintains a `Map<taskId, GraveEntry>` and on every store
 * change diffs tasks vs. the map:
 *   - new task      → build a grave, place it, play the rise animation
 *   - changed task  → update visual target + target position
 *   - removed task  → exhume animation, then dispose per-grave materials
 *
 * Visual state is derived from the task's due state and the active search
 * term (grave-visual.ts); graves re-lay-out (easing to new positions) when the
 * sort order changes; overdue graves are haunted by skeletons; time-based
 * effects (crows, circling flock, pacing spirit) run per frame.
 *
 * Render-rate contract with scene.ts: transitions call `scene.wake()` (full
 * rate); continuous decorative motion calls `scene.ambient()` (reduced idle
 * rate); a fully settled yard lets the loop drop to its idle rate.
 *
 * Also owns pointer interaction: hover raycast drives the cursor; click
 * selects a grave and invokes onSelect (wired to the ledger's edit dialog).
 */
import * as THREE from 'three';
import { type SeanceStore } from '../store/task-store';
import { type SceneHandle } from './scene';
import {
  type GraveParts,
  Tick,
  applyGraveVisual,
  buildGrave,
  disposeGrave,
  disposeSharedGraveResources,
  setDecorationsEnabled,
  tickGrave,
} from './grave';
import { layoutPosition, signature, visualOf } from './grave-visual';
import { createLabelLayer, type LabelAnchor, type LabelLayer } from './labels';
import { createSkeletons, type Haunt, type Skeletons } from './skeletons';
import { type Effect, createGhost, createDustBurst } from './effects';

type Transient = 'idle' | 'laying-to-rest' | 'exhuming';

interface GraveEntry {
  taskId: string;
  parts: GraveParts;
  /** target world position; graves ease toward this (re-layout on sort). */
  target: THREE.Vector3;
  /** 0 → fully underground (rising), 1 → fully risen. */
  rise: number;
  /** cached visual signature to skip redundant target recomputation. */
  sig: string;
  /** current transient (signature-moment) animation, if any. */
  transient: Transient;
  /** progress 0..1 of the current transient animation. */
  anim: number;
  /** seconds to wait before this grave starts rising (staggered entrance). */
  riseDelay: number;
  /** last-seen task status, to detect active→completed transitions. */
  lastStatus: 'active' | 'completed';
  /** reusable label anchor (no per-frame allocation). */
  label: LabelAnchor;
}

export interface Reconciler {
  dispose: () => void;
}

const RISE_SPEED = 2.2;
const LAY_TO_REST_DUR = 1.6; // seconds — grave sinks + ghost rises
const EXHUME_DUR = 1.1; // seconds — grave pulls up then crumbles
/** Re-derive due states this often so tasks visibly *become* due/overdue. */
const DUE_REFRESH_MS = 60_000;
/** Camera movement (world units²) that triggers a decoration LOD re-rank. */
const LOD_RERANK_DIST2 = 0.25;

export function createReconciler(
  scene: SceneHandle,
  store: SeanceStore,
  onSelect: (taskId: string) => void,
  getOpts: () => { reducedMotion: boolean },
): Reconciler {
  const entries = new Map<string, GraveEntry>();
  /** entries playing their exhume animation before disposal. */
  const exhuming = new Set<GraveEntry>();
  /** transient particle/mesh effects (ghosts, dust) not tied to a grave entry. */
  const effects = new Set<Effect>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: string | null = null;
  let pointerInside = false;
  let elapsed = 0;

  const dom = scene.renderer.domElement;

  // HTML label layer — task cards anchored to the 3D graves. Lives in the
  // canvas host so it overlays the WebGL canvas.
  const labelHost = (dom.parentElement as HTMLElement) ?? dom;
  const labels: LabelLayer = createLabelLayer(labelHost, onSelect);
  /** reused per frame; rebuilt only when the entry set changes. */
  let labelOrder: LabelAnchor[] = [];
  let labelOrderDirty = true;

  // Skeletons haunt overdue graves (one per overdue task, capped).
  const skeletons: Skeletons = createSkeletons();
  scene.graveyard.add(skeletons.group);

  // Decoration LOD: nearest-N ranking, recomputed only when the camera moves
  // or the set of graves changes (not every frame).
  const decorEligible = new Set<string>();
  const lastRankCam = new THREE.Vector3(Infinity, Infinity, Infinity);
  let rankDirty = true;
  const rankScratch: { id: string; d: number }[] = [];

  function spawnEffect(fx: Effect): void {
    scene.scene.add(fx.object);
    effects.add(fx);
  }

  function startLayToRest(entry: GraveEntry): void {
    if (getOpts().reducedMotion) return; // instant state change under reduced motion
    entry.transient = 'laying-to-rest';
    entry.anim = 0;
    const p = entry.parts.group.position;
    spawnEffect(createGhost(new THREE.Vector3(p.x, 0.4, p.z)));
  }

  function startExhume(entry: GraveEntry): void {
    entries.delete(entry.taskId);
    labels.remove(entry.taskId);
    labelOrderDirty = true;
    rankDirty = true;
    if (hovered === entry.taskId) {
      hovered = null;
      labels.setHovered(null);
    }
    if (getOpts().reducedMotion) {
      scene.graveyard.remove(entry.parts.group);
      disposeGrave(entry.parts);
      return;
    }
    entry.transient = 'exhuming';
    entry.anim = 0;
    exhuming.add(entry);
    const p = entry.parts.group.position;
    spawnEffect(createDustBurst(new THREE.Vector3(p.x, 0.3, p.z)));
  }

  function reconcile(): void {
    const state = store.getState();
    const search = state.view.filter.search;
    const tasks = state.graveyardTasks();
    const reduced = getOpts().reducedMotion;
    const now = Date.now();
    const seen = new Set<string>();
    const haunts: Haunt[] = [];

    tasks.forEach((task, index) => {
      seen.add(task.id);
      const visual = visualOf(task, search, now);
      const sig = signature(visual);
      const pos = layoutPosition(index);
      labels.upsert(task.id, task);
      if (visual.due === 'overdue' && task.status === 'active') {
        haunts.push({ id: task.id, x: pos.x, z: pos.z });
      }

      const existing = entries.get(task.id);
      if (!existing) {
        const parts = buildGrave(visual);
        parts.group.userData.taskId = task.id;
        scene.graveyard.add(parts.group);
        const entry: GraveEntry = {
          taskId: task.id,
          parts,
          target: new THREE.Vector3(pos.x, 0, pos.z),
          rise: 1,
          sig,
          transient: 'idle',
          anim: 0,
          riseDelay: 0,
          lastStatus: task.status,
          label: { taskId: task.id, anchor: new THREE.Vector3(), dist: 0 },
        };
        if (reduced) {
          parts.group.position.set(pos.x, 0, pos.z);
        } else {
          entry.rise = 0;
          // Stagger entrances so a populated yard rises as a cascade, capped
          // so later graves don't wait too long.
          entry.riseDelay = Math.min(index * 0.12, 1.2);
          parts.group.position.set(pos.x, -parts.height - 0.3, pos.z);
        }
        entries.set(task.id, entry);
        labelOrderDirty = true;
        rankDirty = true;
      } else {
        if (sig !== existing.sig) {
          applyGraveVisual(existing.parts, visual);
          existing.sig = sig;
        }
        // Detect the active→completed transition → lay to rest.
        if (existing.lastStatus === 'active' && task.status === 'completed') {
          startLayToRest(existing);
        }
        existing.lastStatus = task.status;
        if (existing.target.x !== pos.x || existing.target.z !== pos.z) {
          existing.target.set(pos.x, 0, pos.z);
          rankDirty = true;
        }
        if (reduced) {
          existing.parts.group.position.x = pos.x;
          existing.parts.group.position.z = pos.z;
        }
      }
    });

    // Tasks gone from the store → exhume (deferred disposal) rather than snap.
    for (const [id, entry] of entries) {
      if (!seen.has(id)) startExhume(entry);
    }

    skeletons.setHaunts(haunts);
    scene.wake();
  }

  function rankDecorations(): void {
    const cfg = scene.config;
    decorEligible.clear();
    if (getOpts().reducedMotion || !cfg.decorations || cfg.maxDecoratedGraves <= 0) return;
    rankScratch.length = 0;
    const cam = scene.camera.position;
    for (const e of entries.values()) {
      rankScratch.push({ id: e.taskId, d: e.target.distanceToSquared(cam) });
    }
    rankScratch.sort((a, b) => a.d - b.d);
    const n = Math.min(rankScratch.length, cfg.maxDecoratedGraves);
    for (let i = 0; i < n; i++) decorEligible.add(rankScratch[i]!.id);
  }

  // --- per-frame: rise, re-layout easing, time-based effects, labels ---
  let lastReduced = getOpts().reducedMotion;
  let lastConfig = scene.config;

  const unregisterFrame = scene.onFrame((dt) => {
    elapsed += dt;
    let transitioning = false;
    let ambient = false;
    const reduced = getOpts().reducedMotion;
    const cfg = scene.config;

    // Re-rank decoration LOD only when the camera has moved, graves were
    // added/removed/re-laid-out, or the quality/motion gating changed.
    if (reduced !== lastReduced || cfg !== lastConfig) {
      lastReduced = reduced;
      lastConfig = cfg;
      rankDirty = true;
    }
    if (rankDirty || lastRankCam.distanceToSquared(scene.camera.position) > LOD_RERANK_DIST2) {
      rankDecorations();
      lastRankCam.copy(scene.camera.position);
      rankDirty = false;
    }

    // Skeletons follow the same quality / reduced-motion gating.
    const skeletonsOn = !reduced && cfg.decorations;
    skeletons.setVisible(skeletonsOn);
    if (skeletonsOn && skeletons.update(dt)) ambient = true;

    for (const entry of entries.values()) {
      const g = entry.parts.group;
      setDecorationsEnabled(entry.parts, decorEligible.has(entry.taskId));

      // Laying-to-rest: the ghost (spawned at trigger) rises while tickGrave
      // fades the glow and sinks the stone into its mound (targetSunk).
      if (entry.transient === 'laying-to-rest') {
        entry.anim = Math.min(1, entry.anim + dt / LAY_TO_REST_DUR);
        transitioning = true;
        if (entry.anim >= 1) entry.transient = 'idle';
      }

      if (entry.rise < 1) {
        if (entry.riseDelay > 0) {
          entry.riseDelay -= dt;
          g.position.y = -(entry.parts.height + 0.3);
        } else {
          if (entry.rise === 0) {
            // Headstone breaks the soil → dust kicks up (Requirement 4.7).
            spawnEffect(createDustBurst(new THREE.Vector3(g.position.x, 0.05, g.position.z), 60));
          }
          entry.rise = Math.min(1, entry.rise + dt * RISE_SPEED);
          g.position.y = -(entry.parts.height + 0.3) * (1 - easeOut(entry.rise));
        }
        transitioning = true;
      } else if (g.position.y !== 0) {
        g.position.y = 0;
      }

      // Ease horizontal position toward target (re-layout animation).
      const dx = entry.target.x - g.position.x;
      const dz = entry.target.z - g.position.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        const lerp = Math.min(1, dt * 4);
        g.position.x += dx * lerp;
        g.position.z += dz * lerp;
        transitioning = true;
      } else if (dx !== 0 || dz !== 0) {
        g.position.x = entry.target.x;
        g.position.z = entry.target.z;
      }

      // Material transitions + decorative effects. Under reduced motion,
      // settle materials instantly (dt = 1) and never report ambient motion.
      const t = tickGrave(entry.parts, reduced ? 1 : dt, elapsed);
      if (t === Tick.Transition) transitioning = true;
      else if (t === Tick.Ambient && !reduced) ambient = true;
    }

    // Exhuming graves: pull up out of the ground, then crumble (shrink+sink)
    // before disposal. The dust burst is a separate effect spawned at trigger.
    for (const entry of exhuming) {
      entry.anim = Math.min(1, entry.anim + dt / EXHUME_DUR);
      const g = entry.parts.group;
      const a = entry.anim;
      if (a < 0.4) {
        g.position.y = (a / 0.4) * 0.6; // pull up
      } else {
        const c = (a - 0.4) / 0.6; // crumble: drop and shrink to nothing
        g.position.y = 0.6 - c * 1.4;
        g.scale.setScalar(Math.max(0.001, 1 - c));
      }
      transitioning = true;
      if (entry.anim >= 1) {
        scene.graveyard.remove(entry.parts.group);
        disposeGrave(entry.parts);
        exhuming.delete(entry);
      }
    }

    // Transient effects (ghosts, dust).
    for (const fx of effects) {
      fx.update(dt);
      transitioning = true;
      if (fx.done()) {
        scene.scene.remove(fx.object);
        fx.dispose();
        effects.delete(fx);
      }
    }

    // Project HTML labels onto the graves (anchors reused across frames).
    if (labelOrderDirty) {
      labelOrder = [...entries.values()].map((e) => e.label);
      labelOrderDirty = false;
    }
    for (const entry of entries.values()) {
      const p = entry.parts.group.position;
      entry.label.anchor.set(p.x, p.y + entry.parts.height + 0.75, p.z);
    }
    labels.sync(scene.camera, labelOrder);

    if (transitioning) scene.wake();
    else if (ambient) scene.ambient();
  });

  // --- pointer interaction ---
  const pickTargets: THREE.Object3D[] = [];

  function updatePointer(ev: MouseEvent): void {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick(): string | null {
    raycaster.setFromCamera(pointer, scene.camera);
    pickTargets.length = 0;
    for (const e of entries.values()) pickTargets.push(e.parts.stoneMesh);
    const hits = raycaster.intersectObjects(pickTargets, false);
    if (hits.length === 0) return null;
    const group = hits[0]!.object.parent;
    const id = group?.userData.taskId;
    return typeof id === 'string' && entries.has(id) ? id : null;
  }

  function onPointerMove(ev: PointerEvent): void {
    pointerInside = true;
    updatePointer(ev);
    const hit = pick();
    if (hit !== hovered) {
      hovered = hit;
      dom.style.cursor = hit ? 'pointer' : 'grab';
      // The hovered grave's HTML card acts as the epitaph plaque (1.3).
      labels.setHovered(hit);
      scene.wake();
    }
  }

  function onPointerLeave(): void {
    pointerInside = false;
    hovered = null;
    labels.setHovered(null);
    dom.style.cursor = 'grab';
  }

  function onClick(ev: MouseEvent): void {
    if (!pointerInside) return;
    updatePointer(ev);
    const hit = pick();
    if (hit) onSelect(hit);
  }

  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerleave', onPointerLeave);
  dom.addEventListener('click', onClick);
  dom.style.cursor = 'grab';

  reconcile();
  const unsubscribe = store.subscribe(reconcile);
  // Time passes even when nothing is edited: re-derive due states so a task
  // crossing its due date starts weathering / gets haunted without a reload.
  const dueTimer = window.setInterval(reconcile, DUE_REFRESH_MS);

  function dispose(): void {
    unsubscribe();
    window.clearInterval(dueTimer);
    unregisterFrame();
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerleave', onPointerLeave);
    dom.removeEventListener('click', onClick);
    for (const entry of entries.values()) {
      scene.graveyard.remove(entry.parts.group);
      disposeGrave(entry.parts);
    }
    entries.clear();
    for (const entry of exhuming) {
      scene.graveyard.remove(entry.parts.group);
      disposeGrave(entry.parts);
    }
    exhuming.clear();
    for (const fx of effects) {
      scene.scene.remove(fx.object);
      fx.dispose();
    }
    effects.clear();
    labels.dispose();
    scene.graveyard.remove(skeletons.group);
    skeletons.dispose();
    disposeSharedGraveResources();
  }

  return { dispose };
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
