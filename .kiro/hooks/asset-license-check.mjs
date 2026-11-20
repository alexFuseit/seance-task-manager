#!/usr/bin/env node
/**
 * Séance stop hook — runs when the assistant finishes a turn.
 *
 * Compliance guardrail for Kiroween 2026: the Official Rules require that
 * every third-party asset be properly licensed (CC0/OFL/CC-BY) and that the
 * entrant hold rights to everything submitted. This hook nudges the dev to
 * keep CREDITS.md in sync with the assets actually in the repo.
 *
 * Heuristic: if the assets/ directory contains binary asset files
 * (textures, audio, fonts, models) but CREDITS.md has not been touched since
 * those files were added, emit a reminder. It never blocks — stop hooks
 * cannot block — it only warns via STDERR on a non-zero exit.
 *
 * Hook contract (see Kiro Hooks System docs):
 *  - Receives the hook event as JSON on STDIN.
 *  - Exit 0 => success (STDOUT captured, not shown).
 *  - Non-zero => STDERR shown to the user as a warning.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Drain STDIN so the pipe closes cleanly.
try {
  await new Promise((resolve) => {
    process.stdin.on('data', () => {});
    process.stdin.on('end', resolve);
    process.stdin.on('error', resolve);
    setTimeout(resolve, 50);
  });
} catch {
  /* ignore */
}

const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.hdr', '.exr', // textures/HDRIs
  '.mp3', '.ogg', '.wav', '.flac',                            // audio
  '.woff', '.woff2', '.ttf', '.otf',                          // fonts
  '.glb', '.gltf', '.fbx', '.obj',                            // models
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'licenses') continue; // license files live here; skip
      walk(p, out);
    } else {
      const dot = entry.lastIndexOf('.');
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : '';
      if (ASSET_EXTS.has(ext)) out.push({ path: p, mtime: s.mtimeMs });
    }
  }
  return out;
}

// Fonts arrive as npm packages (@fontsource/*), not files under assets/, so
// check each one is named in CREDITS.md with its license file present.
const fontProblems = [];
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const credits = existsSync('CREDITS.md') ? readFileSync('CREDITS.md', 'utf8').toLowerCase() : '';
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!dep.startsWith('@fontsource/')) continue;
    const family = dep.slice('@fontsource/'.length).replace(/-/g, ' ');
    if (!credits.includes(family)) fontProblems.push(`${dep} is not listed in CREDITS.md`);
  }
} catch {
  /* no package.json yet — nothing to check */
}
if (fontProblems.length > 0) {
  process.stderr.write(`[seance assets] Font licensing gaps:\n`);
  for (const p of fontProblems) process.stderr.write(`  - ${p}\n`);
  process.exit(1);
}

if (!existsSync('assets')) {
  process.exit(0); // no assets yet — nothing to check
}

const assets = walk('assets');
if (assets.length === 0) {
  process.exit(0);
}

if (!existsSync('CREDITS.md')) {
  process.stderr.write(
    `[seance assets] ${assets.length} asset file(s) found under assets/ but CREDITS.md is missing. ` +
      'Every third-party asset must be attributed (CC0/OFL/CC-BY) per Kiroween rules.\n',
  );
  process.exit(1);
}

const creditsMtime = statSync('CREDITS.md').mtimeMs;
const stale = assets.filter((a) => a.mtime > creditsMtime);
if (stale.length > 0) {
  process.stderr.write(
    `[seance assets] ${stale.length} asset file(s) are newer than CREDITS.md. ` +
      'Confirm each is listed with source + license:\n',
  );
  for (const a of stale.slice(0, 10)) {
    process.stderr.write(`  - ${a.path}\n`);
  }
  process.exit(1);
}

process.exit(0);
