/**
 * HTML label layer (Option A) — projects each 3D grave's world position to
 * screen space and renders a compact task card (title · date · priority pill)
 * anchored above the stone. This binds the mockup's crisp card styling directly
 * to the navigable 3D graves instead of a separate flat row.
 *
 * Only the nearest N graves show labels (always-on for those, to keep a
 * populated yard readable without clutter); labels behind the camera or beyond
 * a distance cutoff are hidden. Cards scale subtly with distance and fade at
 * the far edge. Clicking a card selects the task (opens the editor).
 *
 * The layer is a DOM overlay inside the canvas host; it uses pointer-events
 * only on the cards themselves so OrbitControls drag still works everywhere
 * else.
 */
import * as THREE from 'three';
import { type Task, type Priority } from '../model/types';
import { dueState } from '../model/query';
import { el } from '../ui/dom';

/** How many of the nearest graves show an always-on label. */
const MAX_LABELS = 8;
/** Graves beyond this world distance from the camera never show a label. */
const MAX_LABEL_DISTANCE = 42;

interface LabelEntry {
  root: HTMLElement;
  title: HTMLElement;
  date: HTMLElement;
  pill: HTMLElement;
  icon: HTMLElement;
  lastClass: string;
  /** whether the card is currently displayed (avoids redundant style writes). */
  shown: boolean;
}

export interface LabelAnchor {
  taskId: string;
  /** world-space anchor point (top of the stone). */
  anchor: THREE.Vector3;
  /** scratch: camera distance, filled in by sync(). */
  dist: number;
}

export interface LabelLayer {
  /** Ensure a label exists for a task and update its text/visual. */
  upsert: (taskId: string, task: Task) => void;
  /** Remove a label (grave exhumed / gone). */
  remove: (taskId: string) => void;
  /**
   * Per-frame: project world positions to the screen and show the nearest N.
   * The `order` array is sorted in place (callers reuse it across frames to
   * avoid per-frame allocation).
   */
  sync: (camera: THREE.PerspectiveCamera, order: LabelAnchor[]) => void;
  /** Mark the hovered grave: its card is always shown, crisp and on top. */
  setHovered: (taskId: string | null) => void;
  dispose: () => void;
}

function priorityLabel(p: Priority): string {
  return p === 'high' ? 'High Priority' : p === 'medium' ? 'Medium' : 'Low';
}

function formatDue(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const today = new Date(now);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Today';
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function createLabelLayer(
  container: HTMLElement,
  onSelect: (taskId: string) => void,
): LabelLayer {
  const layer = el('div', { class: 'label-layer', 'aria-hidden': 'true' });
  container.append(layer);

  const labels = new Map<string, LabelEntry>();
  const projected = new THREE.Vector3();
  const shown = new Set<string>();
  let hoveredId: string | null = null;

  function setHovered(taskId: string | null): void {
    hoveredId = taskId;
  }

  function upsert(taskId: string, task: Task): void {
    let entry = labels.get(taskId);
    if (!entry) {
      const icon = el('span', { class: 'gl-icon' });
      const title = el('span', { class: 'gl-title' });
      const date = el('span', { class: 'gl-date' });
      const pill = el('span', { class: 'gl-pill' });
      const root = el('button', { type: 'button', class: 'grave-label' }, [
        icon,
        title,
        date,
        pill,
      ]) as HTMLButtonElement;
      root.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(taskId);
      });
      layer.append(root);
      root.style.display = 'none';
      entry = { root, title, date, pill, icon, lastClass: '', shown: false };
      labels.set(taskId, entry);
    }

    const now = Date.now();
    const completed = task.status === 'completed';
    const cls = `grave-label ${completed ? 'completed' : task.priority}`;
    if (cls !== entry.lastClass) {
      entry.root.className = cls;
      entry.lastClass = cls;
      // simple glyphs (self-made, no asset dependency)
      entry.icon.textContent = completed
        ? '✓'
        : task.priority === 'high'
          ? '!'
          : task.priority === 'medium'
            ? '◷'
            : '✦';
    }
    entry.title.textContent = task.title;

    const dueStr = formatDue(task.dueDate, now);
    entry.date.textContent = dueStr;
    entry.date.style.display = dueStr ? '' : 'none';

    if (completed) {
      entry.pill.textContent = 'Completed';
    } else {
      entry.pill.textContent = priorityLabel(task.priority);
    }
    // overdue emphasis
    entry.root.classList.toggle(
      'overdue',
      !completed && dueState(task, now) === 'overdue',
    );
  }

  function remove(taskId: string): void {
    const entry = labels.get(taskId);
    if (!entry) return;
    entry.root.remove();
    labels.delete(taskId);
  }

  function sync(camera: THREE.PerspectiveCamera, order: LabelAnchor[]): void {
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Rank by camera distance; only the nearest MAX_LABELS in front of the
    // camera get shown.
    for (const o of order) o.dist = o.anchor.distanceTo(camera.position);
    order.sort((a, b) => a.dist - b.dist);

    shown.clear();
    for (let i = 0; i < order.length; i++) {
      const item = order[i]!;
      // Beyond the nearest-N budget only the hovered grave still gets a card
      // (it doubles as the hover epitaph plaque, Requirement 1.3).
      const isHovered = item.taskId === hoveredId;
      if (!isHovered && (shown.size >= MAX_LABELS || item.dist > MAX_LABEL_DISTANCE)) continue;
      const entry = labels.get(item.taskId);
      if (!entry) continue;
      projected.copy(item.anchor).project(camera);
      if (projected.z > 1) continue; // behind the camera
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      // Distance → scale + opacity falloff for depth cueing (hovered = crisp).
      const t = isHovered ? 0 : THREE.MathUtils.clamp(item.dist / MAX_LABEL_DISTANCE, 0, 1);
      const scale = THREE.MathUtils.lerp(1, 0.62, t);
      const opacity = THREE.MathUtils.lerp(1, 0.45, t);
      const style = entry.root.style;
      if (!entry.shown) {
        style.display = 'flex';
        entry.shown = true;
      }
      style.left = `${x.toFixed(1)}px`;
      style.top = `${y.toFixed(1)}px`;
      style.transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      style.opacity = opacity.toFixed(3);
      // nearer labels sit above farther ones; the hovered card tops them all
      style.zIndex = isHovered ? '2000' : String(1000 - Math.round(item.dist * 10));
      entry.root.classList.toggle('hovered', isHovered);
      shown.add(item.taskId);
    }

    for (const [taskId, entry] of labels) {
      if (entry.shown && !shown.has(taskId)) {
        entry.root.style.display = 'none';
        entry.shown = false;
      }
    }
  }

  function dispose(): void {
    for (const entry of labels.values()) entry.root.remove();
    labels.clear();
    layer.remove();
  }

  return { upsert, remove, sync, setHovered, dispose };
}
