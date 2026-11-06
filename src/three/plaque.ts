/**
 * Floating epitaph plaque shown on hover (Requirement 1.3).
 *
 * Rendered as a THREE.Sprite with a canvas texture so text always faces the
 * camera without extra font assets. Kept intentionally simple for M2; the
 * detail panel (click → edit) remains the DOM overlay from M1.
 */
import * as THREE from 'three';

export interface Plaque {
  sprite: THREE.Sprite;
  setText: (title: string, sub: string) => void;
  dispose: () => void;
}

export function createPlaque(): Plaque {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.75, 1);
  sprite.visible = false;
  sprite.renderOrder = 999;

  function setText(title: string, sub: string): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark aged-stone plaque. Kept intentionally dark so it stays BELOW the
    // post-processing bloom threshold — a light parchment card blooms to white
    // and erases the text. Light bone-coloured text gives strong contrast.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(34, 30, 40, 0.94)');
    grad.addColorStop(1, 'rgba(22, 19, 27, 0.94)');
    ctx.fillStyle = grad;
    roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16);
    ctx.fill();
    // Warm amber hairline border to echo the scene's accent.
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(224, 150, 90, 0.85)';
    ctx.stroke();

    // Soft shadow under text for extra legibility against any bleed.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = '#f3ead6'; // bone white
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText(truncate(ctx, title, canvas.width - 48), 28, 58);

    ctx.fillStyle = '#d9b98f'; // warm tan for the sub-line
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillText(truncate(ctx, sub, canvas.width - 48), 28, 112);

    // reset shadow so it doesn't leak into later draws
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    texture.needsUpdate = true;
  }

  function dispose(): void {
    texture.dispose();
    material.dispose();
  }

  return { sprite, setText, dispose };
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
