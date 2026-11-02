/**
 * Scene reconciler — the bridge between the task store and the Three.js scene
 * (design.md §5). Maintains a `Map<taskId, GraveEntry>` and on every store
 * change diffs tasks vs. the map:
 *   - new task      → build a grave, place it, play the rise animation
 *   - changed task  → update visual target + target position
 *   - removed task  → dispose geometry/materials and detach
 *
 * M3 adds visual state encoding: the grave's visual is derived from the task's
 * due state and the active search term, graves re-lay-out (and ease to new
 * positions) when the sort order changes, and time-based effects (crow flaps,
 * circling flock, pacing spirit, glow pulse) run per frame.
 *
 * Also owns pointer interaction: hover raycast shows the epitaph plaque; click
 * selects a grave and invokes onSelect (wired to the ledger's edit dialog).
 */
import * as THREE from 'three';
import { type SeanceStore } from '../store/task-store';
import { type Task } from '../model/types';
import { dueState } from '../model/query';
import { type SceneHandle } from './scene';
import {
  type GraveParts,
  type GraveVisual,
  applyGraveVisual,
  buildGrave,
  disposeGrave,
  tickGrave,
} from './grave';
import { createPlaque, type Plaque } from './plaque';

interface GraveEntry {
  taskId: string;
  parts: GraveParts;
  /** target world position; graves ease toward this (re-layout on sort). */
  target: THREE.Vector3;
  /** 0 → fully underground (rising), 1 → fully risen. */
  rise: number;
  /** cached visual signature to skip redundant target recomputation. */
  sig: string;
}

export interface Reconciler {
  dispose: () => void;
}

const RISE_SPEED = 2.2;
const PLOT_SPACING = 2.6;

/** Does the task match the (already-lowercased, non-empty) search term? */
function taskMatches(task: Task, q: string): boolean {
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.notes && task.notes.toLowerCase().includes(q)) return true;
  return false;
}

export function createReconciler(
  scene: SceneHandle,
  store: SeanceStore,
  onSelect: (taskId: string) => void,
  opts: { reducedMotion: boolean },
): Reconciler {
  const entries = new Map<string, GraveEntry>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: string | null = null;
  let pointerInside = false;
  let elapsed = 0;

  const plaque: Plaque = createPlaque();
  scene.scene.add(plaque.sprite);
  const dom = scene.renderer.domElement;

  function visualOf(task: Task, search: string): GraveVisual {
    const q = search.trim().toLowerCase();
    const searchActive = q.length > 0;
    return {
      priority: task.priority,
      status: task.status,
      due: dueState(task),
      searchActive,
      searchMatch: searchActive ? taskMatches(task, q) : false,
    };
  }

  function signature(v: GraveVisual): string {
    return `${v.priority}|${v.status}|${v.due}|${v.searchActive ? 1 : 0}|${
      v.searchMatch ? 1 : 0
    }`;
  }

  /**
   * Compute a grave's plot from its index in the *sorted visible* list, laid
   * out on a spiral. Using the sorted index means changing the sort order
   * re-positions graves — and the per-frame easing animates the move (4.2/2.2).
   */
  function layoutPosition(index: number): THREE.Vector3 {
    const ring = Math.floor(Math.sqrt(index));
    const idxInRing = index - ring * ring;
    return new THREE.Vector3(
      (idxInRing - ring) * PLOT_SPACING,
      0,
      -ring * PLOT_SPACING,
    );
  }

  function reconcile(): void {
    const search = store.getState().view.filter.search;
    const tasks = store.getState().graveyardTasks();
    const seen = new Set<string>();

    tasks.forEach((task, index) => {
      seen.add(task.id);
      const visual = visualOf(task, search);
      const sig = signature(visual);
      const pos = layoutPosition(index);

      const existing = entries.get(task.id);
      if (!existing) {
        const parts = buildGrave(visual);
        parts.group.userData.taskId = task.id;
        scene.graveyard.add(parts.group);
        const entry: GraveEntry = {
          taskId: task.id,
          parts,
          target: pos.clone(),
          rise: 1,
          sig,
        };
        if (opts.reducedMotion) {
          entry.rise = 1;
          parts.group.position.set(pos.x, 0, pos.z);
        } else {
          entry.rise = 0;
          parts.group.position.set(pos.x, -parts.height - 0.3, pos.z);
        }
        entries.set(task.id, entry);
      } else {
        if (sig !== existing.sig) {
          applyGraveVisual(existing.parts, visual);
          existing.sig = sig;
        }
        existing.target.copy(pos);
        if (opts.reducedMotion) {
          existing.parts.group.position.x = pos.x;
          existing.parts.group.position.z = pos.z;
        }
      }
    });

    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        scene.graveyard.remove(entry.parts.group);
        disposeGrave(entry.parts);
        entries.delete(id);
        if (hovered === id) hideHover();
      }
    }
    scene.wake();
  }

  function hideHover(): void {
    hovered = null;
    plaque.sprite.visible = false;
  }

  // --- per-frame: rise, re-layout easing, time-based effects, plaque ---
  const unregisterFrame = scene.onFrame((dt) => {
    elapsed += dt;
    let anyActive = false;

    for (const entry of entries.values()) {
      const g = entry.parts.group;

      if (entry.rise < 1) {
        entry.rise = Math.min(1, entry.rise + dt * RISE_SPEED);
        g.position.y = -(entry.parts.height + 0.3) * (1 - easeOut(entry.rise));
        anyActive = true;
      } else {
        g.position.y = 0;
      }

      // ease horizontal position toward target (re-layout animation)
      const lerp = Math.min(1, dt * 4);
      const dx = entry.target.x - g.position.x;
      const dz = entry.target.z - g.position.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        g.position.x += dx * lerp;
        g.position.z += dz * lerp;
        anyActive = true;
      }

      // material transitions + decorative effects
      if (!opts.reducedMotion) {
        if (tickGrave(entry.parts, dt, elapsed)) anyActive = true;
      } else {
        // still settle materials instantly when reduced motion
        tickGrave(entry.parts, 1, elapsed);
      }
    }

    if (hovered) {
      const entry = entries.get(hovered);
      if (entry) {
        const p = entry.parts.group.position;
        plaque.sprite.position.set(p.x, p.y + entry.parts.height + 0.9, p.z);
      }
    }

    // Keep the loop at full rate while anything is still animating
    // (crows/spirit are continuous, so overdue/due-soon graves stay lively).
    if (anyActive) scene.wake();
  });

  // --- pointer interaction ---
  function updatePointer(ev: MouseEvent): void {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick(): GraveEntry | null {
    raycaster.setFromCamera(pointer, scene.camera);
    const meshes: THREE.Object3D[] = [];
    for (const e of entries.values()) meshes.push(e.parts.stoneMesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hitMesh = hits[0]!.object;
    for (const e of entries.values()) {
      if (e.parts.stoneMesh === hitMesh) return e;
    }
    return null;
  }

  function onPointerMove(ev: PointerEvent): void {
    pointerInside = true;
    updatePointer(ev);
    const hit = pick();
    if (!hit) {
      if (hovered) hideHover();
      dom.style.cursor = 'grab';
      return;
    }
    dom.style.cursor = 'pointer';
    if (hovered !== hit.taskId) {
      hovered = hit.taskId;
      const task = store.getState().tasks.find((t) => t.id === hit.taskId);
      if (task) {
        const sub =
          task.priority.toUpperCase() +
          ' priority' +
          (task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : '');
        plaque.setText(task.title, sub);
        plaque.sprite.visible = true;
      }
    }
    scene.wake();
  }

  function onPointerLeave(): void {
    pointerInside = false;
    hideHover();
    dom.style.cursor = 'grab';
  }

  function onClick(ev: MouseEvent): void {
    if (!pointerInside) return;
    updatePointer(ev);
    const hit = pick();
    if (hit) onSelect(hit.taskId);
  }

  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerleave', onPointerLeave);
  dom.addEventListener('click', onClick);
  dom.style.cursor = 'grab';

  reconcile();
  const unsubscribe = store.subscribe(reconcile);

  function dispose(): void {
    unsubscribe();
    unregisterFrame();
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerleave', onPointerLeave);
    dom.removeEventListener('click', onClick);
    for (const entry of entries.values()) {
      scene.graveyard.remove(entry.parts.group);
      disposeGrave(entry.parts);
    }
    entries.clear();
    scene.scene.remove(plaque.sprite);
    plaque.dispose();
  }

  return { dispose };
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
