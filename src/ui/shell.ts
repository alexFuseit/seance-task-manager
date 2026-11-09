/**
 * Graveyard shell — the gothic chrome layered over the 3D backdrop, styled to
 * match the Séance concept art: left sidebar (brand + nav + footer), a top
 * banner with search + Add Task, a floating Overview panel, DOM "headstone"
 * task cards, a bottom hint, a compass, and a small cluster of functional
 * controls (sound / quality / reduced-motion / open-ledger).
 *
 * Everything is data-driven from the store and framework-free (per tech
 * steering). User text is only ever set via textContent (see dom.ts `el`),
 * never innerHTML, so task titles/notes can't inject markup. SVG icons are
 * self-made inline markup (no third-party asset / licensing concern).
 */
import { type SeanceStore } from '../store/task-store';
import { type Quality } from '../model/types';
import { el } from './dom';

export interface ShellDeps {
  store: SeanceStore;
  /** click a headstone → open the ledger's edit dialog. */
  onSelect: (taskId: string) => void;
  /** the "+ Add Task" button / quick-add. */
  onAdd: () => void;
  /** switch back to the accessible 2D ledger. */
  onOpenLedger: () => void;
  /** ambient audio controls. */
  audio: { isEnabled: () => boolean; toggle: () => Promise<boolean> };
  /** whether WebGL (and thus the graveyard) is available. */
  webglAvailable: boolean;
}

export interface ShellHandle {
  element: HTMLElement;
  /** show/hide the whole chrome (when toggling to the ledger). */
  setVisible: (visible: boolean) => void;
  unsubscribe: () => void;
}

/** Inline SVG helper — returns an <svg> element built from raw path markup. */
function svg(paths: string, viewBox = '0 0 24 24', cls = ''): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  if (cls) s.setAttribute('class', cls);
  const g = document.createElementNS(ns, 'g');
  g.innerHTML = paths; // static, developer-authored markup only
  s.appendChild(g);
  return s;
}

const ICONS = {
  ghost:
    '<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.6L14.4 20 12 18.3 9.6 20 7.3 18.4 5 20Z" fill="rgba(139,92,246,0.35)"/><circle cx="9.3" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r="1.1" fill="currentColor" stroke="none"/>',
  grave:
    '<path d="M6 21V9a6 6 0 0 1 12 0v12" fill="rgba(255,255,255,0.12)"/><path d="M4 21h16"/><path d="M12 7v5M9.5 9.5h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
  gear:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V4M4 20h16M8 17v-5M12 17V9M16 17v-8"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  bang: '<path d="M12 4v10"/><circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none"/>',
  mouse: '<rect x="7" y="3.5" width="10" height="17" rx="5"/><path d="M12 7v3"/>',
};

export function mountShell(parent: HTMLElement, deps: ShellDeps): ShellHandle {
  const { store } = deps;

  // ---------- topbar ----------
  const banner = el('div', { class: 'banner' });
  banner.append(
    el('span', { class: 'banner-rule' }),
    el('span', { class: 'banner-text' }, ['Your Tasks, Eternally Organised']),
    el('span', { class: 'banner-rule' }),
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search tasks...',
    'aria-label': 'Search tasks',
  }) as HTMLInputElement;
  searchInput.value = store.getState().view.filter.search;
  searchInput.addEventListener('input', () => {
    store.getState().setFilter({ search: searchInput.value });
  });
  const searchWrap = el('div', { class: 'search-wrap' });
  searchWrap.append(svg(ICONS.search, '0 0 24 24', 'search-icon'), searchInput);

  const addBtn = el('button', { type: 'button', class: 'btn-add' });
  addBtn.append(svg(ICONS.plus), el('span', {}, ['Add Task']));
  addBtn.addEventListener('click', () => deps.onAdd());

  const topbar = el('header', { class: 'stage-topbar' });
  topbar.append(banner, searchWrap, addBtn);

  // ---------- overview panel ----------
  const ovHigh = el('span', { class: 'ov-count' }, ['0']);
  const ovMedium = el('span', { class: 'ov-count' }, ['0']);
  const ovLow = el('span', { class: 'ov-count' }, ['0']);
  const ovCompleted = el('span', { class: 'ov-count' }, ['0']);

  function ovRow(dotCls: string, label: string, countEl: HTMLElement) {
    return el('li', {}, [
      el('span', { class: `dot ${dotCls}` }),
      el('span', { class: 'ov-label' }, [label]),
      countEl,
    ]);
  }

  const overviewHead = el('h2', {}, []);
  overviewHead.append(svg(ICONS.chart, '0 0 24 24', 'ov-icon'), el('span', {}, ['Overview']));
  const overview = el('section', { class: 'overview', 'aria-label': 'Task overview' });
  overview.append(
    overviewHead,
    el('ul', {}, [
      ovRow('high', 'High Priority', ovHigh),
      ovRow('medium', 'Medium Priority', ovMedium),
      ovRow('low', 'Low Priority', ovLow),
      ovRow('completed', 'Completed', ovCompleted),
    ]),
  );

  // ---------- stage (3D graves + their HTML labels render behind/over the
  // canvas; the shell stage is just a spacer so the grid lays out correctly) --
  const stage = el('main', { class: 'stage', 'aria-hidden': 'true' });

  // ---------- bottom hint + compass ----------
  const bottomHint = el('div', { class: 'bottom-hint' });
  bottomHint.append(
    el('span', {}, ['Drag to explore']),
    el('span', {}, ['·']),
    svg(ICONS.mouse),
    el('span', {}, ['Scroll to zoom']),
  );

  const compass = el('div', { class: 'compass', 'aria-hidden': 'true' });
  compass.append(el('span', { class: 'needle' }, ['N']), el('span', { class: 'blip' }));

  // ---------- functional controls (sound / quality / reduced-motion / ledger) ----------
  const muteBtn = el('button', { type: 'button', 'aria-pressed': 'false' }) as HTMLButtonElement;
  function syncMute(): void {
    const on = deps.audio.isEnabled();
    muteBtn.setAttribute('aria-pressed', String(on));
    muteBtn.textContent = on ? '🔊 Sound on' : '🔇 Sound off';
  }
  syncMute();
  muteBtn.addEventListener('click', () => {
    void deps.audio.toggle().then((on) => {
      store.getState().updateSettings({ muted: !on });
      syncMute();
    });
  });

  const qualitySelect = el('select', { 'aria-label': 'Graphics quality' }, [
    el('option', { value: 'high' }, ['Quality: High']),
    el('option', { value: 'medium' }, ['Quality: Medium']),
    el('option', { value: 'low' }, ['Quality: Low']),
  ]) as HTMLSelectElement;
  qualitySelect.value = store.getState().settings.quality;
  qualitySelect.addEventListener('change', () => {
    store.getState().updateSettings({ quality: qualitySelect.value as Quality });
  });

  const reducedCb = el('input', {
    type: 'checkbox',
    id: 'shell-reduced-motion',
  }) as HTMLInputElement;
  reducedCb.checked = store.getState().settings.reducedMotion;
  reducedCb.addEventListener('change', () => {
    store.getState().updateSettings({ reducedMotion: reducedCb.checked });
  });
  const reducedLabel = el('label', { for: 'shell-reduced-motion', class: 'reduced-label' }, [
    reducedCb,
    ' Reduce motion',
  ]);

  const ledgerBtn = el('button', { type: 'button' }, ['📜 Open the ledger']) as HTMLButtonElement;
  ledgerBtn.addEventListener('click', () => deps.onOpenLedger());

  const controls = el('div', { class: 'shell-controls', role: 'toolbar', 'aria-label': 'Scene controls' });
  controls.append(ledgerBtn, muteBtn, qualitySelect, reducedLabel);

  // ---------- assemble ----------
  const shell = el('div', { class: 'shell' });
  shell.append(topbar, overview, stage, bottomHint, compass, controls);
  parent.append(shell);

  // ---------- rendering ----------
  function renderCounts(): void {
    const tasks = store.getState().tasks;
    let high = 0;
    let medium = 0;
    let low = 0;
    let completed = 0;
    let active = 0;
    for (const t of tasks) {
      if (t.status === 'completed') {
        completed++;
        continue;
      }
      active++;
      if (t.priority === 'high') high++;
      else if (t.priority === 'medium') medium++;
      else low++;
    }
    ovHigh.textContent = String(high);
    ovMedium.textContent = String(medium);
    ovLow.textContent = String(low);
    ovCompleted.textContent = String(completed);
    void active;
  }

  function renderControls(): void {
    const st = store.getState().settings;
    if (qualitySelect.value !== st.quality) qualitySelect.value = st.quality;
    if (reducedCb.checked !== st.reducedMotion) reducedCb.checked = st.reducedMotion;
    if (searchInput.value !== store.getState().view.filter.search) {
      searchInput.value = store.getState().view.filter.search;
    }
  }

  function renderAll(): void {
    renderCounts();
    renderControls();
  }

  renderAll();
  const unsubscribe = store.subscribe(() => renderAll());

  function setVisible(visible: boolean): void {
    shell.hidden = !visible;
    document.body.classList.toggle('shell-active', visible);
  }

  return {
    element: shell,
    setVisible,
    unsubscribe: () => {
      unsubscribe();
    },
  };
}
