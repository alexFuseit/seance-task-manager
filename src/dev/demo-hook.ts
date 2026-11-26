/**
 * Dev-only automation hook for the scripted demo-video capture
 * (scripts/demo/). Installed on `window.__seance` ONLY when
 * `import.meta.env.DEV` is true — production builds never include it.
 *
 * It lets a Playwright script drive the app deterministically: swap views,
 * mutate the store, take over the camera, and find where a task's grave sits.
 */
import { type SeanceStore } from '../store/task-store';
import { layoutPosition, plotsPerRow } from '../three/grave-visual';
import type { SceneHandle } from '../three/scene';

export interface DemoHook {
  store: SeanceStore;
  setView: (view: 'graveyard' | 'ledger') => Promise<void>;
  /** the 3D scene once the graveyard has been shown at least once. */
  scene: () => SceneHandle | null;
  /**
   * Take over (true) or release (false) the camera. While taken over, user
   * controls and damping are off and the render loop is kept at full rate
   * every frame (no idle throttling), so captured frames never repeat.
   */
  directCamera: (on: boolean) => void;
  /** place the camera at (px,py,pz) looking at (tx,ty,tz). */
  setCameraPose: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void;
  /** world-space plot (x, z) of a task's grave in the current layout, or null. */
  graveXZ: (taskId: string) => { x: number; z: number } | null;
}

declare global {
  interface Window {
    __seance?: DemoHook;
  }
}

export function installDemoHook(
  store: SeanceStore,
  setView: (view: 'graveyard' | 'ledger') => Promise<void>,
  getScene: () => SceneHandle | null,
): void {
  let directing = false;
  let unregisterWake: (() => void) | null = null;

  window.__seance = {
    store,
    setView,
    scene: getScene,
    directCamera(on) {
      const s = getScene();
      if (!s) throw new Error('graveyard not shown yet — call setView("graveyard") first');
      directing = on;
      s.controls.enabled = !on;
      s.controls.enableDamping = !on;
      unregisterWake?.();
      unregisterWake = on ? s.onFrame(() => s.wake()) : null;
    },
    setCameraPose(px, py, pz, tx, ty, tz) {
      const s = getScene();
      if (!s || !directing) return;
      s.camera.position.set(px, py, pz);
      s.controls.target.set(tx, ty, tz);
      s.camera.lookAt(tx, ty, tz);
      s.controls.update();
      s.wake();
    },
    graveXZ(taskId) {
      const tasks = store.getState().graveyardTasks();
      const i = tasks.findIndex((t) => t.id === taskId);
      if (i < 0) return null;
      return layoutPosition(i, plotsPerRow(tasks.length));
    },
  };
}
