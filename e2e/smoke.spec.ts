import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests: the function-first ledger works, the graveyard mounts, the
 * Settings dialog round-trips a preference, and the app degrades to the
 * ledger when WebGL is unavailable. Each test starts with empty storage so
 * the first-run seeder populates sample graves.
 */

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Only clear on the very first load of each test (keeps reload tests honest).
    if (!sessionStorage.getItem('seance.e2e')) {
      localStorage.clear();
      sessionStorage.setItem('seance.e2e', '1');
    }
  });
});

test('ledger: seeded, add, validate, complete, persist', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  const rows = page.locator('#ledger-table tbody tr');
  await expect(rows.first()).toBeVisible();
  const seeded = await rows.count();
  expect(seeded).toBeGreaterThan(0);

  // Empty title → inline error, nothing added.
  await page.getByRole('button', { name: /bury a task/i }).click();
  await expect(page.locator('#qa-title-error')).toHaveText(/title is required/i);
  await expect(rows).toHaveCount(seeded);

  // Add a task.
  await page.locator('#qa-title').fill('Exorcise the inbox');
  await page.getByRole('button', { name: /bury a task/i }).click();
  await expect(page.locator('#qa-title-error')).toBeHidden();
  const row = rows.filter({ hasText: 'Exorcise the inbox' });
  await expect(row).toHaveCount(1);

  // Lay it to rest.
  await row.getByRole('button', { name: /lay to rest/i }).click();
  await expect(row.getByText('At rest')).toBeVisible();

  // Survives a reload (localStorage).
  await page.reload();
  await expect(rows.filter({ hasText: 'Exorcise the inbox' }).getByText('At rest')).toBeVisible();

  expect(errors).toEqual([]);
});

test('graveyard mounts a WebGL canvas with grave labels', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /enter the graveyard/i }).click();

  const canvas = page.locator('.canvas-host canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // Seeded graves rise and their HTML cards appear.
  await expect(page.locator('.grave-label').first()).toBeVisible({ timeout: 10_000 });

  // Back to the ledger.
  await page.getByRole('button', { name: /open the ledger/i }).click();
  await expect(page.locator('#ledger-table')).toBeVisible();

  expect(errors).toEqual([]);
});

test('settings dialog persists quality and motion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Graphics quality').selectOption('low');
  await dialog.getByLabel('Reduce motion').check();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(dialog.getByLabel('Graphics quality')).toHaveValue('low');
  await expect(dialog.getByLabel('Reduce motion')).toBeChecked();
});

test('falls back to the ledger when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /enter the graveyard/i })).toBeDisabled();
  await expect(page.getByText(/WebGL unavailable/i)).toBeVisible();
  await expect(page.locator('#ledger-table tbody tr').first()).toBeVisible();
});
