// Dev-only: captures 3:2 (1800x1200) gallery screenshots into docs/gallery/.
// Requires a production build (`npm run build`). Run: node scripts/gallery.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/gallery';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4319, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swrender'],
});
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
await page.addInitScript(() => {
  try {
    localStorage.removeItem('seance.state.v1');
  } catch {}
});

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
};

await page.goto('http://localhost:4319/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('01-ledger');

await page.getByRole('button', { name: /enter the graveyard/i }).click();
await page.waitForTimeout(6000);
await shot('02-graveyard');

// Zoom in toward the graves for a closer, more atmospheric shot.
await page.mouse.move(900, 700);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(2500);
await shot('03-graveyard-close');

// Look up toward the blood moon with a right-drag turn.
await page.mouse.move(900, 600);
await page.mouse.down({ button: 'right' });
await page.mouse.move(900, 760, { steps: 12 });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(2500);
await shot('04-graveyard-sky');

await page.getByRole('button', { name: /^settings$/i }).first().click();
await page.waitForTimeout(800);
await shot('05-settings');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.getByRole('button', { name: /^about$/i }).first().click();
await page.waitForTimeout(800);
await shot('06-about');

await browser.close();
await server.httpServer.close?.();
process.exit(0);
