/* Focus mode: Pomodoro cycles with optional background sound and a daily log.
   State is timestamp based, so a running session survives reloads. */

import { $, store, num, fmtHMS, ticker, toast, haptic, notify, announce, setTitle, holdAwake, settings } from './core.js';
import { playTone, startNoise, stopNoise } from './audio.js';
import { record } from './stats.js';
import * as stage from './stage.js';

const KEY = 'focus';
const LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };

const focusIn = $('pomoFocus');
const shortIn = $('pomoShort');
const longIn = $('pomoLong');
const roundsIn = $('pomoRounds');
const taskIn = $('focusTaskIn');

const config = (() => {
  const saved = store.get('pomoSettings', {}) || {};
  return {
    focus: num(saved.focus, 25, 1, 120),
    short: num(saved.short, 5, 1, 60),
    long: num(saved.long, 15, 1, 60),
    rounds: Math.round(num(saved.rounds, 4, 1, 12)),
  };
})();
focusIn.value = config.focus;
shortIn.value = config.short;
longIn.value = config.long;
roundsIn.value = config.rounds;

const phaseSeconds = (phase) => config[phase === 'focus' ? 'focus' : phase] * 60;

const st = (() => {
  const saved = store.get(KEY, null) || {};
  const phase = ['focus', 'short', 'long'].includes(saved.phase) ? saved.phase : 'focus';
  const total = num(saved.total, phaseSeconds(phase), 1, 7200);
  return {
    phase,
    round: Math.round(num(saved.round, 1, 1, 12)),
    total,
    remaining: num(saved.remaining, total, 0, 7200),
    endAt: Number.isFinite(saved.endAt) ? saved.endAt : null,
    task: typeof saved.task === 'string' ? saved.task.slice(0, 60) : '',
  };
})();
taskIn.value = st.task;

const isRunning = () => st.endAt !== null;
const remaining = () => (isRunning() ? Math.max(0, (st.endAt - Date.now()) / 1000) : st.remaining);
const save = () => store.set(KEY, st);

function loadPhase(phase) {
  st.phase = phase;
  st.total = phaseSeconds(phase);
  st.remaining = st.total;
  st.endAt = null;
}

/** Moves to the next phase of the cycle. */
function advance() {
  if (st.phase === 'focus') {
    loadPhase(st.round >= config.rounds ? 'long' : 'short');
  } else {
    st.round = st.phase === 'long' ? 1 : st.round + 1;
    loadPhase('focus');
  }
}

function completedPhase(when) {
  const wasFocus = st.phase === 'focus';
  if (wasFocus) record(st.total / 60, st.task);
  const finished = st.phase;
  advance();
  return { finished, wasFocus, when };
}

/* A phase that ended while the page was closed. */
let missed = false;
if (isRunning() && st.endAt <= Date.now()) {
  completedPhase(st.endAt);
  missed = true;
  save();
}

/* ---------- Rendering ---------- */

function renderDots() {
  stage.el.dots.replaceChildren();
  for (let i = 1; i <= config.rounds; i++) {
    const dot = document.createElement('span');
    dot.className = 'session-dot';
    if (i < st.round || (i === st.round && st.phase !== 'focus')) dot.classList.add('done');
    if (i === st.round && st.phase === 'focus') dot.classList.add('current');
    stage.el.dots.append(dot);
  }
  stage.el.dots.setAttribute('role', 'img');
  stage.el.dots.setAttribute('aria-label', `Round ${st.round} of ${config.rounds}`);
}

function render() {
  const rem = remaining();
  const text = fmtHMS(Math.ceil(rem - 0.0001));
  const running = isRunning();
  setTitle('focus', running ? `${text} ${LABELS[st.phase]}` : null);
  if (!stage.isActive('pomodoro')) return;
  stage.setDigits(text);
  stage.setSub(`${LABELS[st.phase]} · round ${st.round} of ${config.rounds}`);
  stage.setRing(st.total ? rem / st.total : 0, st.phase === 'focus' ? 'brass' : 'patina');
  stage.el.ringWrap.classList.toggle('on-break', st.phase !== 'focus');
  stage.setStart(running ? 'Pause' : (rem < st.total ? 'Resume' : 'Start'), running);
  const showTask = st.phase === 'focus' && st.task;
  stage.el.focusTask.hidden = !showTask;
  if (showTask) stage.el.focusTask.textContent = st.task;
}

function syncAudio() {
  if (isRunning() && st.phase === 'focus') startNoise(settings.get('noise'));
  else stopNoise();
}

/* ---------- Running ---------- */

function tick() {
  if (!isRunning()) return;
  if (remaining() <= 0) { finishPhase(); return; }
  render();
}

function finishPhase() {
  const { finished, wasFocus } = completedPhase(Date.now());
  playTone(settings.get('tone'));
  haptic([200, 100, 200]);
  const message = wasFocus
    ? `Focus session complete. Time for a ${LABELS[st.phase].toLowerCase()}.`
    : `${LABELS[finished]} over. Ready to focus?`;
  notify('Timekeeper', message, 'focus');
  announce(message);
  toast(message);
  if (settings.get('autoStart')) {
    st.endAt = Date.now() + st.remaining * 1000;
  } else {
    ticker.remove(tick);
    holdAwake('focus', false);
  }
  save();
  syncAudio();
  renderDots();
  render();
}

function start() {
  stage.pulse(false);
  st.endAt = Date.now() + st.remaining * 1000;
  save();
  ticker.add(tick);
  holdAwake('focus', true);
  syncAudio();
  render();
}

function pause() {
  st.remaining = remaining();
  st.endAt = null;
  save();
  ticker.remove(tick);
  holdAwake('focus', false);
  syncAudio();
  render();
}

export const focus = {
  onEnter() { stage.pulse(false); renderDots(); render(); },
  onExit() { /* keeps running in the background */ },
  onStart() { if (isRunning()) pause(); else start(); },
  onReset() {
    ticker.remove(tick);
    holdAwake('focus', false);
    st.round = 1;
    loadPhase('focus');
    save();
    syncAudio();
    renderDots();
    render();
  },
  /** Called when background sound is changed in settings. */
  refreshAudio: syncAudio,
};

/* ---------- Wiring ---------- */

function readConfig() {
  config.focus = num(focusIn.value, 25, 1, 120);
  config.short = num(shortIn.value, 5, 1, 60);
  config.long = num(longIn.value, 15, 1, 60);
  config.rounds = Math.round(num(roundsIn.value, 4, 1, 12));
  focusIn.value = config.focus;
  shortIn.value = config.short;
  longIn.value = config.long;
  roundsIn.value = config.rounds;
  store.set('pomoSettings', config);
  if (st.round > config.rounds) st.round = config.rounds;
  if (!isRunning()) { st.total = phaseSeconds(st.phase); st.remaining = st.total; }
  save();
  renderDots();
  render();
}
[focusIn, shortIn, longIn, roundsIn].forEach((input) => input.addEventListener('change', readConfig));

taskIn.addEventListener('input', () => {
  st.task = taskIn.value.trim().slice(0, 60);
  save();
  render();
});

settings.on((key) => { if (key === 'noise' || key === 'sound') syncAudio(); });

if (isRunning()) { ticker.add(tick); holdAwake('focus', true); }
if (missed) setTimeout(() => toast('A focus phase finished while Timekeeper was closed'), 600);
render();
