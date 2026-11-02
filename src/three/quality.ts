/**
 * Quality tiers (Requirement 6.2). Maps the user's quality setting to concrete
 * render parameters so every 3D subsystem reads one source of truth. Degrading
 * gracefully on weak GPUs is a first-class requirement, not an afterthought.
 */
import { type Quality } from '../model/types';

export interface RenderConfig {
  /** run the EffectComposer (bloom + vignette) vs. a plain render. */
  postFx: boolean;
  /** enable shadow maps. */
  shadows: boolean;
  /** shadow map resolution (ignored when shadows off). */
  shadowMapSize: number;
  /** cap on devicePixelRatio. */
  maxPixelRatio: number;
  /** render decorative crows/spirit effects. */
  decorations: boolean;
  /** max number of graves that render decorative effects (nearest first). */
  maxDecoratedGraves: number;
  /** bloom strength (ignored when postFx off). */
  bloomStrength: number;
}

const TIERS: Record<Quality, RenderConfig> = {
  high: {
    postFx: true,
    shadows: true,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    decorations: true,
    maxDecoratedGraves: 40,
    bloomStrength: 0.7,
  },
  medium: {
    postFx: true,
    shadows: true,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    decorations: true,
    maxDecoratedGraves: 18,
    bloomStrength: 0.5,
  },
  low: {
    postFx: false,
    shadows: false,
    shadowMapSize: 512,
    maxPixelRatio: 1,
    decorations: false,
    maxDecoratedGraves: 0,
    bloomStrength: 0,
  },
};

export function configForQuality(quality: Quality): RenderConfig {
  return TIERS[quality];
}
