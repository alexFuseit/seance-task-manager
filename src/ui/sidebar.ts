/**
 * Shared gothic sidebar — brand, nav (Graveyard / Completed / Settings /
 * About), and the pentagram footer. Persistent across both the 3D graveyard
 * and the 2D ledger so the two screens read as one product (matching the
 * concept art). Framework-free; SVG icons are self-made inline markup.
 */
import { type SeanceStore } from '../store/task-store';
import { el } from './dom';

export type NavKey = 'graveyard' | 'completed' | 'settings' | 'about';

export interface SidebarDeps {
  store: SeanceStore;
  /** Navigate to a view. 'graveyard'/'completed' stay on the current surface
   *  but adjust the filter; the host decides which surface is shown. */
  onNavigate: (key: NavKey) => void;
}

export interface SidebarHandle {
  element: HTMLElement;
  /** Reflect the active nav item. */
  setActive: (key: NavKey) => void;
  /** Refresh the graveyard/completed counts. */
  refreshCounts: () => void;
  unsubscribe: () => void;
}

function svg(paths: string, cls = ''): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  if (cls) s.setAttribute('class', cls);
  const g = document.createElementNS(ns, 'g');
  g.innerHTML = paths;
  s.appendChild(g);
  return s;
}

const ICON = {
  ghost:
    '<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.6L14.4 20 12 18.3 9.6 20 7.3 18.4 5 20Z" fill="rgba(139,92,246,0.35)"/><circle cx="9.3" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r="1.1" fill="currentColor" stroke="none"/>',
  grave:
    '<path d="M6 21V9a6 6 0 0 1 12 0v12" fill="rgba(255,255,255,0.12)"/><path d="M4 21h16"/><path d="M12 7v5M9.5 9.5h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
  gear:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>',
  pentagram:
    '<circle cx="12" cy="12" r="9"/><path d="M12 3L9.1 11.9 1.7 17.5l7.4-5.6L12 3Zm0 0l2.9 8.9 7.4 5.6-9.4-6.6"/><path d="M4.6 8.2l14.8 0M4.6 8.2L16.5 18M19.4 8.2L7.5 18"/>',
};

export function mountSidebar(parent: HTMLElement, deps: SidebarDeps): SidebarHandle {
  const { store } = deps;

  const brand = el('div', { class: 'brand' });
  brand.append(svg(ICON.ghost, 'ghost-logo'), el('h1', {}, ['Séance']));

  const items: Record<NavKey, HTMLButtonElement> = {
    graveyard: el('button', { type: 'button', class: 'nav-item active' }) as HTMLButtonElement,
    completed: el('button', { type: 'button', class: 'nav-item' }) as HTMLButtonElement,
    settings: el('button', { type: 'button', class: 'nav-item' }) as HTMLButtonElement,
    about: el('button', { type: 'button', class: 'nav-item' }) as HTMLButtonElement,
  };

  const graveyardCount = el('span', { class: 'nav-count' }, ['0']);
  const completedCount = el('span', { class: 'nav-count' }, ['0']);

  items.graveyard.append(
    svg(ICON.grave, 'nav-icon'),
    el('span', { class: 'nav-label' }, ['Graveyard']),
    graveyardCount,
  );
  items.completed.append(
    svg(ICON.check, 'nav-icon'),
    el('span', { class: 'nav-label' }, ['Completed']),
    completedCount,
  );
  items.settings.append(svg(ICON.gear, 'nav-icon'), el('span', { class: 'nav-label' }, ['Settings']));
  items.about.append(svg(ICON.info, 'nav-icon'), el('span', { class: 'nav-label' }, ['About']));

  (Object.keys(items) as NavKey[]).forEach((key) => {
    items[key].addEventListener('click', () => deps.onNavigate(key));
  });

  function setActive(key: NavKey): void {
    (Object.keys(items) as NavKey[]).forEach((k) => {
      items[k].classList.toggle('active', k === key);
    });
  }

  const footer = el('div', { class: 'sidebar-footer' });
  footer.append(
    svg(ICON.pentagram, 'pentagram'),
    el('p', { class: 'tagline' }, ['Summon focus.', el('br'), 'Bury procrastination.']),
  );

  const sidebar = el('aside', { class: 'sidebar', 'aria-label': 'Navigation' });
  sidebar.append(
    brand,
    el('nav', { class: 'nav', 'aria-label': 'Views' }, [
      items.graveyard,
      items.completed,
      items.settings,
      items.about,
    ]),
    footer,
  );
  parent.append(sidebar);

  function refreshCounts(): void {
    const tasks = store.getState().tasks;
    let active = 0;
    let completed = 0;
    for (const t of tasks) {
      if (t.status === 'completed') completed++;
      else active++;
    }
    graveyardCount.textContent = String(active);
    completedCount.textContent = String(completed);
  }

  refreshCounts();
  const unsubscribe = store.subscribe(refreshCounts);

  return { element: sidebar, setActive, refreshCounts, unsubscribe };
}
