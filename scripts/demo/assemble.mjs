// Encode frames + soundtrack into a YouTube-friendly MP4.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
const frames = path.join(out, 'frames', 'f_%05d.png');
const audio = path.join(out, 'soundtrack.wav');
const target = path.join(out, 'seance-demo.mp4');

const winget = 'C:\\Users\\muend\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';
const ffmpeg = process.env.FFMPEG || (existsSync(winget) ? winget : 'ffmpeg');

if (!existsSync(path.join(out, 'frames', 'f_00000.png'))) throw new Error('No frames; run demo:capture');
if (!existsSync(audio)) throw new Error('No soundtrack; run demo:audio');

const args = [
  '-y', '-framerate', String(FPS), '-i', frames, '-i', audio,
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16',
  '-pix_fmt', 'yuv420p', '-bf', '2', '-g', String(Math.round(FPS / 2)),
  '-maxrate', '12M', '-bufsize', '24M',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
  '-r', String(FPS),
  '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '384k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', '-shortest', target,
];
const r = spawnSync(ffmpeg, args, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('Wrote', target);
