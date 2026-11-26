// Dev-only: renders the project thumbnail (3:2, 1800x1200) from the live 3D graveyard.
// Requires a production build (`npm run build`). Run: node scripts/thumbnail.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = 'docs';
mkdirSync(OUT, { recursive: true });

const server = await preview({
  preview: { port: 4318, strictPort: true },
  logLevel: 'warn',
});

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swrender'],
});
// 3:2 aspect ratio
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

await page.addInitScript(() => {
  try {
    localStorage.removeItem('seance.state.v1');
  } catch {}
});

await page.goto('http://localhost:4318/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /enter the graveyard/i }).click();
// Let the lazy chunk load, graves rise, crows/spirits animate.
await page.waitForTimeout(6000);

// Hide app chrome so only the 3D scene remains behind the title.
await page.addStyleTag({
  content: '.shell,.sidebar,.label-layer,.ledger{display:none!important}',
});
await page.waitForTimeout(1500);

// Title overlay using the app's self-hosted display font.
await page.evaluate(() => {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;pointer-events:none;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:flex-start;padding-top:70px;text-align:center;' +
    'background:linear-gradient(to bottom,rgba(5,3,10,.78) 0%,rgba(5,3,10,0) 38%,rgba(5,3,10,0) 78%,rgba(5,3,10,.7) 100%);';
  el.innerHTML =
    '<div style="font-family:Cinzel,serif;font-size:190px;letter-spacing:.08em;color:#efe6d0;' +
    'text-shadow:0 0 40px rgba(150,255,170,.55),0 4px 0 #000;font-weight:700;line-height:1">SÉANCE</div>' +
    '<div style="font-family:\'EB Garamond\',serif;font-size:50px;color:#c9bfa6;margin-top:18px;' +
    'font-style:italic;text-shadow:0 2px 8px #000">A task manager that lives in a 3D graveyard</div>';
  const foot = document.createElement('div');
  foot.setAttribute('aria-hidden', 'true');
  foot.style.cssText =
    'position:fixed;left:0;right:0;bottom:50px;z-index:99999;text-align:center;pointer-events:none;' +
    'font-family:Cinzel,serif;font-size:34px;letter-spacing:.22em;color:#b8ffc4;text-shadow:0 2px 8px #000';
  foot.textContent = 'EVERY TASK IS A GRAVE  ·  KIROWEEN 2026';
  document.body.append(el, foot);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/thumbnail.png` });
console.log(`wrote ${OUT}/thumbnail.png`);

await browser.close();
await server.httpServer.close?.();
process.exit(0);
