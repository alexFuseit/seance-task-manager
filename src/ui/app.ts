/**
 * App shell — owns the view toggle between the 3D graveyard and the 2D ledger,
 * and enforces the function-first fallback: if WebGL is unavailable the toggle
 * is disabled and the app stays on the ledger with a short notice
 * (Requirement 7.3).
 *
 * The ledger is always mounted (it is the canonical surface). The 3D scene is
 * created lazily the first time the graveyard view is shown, so a user who
 * never leaves the ledger pays no WebGL cost.
 */
import { type SeanceStore } from '../store/task-store';
import { mountLedger, type LedgerHandle } from './ledger';
import { el } from './dom';
import { isWebGLAvailable } from '../three/webgl';
import type { SceneHandle } from '../three/scene';
import type { Reconciler } from '../three/grave-reconciler';

type View = 'graveyard' | 'ledger';

export function mountApp(parent: HTMLElement, store: SeanceStore): () => void {
  const webgl = isWebGLAvailable();

  // --- top bar with the view toggle ---
  const toggleBtn = el('button', {
    type: 'button',
    class: 'primary view-toggle',
    'aria-pressed': 'false',
  }) as HTMLButtonElement;

  const notice = el('span', { class: 'view-notice' });

  const topbar = el('div', { class: 'topbar', role: 'toolbar', 'aria-label': 'View' }, [
    toggleBtn,
    notice,
  ]);
  parent.append(topbar);

  // --- 3D container (hidden until first shown) ---
  const canvasHost = el('div', { class: 'canvas-host', 'aria-hidden': 'true' });
  canvasHost.style.display = 'none';
  parent.append(canvasHost);

  // --- ledger (always mounted) ---
  const ledger: LedgerHandle = mountLedger(parent, store);

  let view: View = 'ledger';
  let scene: SceneHandle | null = null;
  let reconciler: Reconciler | null = null;

  async function ensureScene(): Promise<void> {
    if (scene) return;
    // Lazy-load the Three.js layer so the ledger-only path never downloads it.
    const [{ createScene }, { createReconciler }] = await Promise.all([
      import('../three/scene'),
      import('../three/grave-reconciler'),
    ]);
    if (scene) return; // guard against double-trigger while awaiting
    scene = createScene(canvasHost);
    reconciler = createReconciler(
      scene,
      store,
      (taskId) => {
        // Click-to-select in 3D opens the ledger's edit dialog.
        ledger.openEditor(taskId);
      },
      { reducedMotion: store.getState().settings.reducedMotion },
    );
  }

  async function setView(next: View): Promise<void> {
    view = next;
    const inGraveyard = view === 'graveyard';
    if (inGraveyard) await ensureScene();
    // The view may have changed while the chunk loaded; re-check.
    const show = view === 'graveyard';

    canvasHost.style.display = show ? 'block' : 'none';
    canvasHost.setAttribute('aria-hidden', show ? 'false' : 'true');
    ledger.element.style.display = show ? 'none' : 'block';
    ledger.element.setAttribute('aria-hidden', show ? 'true' : 'false');

    toggleBtn.setAttribute('aria-pressed', String(show));
    toggleBtn.textContent = show ? '📜 Open the ledger' : '🪦 Enter the graveyard';

    if (show && scene) scene.wake();
  }

  if (webgl) {
    toggleBtn.textContent = '🪦 Enter the graveyard';
    toggleBtn.addEventListener('click', () => {
      toggleBtn.disabled = true;
      void setView(view === 'graveyard' ? 'ledger' : 'graveyard').finally(() => {
        toggleBtn.disabled = false;
      });
    });
  } else {
    // Function-first fallback: no WebGL → ledger only.
    toggleBtn.textContent = '🪦 Graveyard unavailable';
    toggleBtn.disabled = true;
    notice.textContent =
      'WebGL is unavailable in this browser — showing the accessible ledger.';
  }

  void setView('ledger');

  return function dispose(): void {
    reconciler?.dispose();
    scene?.dispose();
    ledger.unsubscribe();
    topbar.remove();
    canvasHost.remove();
    ledger.element.remove();
  };
}
