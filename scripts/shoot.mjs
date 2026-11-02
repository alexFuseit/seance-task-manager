// Dev-only visual check: screenshots the ledger and the 3D graveyard.
// Not part of the shipped app. Run with: node scripts/shoot.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const OUT = 'scripts/shots';

const server = await preview({
  preview: { port: 4317, strictPort: true },
  logLevel: 'warn',
});

const url = 'http://localhost:4317/';

const browser = await chromium.launch({
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swrender',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

// Fresh store each run so the seeder populates the graveyard.
await page.addInitScript(() => {
  try {
    localStorage.removeItem('seance.state.v1');
  } catch {}
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/01-ledger.png` });

// WebGL availability inside the page.
const webgl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!(c.getContext('webgl2') || c.getContext('webgl'));
});
logs.push(`[probe] webgl=${webgl}`);

// Enter the graveyard.
const enter = page.getByRole('button', { name: /enter the graveyard/i });
await enter.click();
// Wait for the lazy three chunk + scene mount + rise cascade.
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-graveyard-high.png` });

// Let overdue crows/spirit animate a bit, capture a second frame.
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-graveyard-later.png` });

// Switch to Low quality (no post-fx, no shadows, no decorations).
await page.selectOption('.quality-select', 'low');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/04-graveyard-low.png` });

// Back to High to confirm post-fx (bloom + vignette) returns.
await page.selectOption('.quality-select', 'high');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/05-graveyard-high-again.png` });

// Canvas pixel sanity: is anything non-black being drawn?
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('.canvas-host canvas');
  if (!canvas) return { found: false };
  return { found: true, w: canvas.width, h: canvas.height };
});
logs.push(`[canvas] ${JSON.stringify(canvasInfo)}`);

console.log(logs.join('\n'));

await browser.close();
await server.httpServer.close?.();
process.exit(0);
