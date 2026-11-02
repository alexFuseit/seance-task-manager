/**
 * WebGL capability detection.
 *
 * Séance is function-first: if WebGL is unavailable (old browser, disabled,
 * software-blocked, or a headless/test environment), the app must fall back to
 * the 2D ledger. This probe never throws.
 */

let cached: boolean | undefined;

export function isWebGLAvailable(): boolean {
  if (cached !== undefined) return cached;
  cached = probe();
  return cached;
}

function probe(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return gl !== null && gl !== undefined;
  } catch {
    return false;
  }
}
