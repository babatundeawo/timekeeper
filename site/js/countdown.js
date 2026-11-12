/* Timer mode: a countdown for a duration, or until a time of day.
   State is stored as an end timestamp, so it survives reloads and sleep. */

import { $, store, num, fmtHMS, pad, ticker, toast, haptic, notify, announce, setTitle, holdAwake, settings } from './core.js';
import { playTone } from './audio.js';
import * as stage from './stage.js';

const KEY = 'countdown';
const DEFAULT_PRESETS = [5, 10, 15, 25, 45];
const MAX_SECONDS = 24 * 3600;

const chipsEl = $('countdownChips');
const hIn = $('cdHours');
const mIn = $('cdMinutes');
const sIn = $('cdSeconds');
const untilIn = $('cdUntil');
const untilHint = $('cdUntilHint');
const modeDuration = $('cdModeDuration');
const modeUntil = $('cdModeUntil');
const durationBox = $('cdDurationBox');
const untilBox = $('cdUntilBox');

let presets = (() => {
  const saved = store.get('countdownPresets', DEFAULT_PRESETS);
  return Array.isArray(saved) ? saved.map((p) => num(p, 0, 0.1, 1440)).filter(Boolean) : DEFAULT_PRESETS;
})();

const st = (() => {
  const saved = store.get(KEY, null) || {};
  const total = num(saved.total, 300, 1, MAX_SECONDS);
  return {
    total,
    remaining: num(saved.remaining, total, 0, MAX_SECONDS),
    endAt: Number.isFinite(saved.endAt) ? saved.endAt : null,
    kind: saved.kind === 'until' ? 'until' : 'duration',
    until: typeof saved.until === 'string' && /^\d{2}:\d{2}$/.test(saved.until) ? saved.until : '',
    done: Boolean(saved.done),
  };
})();

const isRunning = () => st.endAt !== null;
const remaining = () => (isRunning() ? Math.max(0, (st.endAt - Date.now()) / 1000) : st.remaining);
const save = () => store.set(KEY, st);

/* A countdown that ended while the page was closed. */
let missed = false;
if (isRunning() && st.endAt <= Date.now()) {
  st.endAt = null;
  st.remaining = 0;
  st.done = true;
  missed = true;
  save();
}

function secondsUntil(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.round((target - now) / 1000);
}

function fmtClockTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  if (settings.get('clock24h')) return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

function readInputs() {
  const h = num(hIn.value, 0, 0, 23);
  const m = num(mIn.value, 0, 0, 59);
  const s = num(sIn.value, 0, 0, 59);
  return h * 3600 + m * 60 + s;
}

function writeInputs(total) {
  hIn.value = Math.floor(total / 3600);
  mIn.value = Math.floor((total % 3600) / 60);
  sIn.value = total % 60;
}

/** The length this timer will run for, taken from whichever input is showing. */
function configuredSeconds() {
  if (st.kind === 'until' && st.until) return secondsUntil(st.until);
  return readInputs() || st.total;
}

function setDuration(seconds) {
  st.total = Math.min(MAX_SECONDS, Math.max(1, Math.round(seconds)));
  st.remaining = st.total;
  st.done = false;
  writeInputs(st.total);
  save();
  render();
}

/* ---------- Rendering ---------- */

function fmtChipLabel(mins) {
  if (mins < 1) return `${Math.round(mins * 60)} sec`;
  if (mins < 60) return `${Number.isInteger(mins) ? mins : mins.toFixed(1)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h} hr`;
}

function renderChips() {
  chipsEl.replaceChildren();
  presets.forEach((mins) => {
    const custom = !DEFAULT_PRESETS.includes(mins);
    const group = document.createElement('span');
    group.className = 'chip-group';
    const chip = document.createElement('button');
    chip.className = 'chip' + (custom ? ' custom' : '');
    chip.type = 'button';
    chip.textContent = fmtChipLabel(mins);
    chip.addEventListener('click', () => {
      if (isRunning()) { toast('Pause or reset the timer first'); return; }
      haptic();
      setDuration(mins * 60);
    });
    group.append(chip);
    if (custom) {
      const remove = document.createElement('button');
      remove.className = 'chip-remove';
      remove.type = 'button';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Remove ${fmtChipLabel(mins)} preset`);
      remove.addEventListener('click', () => {
        presets = presets.filter((p) => p !== mins);
        store.set('countdownPresets', presets);
        renderChips();
      });
      group.append(remove);
    }
    chipsEl.append(group);
  });
}

function renderKind() {
  const until = st.kind === 'until';
  modeDuration.setAttribute('aria-pressed', String(!until));
  modeUntil.setAttribute('aria-pressed', String(until));
  durationBox.hidden = until;
  untilBox.hidden = !until;
  untilIn.value = st.until;
  untilHint.textContent = st.until
    ? `Counts down to ${fmtClockTime(st.until)}${secondsUntil(st.until) > 12 * 3600 ? ' tomorrow' : ''}.`
    : 'Pick the time you want the timer to ring.';
  $('savePresetBtn').hidden = until;
}

function render() {
  const rem = remaining();
  const shown = isRunning() ? Math.ceil(rem - 0.0001) : Math.ceil(rem);
  const text = fmtHMS(shown);
  const running = isRunning();

  if (running) setTitle('countdown', `${text} Timer`); else setTitle('countdown', null);
  if (!stage.isActive('countdown')) return;

  stage.setDigits(text);
  const sub = running
    ? (st.kind === 'until' && st.until ? `Until ${fmtClockTime(st.until)}` : 'Counting down')
    : st.done || rem <= 0 ? 'Time’s up' : (rem < st.total ? 'Paused' : 'Ready');
  stage.setSub(sub);
  stage.setRing(st.total ? rem / st.total : 0, 'brass');
  stage.setStart(running ? 'Pause' : (rem > 0 && rem < st.total ? 'Resume' : 'Start'), running);
}

/* ---------- Running ---------- */

function tick() {
  if (!isRunning()) return;
  if (remaining() <= 0) { finish(); return; }
  render();
}

function finish() {
  ticker.remove(tick);
  st.endAt = null;
  st.remaining = 0;
  st.done = true;
  save();
  holdAwake('countdown', false);
  if (stage.isActive('countdown')) stage.pulse(true);
  render();
  playTone(settings.get('tone'));
  haptic([200, 100, 200]);
  notify('Timekeeper', 'Your timer has finished', 'countdown');
  announce('Timer finished');
}

function start() {
  if (st.done || st.remaining <= 0) setDuration(configuredSeconds());
  else if (st.remaining === st.total && st.kind === 'until' && st.until) setDuration(secondsUntil(st.until));
  stage.pulse(false);
  st.endAt = Date.now() + st.remaining * 1000;
  st.done = false;
  save();
  ticker.add(tick);
  holdAwake('countdown', true);
  render();
}

function pause() {
  st.remaining = remaining();
  st.endAt = null;
  save();
  ticker.remove(tick);
  holdAwake('countdown', false);
  render();
}

export const countdown = {
  onEnter() {
    stage.pulse(st.done && !isRunning());
    renderChips();
    renderKind();
    if (!isRunning() && st.remaining === st.total && !st.done) {
      const configured = st.kind === 'until' && st.until ? null : readInputs();
      if (configured && configured !== st.total) { st.total = st.remaining = configured; save(); }
    }
    render();
  },
  onExit() { stage.pulse(false); },
  onStart() {
    if (isRunning()) { pause(); return; }
    if (st.kind === 'duration' && !st.done && st.remaining === st.total && readInputs() === 0) {
      toast('Set a time first');
      return;
    }
    start();
  },
  onReset() {
    ticker.remove(tick);
    holdAwake('countdown', false);
    st.endAt = null;
    stage.pulse(false);
    setDuration(configuredSeconds());
  },
  onAddMinute() {
    if (isRunning()) st.endAt += 60000; else st.remaining += 60;
    st.total = Math.min(MAX_SECONDS, Math.max(st.total, Math.ceil(remaining())));
    st.done = false;
    stage.pulse(false);
    save();
    render();
    toast('+1 minute added');
  },
  /** Used by shared links such as ?mode=countdown&t=300 */
  setFromLink(seconds) {
    if (isRunning()) return;
    st.kind = 'duration';
    setDuration(num(seconds, st.total, 1, MAX_SECONDS));
  },
  copyLink() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('mode', 'countdown');
    url.searchParams.set('t', String(Math.round(st.total)));
    const text = url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Link copied'), () => toast('Could not copy the link'));
    } else {
      toast('Copying is not supported in this browser');
    }
  },
};

/* ---------- Wiring ---------- */

[hIn, mIn, sIn].forEach((input) => input.addEventListener('change', () => {
  if (isRunning()) return;
  // An all-zero entry is usually someone midway through typing; leave the fields alone.
  const seconds = readInputs();
  if (seconds > 0) setDuration(seconds);
}));

untilIn.addEventListener('change', () => {
  if (isRunning()) return;
  st.until = untilIn.value || '';
  if (st.until) { st.total = st.remaining = secondsUntil(st.until); st.done = false; }
  save();
  renderKind();
  render();
});

function setKind(kind) {
  if (isRunning()) { toast('Pause or reset the timer first'); return; }
  st.kind = kind;
  if (kind === 'until' && st.until) { st.total = st.remaining = secondsUntil(st.until); st.done = false; }
  if (kind === 'duration') { st.total = st.remaining = Math.max(1, readInputs() || 300); st.done = false; }
  save();
  renderKind();
  render();
}
modeDuration.addEventListener('click', () => setKind('duration'));
modeUntil.addEventListener('click', () => setKind('until'));

$('savePresetBtn').addEventListener('click', () => {
  const seconds = readInputs();
  if (seconds <= 0) { toast('Set a time first'); return; }
  const mins = Math.round((seconds / 60) * 10) / 10;
  if (presets.includes(mins)) { toast('Preset already saved'); return; }
  presets = [...presets, mins].sort((a, b) => a - b);
  store.set('countdownPresets', presets);
  renderChips();
  toast('Preset saved');
});
$('copyLinkBtn').addEventListener('click', () => countdown.copyLink());

writeInputs(st.total);
if (isRunning()) { ticker.add(tick); holdAwake('countdown', true); }
if (missed) setTimeout(() => toast('Your timer finished while Timekeeper was closed'), 600);
render();
