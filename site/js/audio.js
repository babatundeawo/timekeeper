/* Timekeeper audio: synthesized alarm tones and background noise with the
   Web Audio API. No audio files are downloaded, so everything works offline. */

import { settings } from './core.js';

let ctx = null;

function getCtx() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

/** Browsers only allow audio after a user gesture; call this from one. */
export function unlockAudio() { getCtx(); }

/* Each tone is a list of notes: frequency (Hz), start offset (s), length (s), wave and relative loudness. */
export const TONES = {
  chime: {
    label: 'Chime',
    notes: [
      { f: 1046.5, t: 0, d: 1.1, w: 'sine', g: 1 },
      { f: 1318.5, t: 0.2, d: 1.1, w: 'sine', g: 0.85 },
      { f: 1568, t: 0.4, d: 1.3, w: 'sine', g: 0.8 },
    ],
  },
  beacon: {
    label: 'Beacon',
    notes: [
      { f: 880, t: 0, d: 0.16, w: 'triangle', g: 1 },
      { f: 660, t: 0.2, d: 0.16, w: 'triangle', g: 1 },
      { f: 880, t: 0.4, d: 0.16, w: 'triangle', g: 1 },
      { f: 660, t: 0.6, d: 0.16, w: 'triangle', g: 1 },
    ],
  },
  pulse: {
    label: 'Pulse',
    notes: [0, 0.18, 0.36, 0.54].map((t) => ({ f: 740, t, d: 0.11, w: 'sine', g: 1 })),
  },
  gentle: {
    label: 'Gentle',
    notes: [
      { f: 440, t: 0, d: 0.9, w: 'sine', g: 0.9, a: 0.12 },
      { f: 554.4, t: 0.35, d: 0.9, w: 'sine', g: 0.9, a: 0.12 },
      { f: 659.3, t: 0.7, d: 0.9, w: 'sine', g: 0.9, a: 0.12 },
      { f: 880, t: 1.05, d: 1.2, w: 'sine', g: 0.8, a: 0.12 },
    ],
  },
};

export function toneLength(name) {
  const tone = TONES[name] || TONES.chime;
  return Math.max(...tone.notes.map((n) => n.t + n.d));
}

/**
 * Plays a tone. Returns its length in seconds, or 0 if nothing was played.
 * `force` plays even when sound is muted (used by the "Test sound" button).
 */
export function playTone(name, { force = false } = {}) {
  if (!force && !settings.get('sound')) return 0;
  const c = getCtx();
  if (!c) return 0;
  const tone = TONES[name] || TONES.chime;
  const peak = 0.32 * settings.get('volume');
  const now = c.currentTime + 0.02;
  for (const n of tone.notes) {
    const start = now + n.t;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.w;
    osc.frequency.value = n.f;
    const attack = n.a || 0.015;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak * n.g), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + n.d + 0.05);
  }
  return toneLength(name);
}

/* ---------- Background noise for focus sessions ---------- */

export const NOISES = { off: 'Off', brown: 'Brown noise', rain: 'Rain' };
let noise = null;

function makeNoiseBuffer(c, kind) {
  const length = c.sampleRate * 4;
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    } else {
      data[i] = white * 0.6;
    }
  }
  // Fade both ends so the loop point never clicks.
  const fade = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] *= k;
    data[length - 1 - i] *= k;
  }
  return buffer;
}

export function startNoise(kind) {
  stopNoise(true);
  if (!kind || kind === 'off' || !settings.get('sound')) return;
  const c = getCtx();
  if (!c) return;
  const source = c.createBufferSource();
  source.buffer = makeNoiseBuffer(c, kind);
  source.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  if (kind === 'rain') {
    const high = c.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 600;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 7500;
    source.connect(high).connect(low).connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(c.destination);
  const level = (kind === 'rain' ? 0.22 : 0.3) * settings.get('volume');
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, level), c.currentTime + 1.5);
  source.start();
  noise = { source, gain, kind };
}

export function stopNoise(immediate = false) {
  if (!noise) return;
  const { source, gain } = noise;
  noise = null;
  try {
    if (immediate) { source.stop(); return; }
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    source.stop(t + 0.55);
  } catch { /* already stopped */ }
}

export function currentNoise() { return noise ? noise.kind : 'off'; }
