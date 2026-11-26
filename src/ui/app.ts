/**
 * App shell — owns the persistent gothic sidebar (shared by both screens), the
 * view toggle between the 3D graveyard (wrapped in shell.ts chrome) and the 2D
 * ledger, the Settings/About dialogs, and the function-first fallback: if
 * WebGL is unavailable the app stays on the ledger (Requirement 7.3).
 *
 * The ledger is always mounted (canonical accessible surface). The 3D scene and
 * its chrome are created lazily the first time the graveyard view is shown.
 */
import { type SeanceStore } from '../store/task-store';
import { mountLedger, type LedgerHandle } from './ledger';
import { mountShell, type ShellHandle } from './shell';
import { mountSidebar, type SidebarHandle, type NavKey } from './sidebar';
import { mountAboutDialog, mountSettingsDialog, type SoundControl } from './settings';
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
  const cleanups: (() => void)[] = [];

  // One sound control shared by the shell toggle and the Settings dialog, so
  // the audio graph and the persisted `muted` setting never disagree.
  const sound: SoundControl = {
    isEnabled: () => audio.isEnabled(),
    async set(on) {
      if (on) await audio.enable();
      else audio.disable();
      const enabled = audio.isEnabled();
      store.getState().updateSettings({ muted: !enabled });
      return enabled;
    },
  };

  // Audio is gesture-gated: if the user left sound on last time, resume it on
  // their first interaction rather than autoplaying.
  if (!store.getState().settings.muted) {
    const resume = (): void => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      if (!store.getState().settings.muted) void sound.set(true);
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    cleanups.push(() => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    });
  }

  // --- persistent sidebar (shared by both views) ---
  const sidebar: SidebarHandle = mountSidebar(parent, {
    store,
    onNavigate: (key) => handleNav(key),
  });

  // --- dialogs ---
  const settingsDialog = mountSettingsDialog(store, sound);
  const aboutDialog = mountAboutDialog();
  // Restore the sidebar highlight to the current view when a dialog closes.
  settingsDialog.onClose(() => sidebar.setActive(activeNav()));
  aboutDialog.onClose(() => sidebar.setActive(activeNav()));

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
    const s = createScene(canvasHost, configForQuality(store.getState().settings.quality));
    scene = s;
    reconciler = createReconciler(
      s,
      store,
      (taskId) => ledger.openEditor(taskId),
      () => ({ reducedMotion: store.getState().settings.reducedMotion }),
    );
    const w = createWorld({
      scene: s.scene,
      fog: s.fog,
      moonLight: s.moonLight,
      rimLight: s.rimLight,
      hemiLight: s.hemiLight,
      sky: s.sky,
    });
    world = w;
    // Only keep the loop at full rate while the atmosphere is still easing;
    // once settled the scene can drop to its idle/ambient rate.
    s.onFrame((dt) => {
      if (w.update(store, dt)) s.wake();
    });

    // Apply quality-tier changes at runtime.
    let lastQuality = store.getState().settings.quality;
    cleanups.push(
      store.subscribe((state) => {
        if (state.settings.quality !== lastQuality) {
          lastQuality = state.settings.quality;
          s.applyConfig(configForQuality(lastQuality));
        }
      }),
    );
  }

  function ensureShell(): void {
    if (shell) return;
    shell = mountShell(parent, {
      store,
      onSelect: (taskId) => ledger.openEditor(taskId),
      onAdd: () => void setView('ledger').then(() => ledger.focusQuickAdd()),
      onOpenLedger: () => void setView('ledger'),
      sound,
      webglAvailable: webgl,
    });
  }

  async function setView(next: View): Promise<void> {
    view = next;
    const show = view === 'graveyard';
    if (show) {
      await ensureScene();
      ensureShell();
    }

    canvasHost.style.display = show ? 'block' : 'none';
    canvasHost.setAttribute('aria-hidden', show ? 'false' : 'true');
    ledger.element.style.display = show ? 'none' : 'block';
    ledger.element.setAttribute('aria-hidden', show ? 'true' : 'false');
    shell?.setVisible(show);
    document.body.classList.toggle('shell-active', show);
    sidebar.setActive(activeNav());

    if (show && scene) scene.wake();
  }

  // Which sidebar item is active while on the ledger (graveyard vs completed).
  let currentLedgerNav: NavKey = 'graveyard';

  function activeNav(): NavKey {
    return view === 'graveyard' ? 'graveyard' : currentLedgerNav;
  }

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
        break;
      case 'settings':
        sidebar.setActive('settings');
        settingsDialog.open();
        break;
      case 'about':
        sidebar.setActive('about');
        aboutDialog.open();
        break;
    }
  }

  void setView('ledger');

  // Dev-only: scripted demo-capture hook (scripts/demo/). Tree-shaken from
  // production builds because import.meta.env.DEV is statically false there.
  if (import.meta.env.DEV) {
    void import('../dev/demo-hook').then(({ installDemoHook }) =>
      installDemoHook(store, setView, () => scene),
    );
  }

  return function dispose(): void {
    for (const c of cleanups) c();
    reconciler?.dispose();
    world?.dispose();
    scene?.dispose();
    shell?.unsubscribe();
    shell?.element.remove();
    sidebar.unsubscribe();
    settingsDialog.dispose();
    aboutDialog.dispose();
    audio.dispose();
    ledger.unsubscribe();
    canvasHost.remove();
    ledger.element.remove();
    sidebar.element.remove();
    document.body.classList.remove('shell-active');
  };
}
