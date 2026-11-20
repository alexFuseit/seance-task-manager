/**
 * The 2D parchment "ledger" — Séance's canonical, fully keyboard-accessible
 * surface (per product steering). Renders the task list as an accessible table
 * with quick-add, filter/sort/search, inline complete/reopen/delete, an edit
 * dialog, and JSON import/export.
 *
 * It subscribes to the store and re-renders the dynamic regions on change.
 */
import { type SeanceStore } from '../store/task-store';
import {
  type AppState,
  type Priority,
  type Task,
  PRIORITIES,
} from '../model/types';
import {
  type SortKey,
  type SortDir,
  type StatusFilter,
  type DueWindow,
  dueState,
  countOverdue,
} from '../model/query';
import { el, clear } from './dom';
import { TaskValidationError } from '../store/task-store';
import { parseImport } from '../model/validation';

/** Inline SVG helper (self-made icons; no third-party asset dependency). */
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

const L_ICON = {
  grave:
    '<path d="M6 21V9a6 6 0 0 1 12 0v12" fill="rgba(255,255,255,0.1)"/><path d="M4 21h16"/><path d="M12 7v5M9.5 9.5h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  warn: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>',
  ghostSmall:
    '<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.6L14.4 20 12 18.3 9.6 20 7.3 18.4 5 20Z"/><circle cx="9.3" cy="10.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.5" r="0.9" fill="currentColor" stroke="none"/>',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

const DUE_OPTIONS: { value: DueWindow; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Due soon (24h)' },
  { value: 'has-due', label: 'Has due date' },
  { value: 'no-due', label: 'No due date' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'Title' },
];

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Convert an ISO datetime to the value a <input type="date"> expects. */
function toDateInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function errorMessage(err: unknown): string {
  return err instanceof TaskValidationError ? `${err.message}.` : 'Something went wrong.';
}

/** Show an inline, screen-reader-announced validation error on a field. */
function showFieldError(input: HTMLInputElement, msg: HTMLElement, text: string): void {
  input.setAttribute('aria-invalid', 'true');
  msg.textContent = text;
  input.focus();
}

function clearFieldError(input: HTMLInputElement, msg: HTMLElement): void {
  if (!input.hasAttribute('aria-invalid')) return;
  input.removeAttribute('aria-invalid');
  msg.textContent = '';
}

export interface LedgerHandle {
  /** The ledger's root element (so a view toggle can show/hide it). */
  element: HTMLElement;
  /** Open the edit dialog for a task — also used by the 3D click-to-select. */
  openEditor: (taskId: string) => void;
  /** Focus the quick-add title field — used by the shell's "+ Add Task". */
  focusQuickAdd: () => void;
  /** Register the handler for the banner's "Enter the graveyard" button. */
  onEnterGraveyard: (handler: () => void) => void;
  /** Toggle whether the graveyard is reachable (WebGL availability). */
  setGraveyardAvailable: (available: boolean) => void;
  /** Stop subscribing and tear down. */
  unsubscribe: () => void;
}

export function mountLedger(parent: HTMLElement, store: SeanceStore): LedgerHandle {
  const root = el('div', { class: 'ledger-view' });
  parent.append(root);
  // --- static shell -------------------------------------------------------
  const skip = el('a', { class: 'skip-link', href: '#ledger-table' }, [
    'Skip to task ledger',
  ]);

  const header = el('header', { class: 'ledger-banner' });
  // "Enter the graveyard" button lives top-left of the banner (matches mockup).
  const enterBtn = el('button', {
    type: 'button',
    class: 'enter-graveyard',
  }) as HTMLButtonElement;
  enterBtn.append(svg(L_ICON.grave, 'enter-icon'), el('span', {}, ['Enter the graveyard']));
  const enterNotice = el('span', { class: 'view-notice' });

  const bannerTitle = el('div', { class: 'ledger-banner-title' }, [
    el('h1', { text: 'Séance' }),
    el('p', { class: 'tagline', text: 'A graveyard for your tasks. Lay them to rest.' }),
  ]);
  header.append(el('div', { class: 'banner-left' }, [enterBtn, enterNotice]), bannerTitle);

  const statsBar = el('div', { class: 'stat-row', role: 'status', 'aria-live': 'polite' });

  // Quick-add form
  const titleInput = el('input', {
    type: 'text',
    id: 'qa-title',
    placeholder: 'Epitaph (task title)…',
    'aria-label': 'New task title',
    'aria-describedby': 'qa-title-error',
    maxlength: 200,
  }) as HTMLInputElement;
  const qaError = el('p', { class: 'field-error', id: 'qa-title-error', role: 'alert' });
  const priSelect = el('select', { id: 'qa-priority', 'aria-label': 'Priority' },
    PRIORITIES.map((p) =>
      el('option', { value: p, ...(p === 'medium' ? { selected: true } : {}) }, [p]),
    ),
  ) as HTMLSelectElement;
  const dueInput = el('input', {
    type: 'date',
    id: 'qa-due',
    'aria-label': 'Due date (optional)',
  }) as HTMLInputElement;
  const addBtn = el('button', { type: 'submit', class: 'primary bury-btn' });
  addBtn.append(svg(L_ICON.grave, 'bury-icon'), el('span', {}, ['Bury a Task']));

  const quickAdd = el('form', { class: 'quick-add', 'aria-label': 'Add a task', novalidate: true }, [
    el('div', { class: 'field grow' }, [
      el('label', { for: 'qa-title', text: 'New task' }),
      titleInput,
      qaError,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'qa-priority', text: 'Priority' }),
      priSelect,
    ]),
    el('div', { class: 'field' }, [el('label', { for: 'qa-due', text: 'Due' }), dueInput]),
    addBtn,
  ]) as HTMLFormElement;

  quickAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.getState().addTask({
        title: titleInput.value,
        priority: priSelect.value as Priority,
        dueDate: dueInput.value || undefined,
      });
    } catch (err) {
      showFieldError(titleInput, qaError, errorMessage(err));
      return;
    }
    clearFieldError(titleInput, qaError);
    titleInput.value = '';
    dueInput.value = '';
    priSelect.value = 'medium';
    titleInput.focus();
  });
  titleInput.addEventListener('input', () => clearFieldError(titleInput, qaError));

  // --- toolbar (filter / sort / search / io) ------------------------------
  const searchInput = el('input', {
    type: 'search',
    id: 'f-search',
    placeholder: 'Search epitaph or stone…',
    'aria-label': 'Search tasks',
  }) as HTMLInputElement;
  const statusSelect = el('select', { id: 'f-status', 'aria-label': 'Filter by status' },
    STATUS_OPTIONS.map((o) => el('option', { value: o.value }, [o.label])),
  ) as HTMLSelectElement;
  const priFilter = el('select', { id: 'f-priority', 'aria-label': 'Filter by priority' },
    [el('option', { value: 'all' }, ['All']), ...PRIORITIES.map((p) => el('option', { value: p }, [p]))],
  ) as HTMLSelectElement;
  const dueFilter = el('select', { id: 'f-due', 'aria-label': 'Filter by due window' },
    DUE_OPTIONS.map((o) => el('option', { value: o.value }, [o.label])),
  ) as HTMLSelectElement;
  const sortSelect = el('select', { id: 'f-sort', 'aria-label': 'Sort by' },
    SORT_OPTIONS.map((o) => el('option', { value: o.value }, [o.label])),
  ) as HTMLSelectElement;
  const dirBtn = el('button', { type: 'button', class: 'ghost', 'aria-label': 'Toggle sort direction' }, [
    '↓ Desc',
  ]) as HTMLButtonElement;

  const showCompletedCb = el('input', {
    type: 'checkbox',
    id: 'f-showcompleted',
  }) as HTMLInputElement;

  const exportBtn = el('button', { type: 'button', class: 'ghost' }, ['Export ledger']);
  const importBtn = el('button', { type: 'button', class: 'ghost' }, ['Import ledger']);
  const importFile = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    'aria-hidden': 'true',
    tabindex: -1,
  }) as HTMLInputElement;

  searchInput.addEventListener('input', () =>
    store.getState().setFilter({ search: searchInput.value }),
  );
  statusSelect.addEventListener('change', () =>
    store.getState().setFilter({ status: statusSelect.value as StatusFilter }),
  );
  priFilter.addEventListener('change', () =>
    store.getState().setFilter({ priority: priFilter.value as 'all' | Priority }),
  );
  dueFilter.addEventListener('change', () =>
    store.getState().setFilter({ due: dueFilter.value as DueWindow }),
  );
  sortSelect.addEventListener('change', () => {
    const s = store.getState();
    s.setSort(sortSelect.value as SortKey, s.view.sortDir);
  });
  dirBtn.addEventListener('click', () => {
    const s = store.getState();
    const next: SortDir = s.view.sortDir === 'asc' ? 'desc' : 'asc';
    s.setSort(s.view.sortKey, next);
  });
  showCompletedCb.addEventListener('change', () =>
    store.getState().updateSettings({ showCompleted: showCompletedCb.checked }),
  );

  exportBtn.addEventListener('click', () => {
    const json = store.getState().exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `seance-ledger-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    let parsed: AppState;
    try {
      parsed = parseImport(await file.text());
    } catch {
      window.alert('Could not import: the file is not valid Séance JSON.');
      return;
    } finally {
      importFile.value = '';
    }
    importDialog.ask(parsed);
  });

  const toolbar = el('div', { class: 'toolbar', role: 'group', 'aria-label': 'Filter, sort and search' }, [
    el('div', { class: 'field grow' }, [el('label', { for: 'f-search', text: 'Search' }), searchInput]),
    el('div', { class: 'field' }, [el('label', { for: 'f-status', text: 'Status' }), statusSelect]),
    el('div', { class: 'field' }, [el('label', { for: 'f-priority', text: 'Priority' }), priFilter]),
    el('div', { class: 'field' }, [el('label', { for: 'f-due', text: 'Due' }), dueFilter]),
    el('div', { class: 'field' }, [el('label', { for: 'f-sort', text: 'Sort' }), sortSelect]),
    el('div', { class: 'field' }, [el('label', { text: 'Direction' }), dirBtn]),
    el('div', { class: 'field' }, [
      el('label', { for: 'f-showcompleted' }, [showCompletedCb, ' Show completed']),
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'Ledger' }), el('div', {}, [importBtn, ' ', exportBtn])]),
    importFile,
  ]);

  // --- ledger table -------------------------------------------------------
  const tbody = el('tbody');
  const caption = el('caption');
  const table = el('table', { class: 'ledger', id: 'ledger-table' }, [
    caption,
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, ['Epitaph']),
        el('th', { scope: 'col' }, ['Priority']),
        el('th', { scope: 'col' }, ['Due']),
        el('th', { scope: 'col' }, ['Status']),
        el('th', { scope: 'col' }, ['Actions']),
      ]),
    ]),
    tbody,
  ]);
  const ledgerWrap = el('div', { class: 'ledger-wrap' }, [table]);

  root.append(skip, header, statsBar, quickAdd, toolbar, ledgerWrap);

  // --- dialogs -------------------------------------------------------------
  // Appended to <body> (not the ledger root) so they still render when the
  // ledger is hidden behind the 3D graveyard (click-a-grave → edit).
  const editor = buildEditor(store);
  const importDialog = buildImportDialog(store, () => importBtn.focus());
  document.body.append(editor.dialog, importDialog.dialog);

  // --- rendering ----------------------------------------------------------
  function renderStats(): void {
    const s = store.getState();
    const now = Date.now();
    const total = s.tasks.length;
    const active = s.tasks.filter((t) => t.status === 'active').length;
    const overdue = countOverdue(s.tasks, now);
    const dueSoon = s.tasks.reduce(
      (n, t) => (t.status === 'active' && dueState(t, now) === 'soon' ? n + 1 : n),
      0,
    );
    clear(statsBar);

    const stat = (iconPaths: string, cls: string, n: number, label: string) => {
      const span = el('span', { class: `stat ${cls}` });
      span.append(
        svg(iconPaths, 'stat-icon'),
        el('b', { text: String(n) }),
        el('span', { text: ` ${label}` }),
      );
      return span;
    };

    statsBar.append(
      stat(L_ICON.grave, 'graves', total, total === 1 ? 'grave' : 'graves'),
      stat(L_ICON.check, 'restless', active, 'restless'),
      stat(L_ICON.clock, 'soon', dueSoon, 'due soon'),
      stat(L_ICON.warn, 'overdue', overdue, 'overdue'),
    );
  }

  function renderRows(): void {
    const s = store.getState();
    const tasks = s.visibleTasks();
    clear(tbody);

    caption.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} shown${
      s.view.filter.search ? ` for “${s.view.filter.search}”` : ''
    }`;

    if (tasks.length === 0) {
      tbody.append(
        el('tr', {}, [
          el('td', { colspan: 5 }, [
            el('div', { class: 'empty', text: 'The graveyard is quiet. Dig a grave to begin.' }),
          ]),
        ]),
      );
      return;
    }

    for (const task of tasks) {
      tbody.append(renderRow(task, store, editor));
    }
  }

  function syncControls(): void {
    const s = store.getState();
    searchInput.value = s.view.filter.search;
    statusSelect.value = s.view.filter.status;
    priFilter.value = s.view.filter.priority;
    dueFilter.value = s.view.filter.due;
    sortSelect.value = s.view.sortKey;
    dirBtn.textContent = s.view.sortDir === 'asc' ? '↑ Asc' : '↓ Desc';
    showCompletedCb.checked = s.settings.showCompleted;
  }

  function renderAll(): void {
    renderStats();
    renderRows();
    syncControls();
  }

  renderAll();
  const unsubscribe = store.subscribe(renderAll);
  function focusQuickAdd(): void {
    titleInput.scrollIntoView({ block: 'center', behavior: 'auto' });
    titleInput.focus();
  }
  function onEnterGraveyard(handler: () => void): void {
    enterBtn.addEventListener('click', handler);
  }
  function setGraveyardAvailable(available: boolean): void {
    enterBtn.disabled = !available;
    if (available) {
      enterNotice.textContent = '';
    } else {
      enterBtn.classList.add('disabled');
      enterNotice.textContent =
        'WebGL unavailable — showing the accessible ledger.';
    }
  }
  return {
    element: root,
    openEditor: editor.open,
    focusQuickAdd,
    onEnterGraveyard,
    setGraveyardAvailable,
    unsubscribe: () => {
      unsubscribe();
      editor.dialog.remove();
      importDialog.dialog.remove();
    },
  };
}

function renderRow(
  task: Task,
  store: SeanceStore,
  editor: ReturnType<typeof buildEditor>,
): HTMLTableRowElement {
  const ds = dueState(task);
  const dueClass = task.status === 'active' && (ds === 'overdue' || ds === 'soon') ? ds : '';
  const completed = task.status === 'completed';

  // Title cell with a per-row grave icon (matches the mockup).
  const titleText = el('span', { class: 'row-title' }, [document.createTextNode(task.title)]);
  const titleCell = el('td', { class: 'title-cell' }, [
    el('span', { class: 'row-grave-icon' }, [svg(L_ICON.grave)]),
    titleText,
  ]);
  if (task.notes) {
    titleText.append(el('span', { class: 'notes', text: task.notes }));
  }

  const completeBtn = el(
    'button',
    { type: 'button', class: 'pill-btn complete' },
    [completed ? 'Exhume (reopen)' : 'Lay to rest'],
  );
  completeBtn.addEventListener('click', () => {
    if (task.status === 'active') store.getState().completeTask(task.id);
    else store.getState().reopenTask(task.id);
  });

  const editBtn = el('button', { type: 'button', class: 'pill-btn edit' }, ['Edit']);
  editBtn.addEventListener('click', () => editor.open(task.id));

  const delBtn = el('button', { type: 'button', class: 'pill-btn exhume' }, ['Exhume']);
  delBtn.setAttribute('aria-label', `Delete task: ${task.title}`);
  delBtn.addEventListener('click', () => {
    if (window.confirm(`Exhume “${task.title}”? This removes the grave for good.`)) {
      store.getState().deleteTask(task.id);
    }
  });

  // Status cell: ghost glyph + label.
  const statusCell = el('td', {}, [
    el('span', { class: `status-chip ${completed ? 'at-rest' : 'active'}` }, [
      svg(L_ICON.ghostSmall, 'status-icon'),
      el('span', { text: completed ? 'At rest' : 'Active' }),
    ]),
  ]);

  return el(
    'tr',
    { class: completed ? 'completed' : '', 'data-id': task.id },
    [
      titleCell,
      el('td', {}, [
        el('span', {
          class: `badge priority-${task.priority}`,
          text: task.priority.toUpperCase(),
        }),
      ]),
      el('td', {}, [el('span', { class: `due ${dueClass}`, text: fmtDate(task.dueDate) })]),
      statusCell,
      el('td', {}, [el('div', { class: 'row-actions' }, [completeBtn, editBtn, delBtn])]),
    ],
  ) as HTMLTableRowElement;
}

/** Build a reusable <dialog> editor for updating a task. */
function buildEditor(store: SeanceStore) {
  let currentId: string | null = null;

  const title = el('input', {
    type: 'text',
    id: 'ed-title',
    maxlength: 200,
    'aria-describedby': 'ed-title-error',
  }) as HTMLInputElement;
  const titleError = el('p', { class: 'field-error', id: 'ed-title-error', role: 'alert' });
  const notes = el('textarea', { id: 'ed-notes', maxlength: 2000 }) as HTMLTextAreaElement;
  const priority = el('select', { id: 'ed-priority' },
    PRIORITIES.map((p) => el('option', { value: p }, [p])),
  ) as HTMLSelectElement;
  const due = el('input', { type: 'date', id: 'ed-due' }) as HTMLInputElement;

  const save = el('button', { type: 'submit', class: 'primary' }, ['Save']);
  const cancel = el('button', { type: 'button', class: 'ghost' }, ['Cancel']);

  const form = el('form', { method: 'dialog', novalidate: true }, [
    el('h2', { text: 'Edit grave' }),
    el('div', { class: 'field' }, [
      el('label', { for: 'ed-title', text: 'Epitaph (title)' }),
      title,
      titleError,
    ]),
    el('div', { class: 'field' }, [el('label', { for: 'ed-notes', text: 'Notes' }), notes]),
    el('div', { class: 'field' }, [el('label', { for: 'ed-priority', text: 'Priority' }), priority]),
    el('div', { class: 'field' }, [el('label', { for: 'ed-due', text: 'Due date' }), due]),
    el('div', { class: 'dialog-actions' }, [cancel, save]),
  ]) as HTMLFormElement;

  const dialog = el('dialog', { class: 'editor', 'aria-label': 'Edit task' }, [form]) as HTMLDialogElement;

  cancel.addEventListener('click', () => dialog.close());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentId) return;
    try {
      store.getState().updateTask(currentId, {
        title: title.value,
        notes: notes.value,
        priority: priority.value as Priority,
        dueDate: due.value || undefined,
      });
    } catch (err) {
      showFieldError(title, titleError, errorMessage(err));
      return;
    }
    dialog.close();
  });
  title.addEventListener('input', () => clearFieldError(title, titleError));

  function open(id: string): void {
    const task = store.getState().tasks.find((x) => x.id === id);
    if (!task) return;
    currentId = id;
    clearFieldError(title, titleError);
    title.value = task.title;
    notes.value = task.notes ?? '';
    priority.value = task.priority;
    due.value = toDateInput(task.dueDate);
    dialog.showModal();
    title.focus();
  }

  return { dialog, open };
}


/**
 * Confirm-before-import dialog. Importing used to silently replace every task;
 * now the user sees what the file contains and chooses Replace (overwrite all
 * tasks + settings), Merge (add only tasks whose ids are new) or Cancel.
 */
function buildImportDialog(store: SeanceStore, returnFocus: () => void) {
  let pending: AppState | null = null;

  const summary = el('p', { id: 'imp-summary' });
  const replaceBtn = el('button', { type: 'button', class: 'danger' }, ['Replace all']);
  const mergeBtn = el('button', { type: 'button', class: 'primary' }, ['Merge']);
  const cancelBtn = el('button', { type: 'button', class: 'ghost' }, ['Cancel']);

  const dialog = el(
    'dialog',
    { class: 'editor', 'aria-labelledby': 'imp-title', 'aria-describedby': 'imp-summary' },
    [
      el('form', { method: 'dialog' }, [
        el('h2', { id: 'imp-title', text: 'Import ledger' }),
        summary,
        el('p', {
          class: 'setting-hint',
          text: 'Merge keeps your current graves and adds the new ones. Replace overwrites everything.',
        }),
        el('div', { class: 'dialog-actions' }, [cancelBtn, replaceBtn, mergeBtn]),
      ]),
    ],
  ) as HTMLDialogElement;

  function finish(): void {
    pending = null;
    dialog.close();
  }
  dialog.addEventListener('close', () => {
    pending = null;
    returnFocus();
  });
  cancelBtn.addEventListener('click', finish);
  replaceBtn.addEventListener('click', () => {
    if (pending) store.getState().replaceState(pending);
    finish();
  });
  mergeBtn.addEventListener('click', () => {
    if (pending) store.getState().mergeTasks(pending.tasks);
    finish();
  });

  function ask(next: AppState): void {
    pending = next;
    const current = store.getState().tasks;
    const ids = new Set(current.map((t) => t.id));
    const fresh = next.tasks.filter((t) => !ids.has(t.id)).length;
    const n = next.tasks.length;
    summary.textContent =
      `The file holds ${n} grave${n === 1 ? '' : 's'} (${fresh} new). ` +
      `You currently have ${current.length}.`;
    mergeBtn.toggleAttribute('disabled', fresh === 0);
    dialog.showModal();
    (fresh === 0 ? cancelBtn : mergeBtn).focus();
  }

  return { dialog, ask };
}
