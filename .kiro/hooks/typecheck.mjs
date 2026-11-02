#!/usr/bin/env node
/**
 * Séance postToolUse hook — runs after a `write` tool use.
 *
 * Keeps the TypeScript build honest during the Kiroween 2026 build:
 * if a tsconfig.json exists, run `tsc --noEmit` so type errors surface
 * immediately after a file is written instead of at build time.
 *
 * Hook contract (see Kiro Hooks System docs):
 *  - Receives the hook event as JSON on STDIN.
 *  - Exit 0 => success (postToolUse cannot block; the tool already ran).
 *  - Non-zero => STDERR shown to the user as a warning.
 *
 * This script fails OPEN: if the toolchain or project is not set up yet
 * (early in the build), it exits 0 quietly so it never blocks progress.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Drain STDIN (the JSON hook event). We don't need its contents here,
// but consuming it avoids broken-pipe warnings.
try {
  await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', resolve);
    process.stdin.on('error', resolve);
    // If nothing is piped, don't hang.
    setTimeout(resolve, 50);
  });
} catch {
  /* ignore */
}

// Project not scaffolded yet — nothing to check. Succeed quietly.
if (!existsSync('tsconfig.json') || !existsSync('node_modules')) {
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['tsc', '--noEmit'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});

if (result.status === 0) {
  process.exit(0);
}

process.stderr.write('[seance typecheck] tsc --noEmit reported errors:\n');
process.stderr.write((result.stdout || '') + (result.stderr || ''));
// Warn, but do not hard-fail the session.
process.exit(1);
