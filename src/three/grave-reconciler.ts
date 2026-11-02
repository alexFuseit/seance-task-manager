/**
 * Scene reconciler — the bridge between the task store and the Three.js scene
 * (design.md §5). Maintains a `Map<taskId, GraveEntry>` and on every store
 * change diffs tasks vs. the map:
 *   - new task      → build a grave, place it, play the rise animation
 *   - changed task  → update material/visual + target position
 *   - removed task  → dispose geometry/materials and detach
 *
 * Also owns pointer interaction: hover raycast highlights a grave and shows the
 * epitaph plaque; click selects a grave and invokes the supplied onSelect
 * (wired to the ledger's edit dialog).
 */
import * as THREE from 'three';
import { type SeanceStore } from '../store/task-store';
import { type Task } from '../model/types';
import { type SceneHandle } from './scene';
import {
  type GraveParts,
  type GraveVisual,
  applyGraveVisual,
  buildGrave,
  disposeGrave,
} from './grave';
import { createPlaque, type Plaque } from './plaque';

interface GraveEntry {
  taskId: string;
  parts: GraveParts;
  /** target world position (graves lerp toward this for re-layout later). */
  target: THREE.Vector3;
  /** 0 → fully underground (rising), 1 → fully risen. */
  rise: number;
  /** cached visual signature to skip redundant material updates. */
  sig: string;
}

export interface Reconciler {
  dispose: () => void;
}

function visualOf(task: Task): GraveVisual {
  return { priority: task.priority, status: task.status };
}

function signature(task: Task): string {
  return `${task.priority}|${task.status}`;
}

const RISE_SPEED = 2.2; // units of "rise" per second (so ~0.45s to rise)

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

  const plaque: Plaque = createPlaque();
  scene.scene.add(plaque.sprite);

  const dom = scene.renderer.domElement;

  function placeGrave(entry: GraveEntry, task: Task, animate: boolean): void {
    entry.target.set(task.plot.x, 0, task.plot.z);
    entry.parts.group.position.set(task.plot.x, 0, task.plot.z);
    if (animate) {
      entry.rise = 0;
      entry.parts.group.position.y = -entry.parts.height - 0.3;
    } else {
      entry.rise = 1;
      entry.parts.group.position.y = 0;
    }
  }

  function reconcile(): void {
    const tasks = store.getState().visibleTasks();
    const seen = new Set<string>();

    for (const task of tasks) {
      seen.add(task.id);
      const existing = entries.get(task.id);
      if (!existing) {
        // New grave.
        const parts = buildGrave(visualOf(task));
        parts.group.userData.taskId = task.id;
        scene.graveyard.add(parts.group);
        const entry: GraveEntry = {
          taskId: task.id,
          parts,
          target: new THREE.Vector3(),
          rise: 1,
          sig: signature(task),
        };
        placeGrave(entry, task, !opts.reducedMotion);
        entries.set(task.id, entry);
      } else {
        // Possibly-changed grave.
        const sig = signature(task);
        if (sig !== existing.sig) {
          applyGraveVisual(existing.parts, visualOf(task));
          existing.sig = sig;
        }
        existing.target.set(task.plot.x, 0, task.plot.z);
      }
    }

    // Remove graves whose tasks are gone (deleted or filtered out).
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

  // --- per-frame: rise animation + layout easing + plaque follow ---
  const unregisterFrame = scene.onFrame((dt) => {
    for (const entry of entries.values()) {
      if (entry.rise < 1) {
        entry.rise = Math.min(1, entry.rise + dt * RISE_SPEED);
        const y = -(entry.parts.height + 0.3) * (1 - easeOut(entry.rise));
        entry.parts.group.position.y = y;
        scene.wake();
      }
      // ease horizontal position toward target (for future re-layout)
      entry.parts.group.position.x +=
        (entry.target.x - entry.parts.group.position.x) * Math.min(1, dt * 4);
      entry.parts.group.position.z +=
        (entry.target.z - entry.parts.group.position.z) * Math.min(1, dt * 4);
    }

    if (hovered) {
      const entry = entries.get(hovered);
      if (entry) {
        const p = entry.parts.group.position;
        plaque.sprite.position.set(p.x, p.y + entry.parts.height + 0.9, p.z);
      }
    }
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
          (task.priority.toUpperCase() + ' priority') +
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

  // Initial build + subscribe.
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
