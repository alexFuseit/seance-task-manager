/**
 * App shell — owns the persistent gothic sidebar (shared by both screens), the
 * view toggle between the 3D graveyard (wrapped in shell.ts chrome) and the 2D
 * ledger, and the function-first fallback: if WebGL is unavailable the app
 * stays on the ledger (Requirement 7.3).
 *
 * The ledger is always mounted (canonical accessible surface). The 3D scene and
 * its chrome are created lazily the first time the graveyard view is shown.
 */
import { type SeanceStore } from '../store/task-store';
import { mountLedger, type LedgerHandle } from './ledger';
import { mountShell, type ShellHandle } from './shell';
import { mountSidebar, type SidebarHandle, type NavKey } from './sidebar';
import { el } from './dom';
import { isWebGLAvailable } from '../three/webgl';
import { createAmbientAudio } from '../audio/ambient';
import type { SceneHandle } from '../three/scene';
import type { Reconciler } from '../three/grave-reconciler';
import type { World } from '../three/world';

type View = 'graveyard' | 'ledger';

export function mountApp(parent: HTMLElement, store: SeanceStore): () => void {
  const webgl = isWebGLAvailable();
  const audio = createAmbientAudio();

  // --- persistent sidebar (shared by both views) ---
  const sidebar: SidebarHandle = mountSidebar(parent, {
    store,
    onNavigate: (key) => handleNav(key),
  });

  // --- 3D container (hidden until first shown); lives behind the chrome ---
  const canvasHost = el('div', { class: 'canvas-host', 'aria-hidden': 'true' });
  canvasHost.style.display = 'none';
  parent.append(canvasHost);

  // --- ledger (always mounted, canonical accessible surface) ---
  const ledger: LedgerHandle = mountLedger(parent, store);
  if (!webgl) {
    ledger.setGraveyardAvailable(false);
  }
  ledger.onEnterGraveyard(() => {
    if (webgl) void setView('graveyard');
  });

  let view: View = 'ledger';
  let scene: SceneHandle | null = null;
  let reconciler: Reconciler | null = null;
  let world: World | null = null;
  let shell: ShellHandle | null = null;
  let lastQuality = store.getState().settings.quality;

  async function ensureScene(): Promise<void> {
    if (scene) return;
    const [{ createScene }, { createReconciler }, { createWorld }, { configForQuality }] =
      await Promise.all([
        import('../three/scene'),
        import('../three/grave-reconciler'),
        import('../three/world'),
        import('../three/quality'),
      ]);
    if (scene) return;
    scene = createScene(canvasHost, configForQuality(store.getState().settings.quality));
    reconciler = createReconciler(
      scene,
      store,
      (taskId) => ledger.openEditor(taskId),
      () => ({ reducedMotion: store.getState().settings.reducedMotion }),
    );
    world = createWorld({
      scene: scene.scene,
      fog: scene.fog,
      moonLight: scene.moonLight,
      rimLight: scene.rimLight,
      hemiLight: scene.hemiLight,
      sky: scene.sky,
    });
    const w = world;
    const s = scene;
    s.onFrame((dt) => {
      w.update(store, dt);
      s.wake();
    });

    void import('../three/quality').then(({ configForQuality: cfg }) => {
      store.subscribe((state) => {
        if (state.settings.quality !== lastQuality) {
          lastQuality = state.settings.quality;
          scene?.applyConfig(cfg(state.settings.quality));
        }
      });
    });
  }

  function ensureShell(): void {
    if (shell) return;
    shell = mountShell(parent, {
      store,
      onSelect: (taskId) => ledger.openEditor(taskId),
      onAdd: () => void setView('ledger').then(() => ledger.focusQuickAdd()),
      onOpenLedger: () => void setView('ledger'),
      audio,
      webglAvailable: webgl,
    });
  }

  async function setView(next: View): Promise<void> {
    view = next;
    const inGraveyard = view === 'graveyard';
    if (inGraveyard) {
      await ensureScene();
      ensureShell();
    }
    const show = view === 'graveyard';

    canvasHost.style.display = show ? 'block' : 'none';
    canvasHost.setAttribute('aria-hidden', show ? 'false' : 'true');
    ledger.element.style.display = show ? 'none' : 'block';
    ledger.element.setAttribute('aria-hidden', show ? 'true' : 'false');
    shell?.setVisible(show);
    document.body.classList.toggle('shell-active', show);
    sidebar.setActive(show ? 'graveyard' : currentLedgerNav);

    if (show && scene) scene.wake();
  }

  // Which sidebar item is active while on the ledger (graveyard vs completed).
  let currentLedgerNav: NavKey = 'graveyard';

  function handleNav(key: NavKey): void {
    switch (key) {
      case 'graveyard':
        // Clear the completed filter and show the 3D graveyard (if available).
        store.getState().setFilter({ status: 'all' });
        currentLedgerNav = 'graveyard';
        if (webgl) void setView('graveyard');
        else sidebar.setActive('graveyard');
        break;
      case 'completed':
        store.getState().setFilter({ status: 'completed' });
        currentLedgerNav = 'completed';
        void setView('ledger');
        sidebar.setActive('completed');
        break;
      case 'settings':
      case 'about':
        // Both route to the ledger (the functional surface) for now.
        currentLedgerNav = 'graveyard';
        void setView('ledger');
        sidebar.setActive(key);
        break;
    }
  }

  void setView('ledger');

  return function dispose(): void {
    reconciler?.dispose();
    world?.dispose();
    scene?.dispose();
    shell?.unsubscribe();
    sidebar.unsubscribe();
    audio.dispose();
    ledger.unsubscribe();
    canvasHost.remove();
    ledger.element.remove();
    sidebar.element.remove();
    document.body.classList.remove('shell-active');
  };
}
