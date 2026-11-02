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
import { type Quality } from '../model/types';
import { mountLedger, type LedgerHandle } from './ledger';
import { el } from './dom';
import { isWebGLAvailable } from '../three/webgl';
import { createAmbientAudio } from '../audio/ambient';
import type { SceneHandle } from '../three/scene';
import type { Reconciler } from '../three/grave-reconciler';
import type { World } from '../three/world';

type View = 'graveyard' | 'ledger';

export function mountApp(parent: HTMLElement, store: SeanceStore): () => void {
  const webgl = isWebGLAvailable();

  // --- top bar with the view toggle + mute toggle ---
  const toggleBtn = el('button', {
    type: 'button',
    class: 'primary view-toggle',
    'aria-pressed': 'false',
  }) as HTMLButtonElement;

  const notice = el('span', { class: 'view-notice' });

  // Ambient audio — default muted, gesture-gated (Requirement 5.4).
  const audio = createAmbientAudio();
  const muteBtn = el('button', {
    type: 'button',
    class: 'ghost mute-toggle',
    'aria-pressed': 'false',
  }) as HTMLButtonElement;

  function syncMuteBtn(): void {
    const on = audio.isEnabled();
    muteBtn.setAttribute('aria-pressed', String(on));
    muteBtn.textContent = on ? '🔊 Sound on' : '🔇 Sound off';
  }
  syncMuteBtn();

  muteBtn.addEventListener('click', () => {
    void audio.toggle().then((on) => {
      store.getState().updateSettings({ muted: !on });
      syncMuteBtn();
    });
  });

  // Quality tier select (Requirement 6.2).
  const qualitySelect = el('select', { class: 'quality-select', 'aria-label': 'Graphics quality' }, [
    el('option', { value: 'high' }, ['Quality: High']),
    el('option', { value: 'medium' }, ['Quality: Medium']),
    el('option', { value: 'low' }, ['Quality: Low']),
  ]) as HTMLSelectElement;
  qualitySelect.value = store.getState().settings.quality;
  qualitySelect.addEventListener('change', () => {
    store.getState().updateSettings({ quality: qualitySelect.value as Quality });
  });

  // Reduced-motion toggle (Requirement 7.2) — reflects and overrides the OS pref.
  const reducedCb = el('input', { type: 'checkbox', id: 'reduced-motion' }) as HTMLInputElement;
  reducedCb.checked = store.getState().settings.reducedMotion;
  reducedCb.addEventListener('change', () => {
    store.getState().updateSettings({ reducedMotion: reducedCb.checked });
  });
  const reducedLabel = el('label', { for: 'reduced-motion', class: 'reduced-label' }, [
    reducedCb,
    ' Reduce motion',
  ]);

  const topbar = el('div', { class: 'topbar', role: 'toolbar', 'aria-label': 'View, sound and quality' }, [
    toggleBtn,
    muteBtn,
    qualitySelect,
    reducedLabel,
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
  let world: World | null = null;
  let lastQuality = store.getState().settings.quality;

  async function ensureScene(): Promise<void> {
    if (scene) return;
    // Lazy-load the Three.js layer so the ledger-only path never downloads it.
    const [{ createScene }, { createReconciler }, { createWorld }, { configForQuality }] =
      await Promise.all([
        import('../three/scene'),
        import('../three/grave-reconciler'),
        import('../three/world'),
        import('../three/quality'),
      ]);
    if (scene) return; // guard against double-trigger while awaiting
    scene = createScene(canvasHost, configForQuality(store.getState().settings.quality));
    reconciler = createReconciler(
      scene,
      store,
      (taskId) => {
        // Click-to-select in 3D opens the ledger's edit dialog.
        ledger.openEditor(taskId);
      },
      // Read reduced-motion live so a runtime toggle takes effect.
      () => ({ reducedMotion: store.getState().settings.reducedMotion }),
    );
    // World atmosphere: day/night, fog, blood moon — updated each frame.
    world = createWorld({
      scene: scene.scene,
      fog: scene.fog,
      moonLight: scene.moonLight,
      hemiLight: scene.hemiLight,
    });
    const w = world;
    const s = scene;
    s.onFrame((dt) => {
      w.update(store, dt);
      s.wake(); // atmosphere eases continuously while in view
    });

    // React to quality changes at runtime.
    void import('../three/quality').then(({ configForQuality: cfg }) => {
      store.subscribe((state) => {
        if (state.settings.quality !== lastQuality) {
          lastQuality = state.settings.quality;
          scene?.applyConfig(cfg(state.settings.quality));
        }
      });
    });
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

  // Keep the topbar controls in sync with the store (e.g. the OS reduced-motion
  // media query can flip the setting at runtime).
  const unsyncControls = store.subscribe((state) => {
    if (qualitySelect.value !== state.settings.quality) {
      qualitySelect.value = state.settings.quality;
    }
    if (reducedCb.checked !== state.settings.reducedMotion) {
      reducedCb.checked = state.settings.reducedMotion;
    }
  });

  void setView('ledger');

  return function dispose(): void {
    unsyncControls();
    reconciler?.dispose();
    world?.dispose();
    scene?.dispose();
    audio.dispose();
    ledger.unsubscribe();
    topbar.remove();
    canvasHost.remove();
    ledger.element.remove();
  };
}
