/**
 * Pure, DOM-free selectors for deriving view state from tasks:
 * due-soon / overdue classification, filtering, sorting, and search.
 *
 * Keeping these pure makes the ledger's behaviour unit-testable and lets the
 * (future) 3D layer reuse the exact same logic for visual encoding.
 */
import { type Priority, type Status, type Task, PRIORITY_RANK } from './types';

export type DueState = 'none' | 'upcoming' | 'soon' | 'overdue';
export type DueWindow = 'any' | 'overdue' | 'soon' | 'has-due' | 'no-due';
export type StatusFilter = 'all' | Status | 'overdue';
export type SortKey = 'created' | 'due' | 'priority' | 'title';
export type SortDir = 'asc' | 'desc';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Classify a task's due state relative to `now`. */
export function dueState(task: Task, now: number = Date.now()): DueState {
  if (!task.dueDate) return 'none';
  const due = Date.parse(task.dueDate);
  if (Number.isNaN(due)) return 'none';
  const delta = due - now;
  if (delta < 0) return 'overdue';
  if (delta <= DAY_MS) return 'soon';
  return 'upcoming';
}

export function isOverdue(task: Task, now: number = Date.now()): boolean {
  return task.status === 'active' && dueState(task, now) === 'overdue';
}

export function isDueSoon(task: Task, now: number = Date.now()): boolean {
  return task.status === 'active' && dueState(task, now) === 'soon';
}

export function countOverdue(tasks: readonly Task[], now: number = Date.now()): number {
  return tasks.reduce((n, t) => (isOverdue(t, now) ? n + 1 : n), 0);
}

export interface FilterOptions {
  status: StatusFilter;
  priority: 'all' | Priority;
  due: DueWindow;
  search: string;
}

export function defaultFilter(): FilterOptions {
  return { status: 'all', priority: 'all', due: 'any', search: '' };
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.notes && task.notes.toLowerCase().includes(q)) return true;
  return false;
}

function matchesStatus(task: Task, filter: StatusFilter, now: number): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return task.status === 'active';
    case 'completed':
      return task.status === 'completed';
    case 'overdue':
      return isOverdue(task, now);
  }
}

function matchesDue(task: Task, due: DueWindow, now: number): boolean {
  switch (due) {
    case 'any':
      return true;
    case 'overdue':
      return isOverdue(task, now);
    case 'soon':
      return isDueSoon(task, now);
    case 'has-due':
      return Boolean(task.dueDate);
    case 'no-due':
      return !task.dueDate;
  }
}

export function filterTasks(
  tasks: Task[],
  opts: FilterOptions,
  now: number = Date.now(),
): Task[] {
  return tasks.filter(
    (t) =>
      matchesStatus(t, opts.status, now) &&
      (opts.priority === 'all' || t.priority === opts.priority) &&
      matchesDue(t, opts.due, now) &&
      matchesSearch(t, opts.search),
  );
}

function compare(a: Task, b: Task, key: SortKey): number {
  switch (key) {
    case 'created':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case 'title':
      return a.title.localeCompare(b.title);
    case 'priority':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case 'due': {
      // Tasks without a due date sort last in ascending order.
      const da = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
      const db = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
      return da - db;
    }
  }
}

export function sortTasks(tasks: Task[], key: SortKey, dir: SortDir): Task[] {
  const sorted = [...tasks].sort((a, b) => compare(a, b, key));
  return dir === 'desc' ? sorted.reverse() : sorted;
}

/** Full pipeline: filter then sort. Returns a new array; input is untouched. */
export function queryTasks(
  tasks: Task[],
  filter: FilterOptions,
  sortKey: SortKey,
  sortDir: SortDir,
  now: number = Date.now(),
): Task[] {
  return sortTasks(filterTasks(tasks, filter, now), sortKey, sortDir);
}
