/**
 * Settings + About dialogs, opened from the sidebar.
 *
 * Settings exposes every user preference in one accessible place (and is the
 * only surface for some of them when on the ledger): graphics quality, motion
 * (system / reduce / full — overriding `prefers-reduced-motion`), ambient
 * sound, and whether completed graves are shown.
 *
 * About explains the visual language — "spooky = signal" — so a first-time
 * visitor can decode the graveyard, plus privacy and credits notes.
 *
 * Both are native <dialog> modals appended to <body> (so they render no matter
 * which view is visible), keyboard-accessible, and framework-free.
 */
import { type SeanceStore } from '../store/task-store';
import { type MotionPref, type Quality } from '../model/types';
import { el } from './dom';

export interface SoundControl {
  isEnabled: () => boolean;
  /** turn sound on/off; must be called from a user gesture to enable. */
  set: (on: boolean) => Promise<boolean>;
}

export interface DialogHandle {
  open: () => void;
  close: () => void;
  /** register a callback for when the dialog closes (for nav state). */
  onClose: (cb: () => void) => void;
  dispose: () => void;
}

function baseDialog(label: string, title: string): {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  handle: (cleanup?: () => void) => DialogHandle;
} {
  const closeBtn = el('button', { type: 'button', class: 'primary' }, ['Close']);
  const body = el('div', { class: 'dialog-body' });
  const form = el('form', { method: 'dialog' }, [
    el('h2', { text: title }),
    body,
    el('div', { class: 'dialog-actions' }, [closeBtn]),
  ]);
  const dialog = el('dialog', { class: 'editor app-dialog', 'aria-label': label }, [
    form,
  ]) as HTMLDialogElement;
  closeBtn.addEventListener('click', () => dialog.close());
  document.body.append(dialog);

  const closeCbs: (() => void)[] = [];
  dialog.addEventListener('close', () => closeCbs.forEach((cb) => cb()));

  return {
    dialog,
    body,
    handle: (cleanup) => ({
      open: () => {
        if (!dialog.open) dialog.showModal();
      },
      close: () => dialog.close(),
      onClose: (cb) => closeCbs.push(cb),
      dispose: () => {
        cleanup?.();
        dialog.remove();
      },
    }),
  };
}

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: 'high', label: 'High', hint: 'Bloom, soft shadows, all decorations' },
  { value: 'medium', label: 'Medium', hint: 'Lighter shadows, fewer decorations' },
  { value: 'low', label: 'Low', hint: 'No post-processing, shadows or decorations' },
];

const MOTION_OPTIONS: { value: MotionPref; label: string }[] = [
  { value: 'system', label: 'Follow system setting' },
  { value: 'reduce', label: 'Reduce motion' },
  { value: 'full', label: 'Full motion' },
];

export function mountSettingsDialog(store: SeanceStore, sound: SoundControl): DialogHandle {
  const { body, handle } = baseDialog('Settings', 'Settings');

  // --- graphics quality ---
  const quality = el('select', { id: 'set-quality' },
    QUALITY_OPTIONS.map((o) => el('option', { value: o.value }, [o.label])),
  ) as HTMLSelectElement;
  const qualityHint = el('p', { class: 'setting-hint', id: 'set-quality-hint' });
  quality.setAttribute('aria-describedby', 'set-quality-hint');
  quality.addEventListener('change', () =>
    store.getState().updateSettings({ quality: quality.value as Quality }),
  );

  // --- motion (radio group) ---
  const motionRadios = MOTION_OPTIONS.map((o) => {
    const input = el('input', {
      type: 'radio',
      name: 'set-motion',
      id: `set-motion-${o.value}`,
      value: o.value,
    }) as HTMLInputElement;
    input.addEventListener('change', () => {
      if (input.checked) store.getState().setMotionPreference(o.value);
    });
    return { input, label: el('label', { for: input.id }, [input, ` ${o.label}`]) };
  });
  const motionHint = el('p', { class: 'setting-hint', id: 'set-motion-hint' });
  const motionGroup = el(
    'fieldset',
    { class: 'setting-group', 'aria-describedby': 'set-motion-hint' },
    [el('legend', { text: 'Motion' }), ...motionRadios.map((r) => r.label), motionHint],
  );

  // --- sound ---
  const soundCb = el('input', { type: 'checkbox', id: 'set-sound' }) as HTMLInputElement;
  soundCb.addEventListener('change', () => {
    void sound.set(soundCb.checked).then(render);
  });

  // --- show completed ---
  const completedCb = el('input', { type: 'checkbox', id: 'set-completed' }) as HTMLInputElement;
  completedCb.addEventListener('change', () =>
    store.getState().updateSettings({ showCompleted: completedCb.checked }),
  );

  body.append(
    el('div', { class: 'field' }, [
      el('label', { for: 'set-quality', text: 'Graphics quality' }),
      quality,
      qualityHint,
    ]),
    motionGroup,
    el('div', { class: 'field' }, [
      el('label', { for: 'set-sound' }, [soundCb, ' Ambient sound (wind, crows, bell)']),
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'set-completed' }, [completedCb, ' Show graves laid to rest']),
    ]),
    el('p', {
      class: 'setting-hint',
      text: 'Settings are saved in this browser only. Nothing is sent anywhere.',
    }),
  );

  function render(): void {
    const s = store.getState();
    quality.value = s.settings.quality;
    qualityHint.textContent =
      QUALITY_OPTIONS.find((o) => o.value === s.settings.quality)?.hint ?? '';
    for (const r of motionRadios) r.input.checked = r.input.value === s.settings.motion;
    motionHint.textContent = `Your system ${
      s.view.systemReducedMotion ? 'asks for' : 'does not ask for'
    } reduced motion. Currently: ${s.settings.reducedMotion ? 'reduced' : 'full'} motion.`;
    soundCb.checked = sound.isEnabled();
    completedCb.checked = s.settings.showCompleted;
  }

  render();
  const unsubscribe = store.subscribe(render);
  const h = handle(unsubscribe);
  return {
    ...h,
    open: () => {
      render();
      h.open();
    },
  };
}

/** Legend rows: what each spooky element means. */
const LEGEND: [string, string][] = [
  ['Tall glowing obelisk', 'High priority'],
  ['Arched headstone, warm glow', 'Medium priority'],
  ['Small flat marker', 'Low priority'],
  ['Moss, a crack and a landed crow', 'Due within 24 hours'],
  ['Deep crack, circling crows, a pacing spirit and a skeleton', 'Overdue'],
  ['Deeper night', 'Your soonest deadline is getting closer'],
  ['Thicker fog', 'More tasks are overdue'],
  ['Blood moon', 'Three or more tasks are overdue'],
  ['Sunken mossy mound, no glow', 'Completed (laid to rest)'],
];

export function mountAboutDialog(): DialogHandle {
  const { body, handle } = baseDialog('About Séance', 'About Séance');

  const legend = el('dl', { class: 'about-legend' });
  for (const [sign, meaning] of LEGEND) {
    legend.append(el('dt', { text: sign }), el('dd', { text: meaning }));
  }

  body.append(
    el('p', {
      text:
        'Séance is a task manager whose to-do list is a 3D graveyard. Every task is a grave, ' +
        'and everything spooky you see encodes real task state.',
    }),
    el('h3', { text: 'Reading the graveyard' }),
    legend,
    el('h3', { text: 'Privacy' }),
    el('p', {
      text:
        'No account, no server, no tracking. Your tasks live in this browser’s localStorage. ' +
        'Use Export ledger on the ledger view to back them up.',
    }),
    el('h3', { text: 'Accessibility' }),
    el('p', {
      text:
        'The ledger is the full, keyboard-accessible version of the app. The graveyard is optional ' +
        'and respects your motion preference (see Settings).',
    }),
    el('p', { class: 'setting-hint' }, [
      'MIT licensed. Built for Kiroween 2026. Fonts and libraries are credited in ',
      el('code', { text: 'CREDITS.md' }),
      '.',
    ]),
  );

  return handle();
}
