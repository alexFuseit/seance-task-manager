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

export function mountLedger(root: HTMLElement, store: SeanceStore): () => void {
  // --- static shell -------------------------------------------------------
  const skip = el('a', { class: 'skip-link', href: '#ledger-table' }, [
    'Skip to task ledger',
  ]);

  const header = el('header', { class: 'site-header' }, [
    el('h1', { text: 'Séance' }),
    el('p', { class: 'tagline', text: 'A graveyard for your tasks. Lay them to rest.' }),
  ]);

  const statsBar = el('div', { class: 'stats', role: 'status', 'aria-live': 'polite' });

  // Quick-add form
  const titleInput = el('input', {
    type: 'text',
    id: 'qa-title',
    placeholder: 'Epitaph (task title)…',
    'aria-label': 'New task title',
    maxlength: 200,
  }) as HTMLInputElement;
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
  const addBtn = el('button', { type: 'submit', class: 'primary' }, ['+ Dig a Grave']);

  const quickAdd = el('form', { class: 'quick-add', 'aria-label': 'Add a task' }, [
    el('div', { class: 'field grow' }, [
      el('label', { for: 'qa-title', text: 'New task' }),
      titleInput,
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
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    store.getState().addTask({
      title,
      priority: priSelect.value as Priority,
      dueDate: dueInput.value || undefined,
    });
    titleInput.value = '';
    dueInput.value = '';
    priSelect.value = 'medium';
    titleInput.focus();
  });

  // --- toolbar (filter / sort / search / io) ------------------------------
  const searchInput = el('input', {
    type: 'search',
    id: 'f-search',
    placeholder: 'Search title or notes…',
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
    try {
      const text = await file.text();
      store.getState().importJson(text);
    } catch {
      window.alert('Could not import: the file is not valid Séance JSON.');
    } finally {
      importFile.value = '';
    }
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

  // --- edit dialog --------------------------------------------------------
  const editor = buildEditor(store);
  root.append(editor.dialog);

  // --- rendering ----------------------------------------------------------
  function renderStats(): void {
    const s = store.getState();
    const total = s.tasks.length;
    const active = s.tasks.filter((t) => t.status === 'active').length;
    const done = total - active;
    const overdue = countOverdue(s.tasks);
    clear(statsBar);
    statsBar.append(
      el('span', { class: 'stat' }, [el('b', { text: String(total) }), ' graves']),
      el('span', { class: 'stat' }, [el('b', { text: String(active) }), ' restless']),
      el('span', { class: 'stat' }, [el('b', { text: String(done) }), ' at rest']),
      el('span', { class: 'stat overdue' }, [el('b', { text: String(overdue) }), ' overdue']),
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
  return unsubscribe;
}

function renderRow(
  task: Task,
  store: SeanceStore,
  editor: ReturnType<typeof buildEditor>,
): HTMLTableRowElement {
  const ds = dueState(task);
  const dueClass = task.status === 'active' && (ds === 'overdue' || ds === 'soon') ? ds : '';

  const titleCell = el('td', { class: 'title-cell' }, [
    document.createTextNode(task.title),
  ]);
  if (task.notes) {
    titleCell.append(el('span', { class: 'notes', text: task.notes }));
  }

  const completeBtn = el(
    'button',
    { type: 'button', class: 'ghost' },
    [task.status === 'active' ? 'Lay to rest' : 'Exhume (reopen)'],
  );
  completeBtn.addEventListener('click', () => {
    if (task.status === 'active') store.getState().completeTask(task.id);
    else store.getState().reopenTask(task.id);
  });

  const editBtn = el('button', { type: 'button' }, ['Edit']);
  editBtn.addEventListener('click', () => editor.open(task.id));

  const delBtn = el('button', { type: 'button', class: 'danger' }, ['Exhume']);
  delBtn.setAttribute('aria-label', `Delete task: ${task.title}`);
  delBtn.addEventListener('click', () => {
    if (window.confirm(`Exhume “${task.title}”? This removes the grave for good.`)) {
      store.getState().deleteTask(task.id);
    }
  });

  return el(
    'tr',
    { class: task.status === 'completed' ? 'completed' : '', 'data-id': task.id },
    [
      titleCell,
      el('td', {}, [el('span', { class: `badge priority-${task.priority}`, text: task.priority })]),
      el('td', {}, [el('span', { class: `due ${dueClass}`, text: fmtDate(task.dueDate) })]),
      el('td', { text: task.status === 'active' ? 'Active' : 'At rest' }),
      el('td', {}, [el('div', { class: 'row-actions' }, [completeBtn, editBtn, delBtn])]),
    ],
  ) as HTMLTableRowElement;
}

/** Build a reusable <dialog> editor for updating a task. */
function buildEditor(store: SeanceStore) {
  let currentId: string | null = null;

  const title = el('input', { type: 'text', id: 'ed-title', maxlength: 200 }) as HTMLInputElement;
  const notes = el('textarea', { id: 'ed-notes', maxlength: 2000 }) as HTMLTextAreaElement;
  const priority = el('select', { id: 'ed-priority' },
    PRIORITIES.map((p) => el('option', { value: p }, [p])),
  ) as HTMLSelectElement;
  const due = el('input', { type: 'date', id: 'ed-due' }) as HTMLInputElement;

  const save = el('button', { type: 'submit', class: 'primary' }, ['Save']);
  const cancel = el('button', { type: 'button', class: 'ghost' }, ['Cancel']);

  const form = el('form', { method: 'dialog' }, [
    el('h2', { text: 'Edit grave' }),
    el('div', { class: 'field' }, [el('label', { for: 'ed-title', text: 'Epitaph (title)' }), title]),
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
    const t = title.value.trim();
    if (!t) {
      title.focus();
      return;
    }
    store.getState().updateTask(currentId, {
      title: t,
      notes: notes.value,
      priority: priority.value as Priority,
      dueDate: due.value || undefined,
    });
    dialog.close();
  });

  function open(id: string): void {
    const task = store.getState().tasks.find((x) => x.id === id);
    if (!task) return;
    currentId = id;
    title.value = task.title;
    notes.value = task.notes ?? '';
    priority.value = task.priority;
    due.value = toDateInput(task.dueDate);
    dialog.showModal();
    title.focus();
  }

  return { dialog, open };
}
