/* Stopwatch mode with laps. State is timestamp based, so it survives reloads. */

import { $, store, num, fmtStopwatch, ticker, toast, haptic, setTitle, holdAwake } from './core.js';
import * as stage from './stage.js';

const KEY = 'stopwatch';
const MAX_LAPS = 200;
const lapsList = $('lapsList');

const st = (() => {
  const saved = store.get(KEY, null) || {};
  return {
    base: num(saved.base, 0, 0),
    startedAt: Number.isFinite(saved.startedAt) ? saved.startedAt : null,
    laps: Array.isArray(saved.laps) ? saved.laps.map((l) => num(l, 0, 0)).slice(-MAX_LAPS) : [],
  };
})();

const isRunning = () => st.startedAt !== null;
const elapsed = () => st.base + (isRunning() ? Math.max(0, (Date.now() - st.startedAt) / 1000) : 0);
const save = () => store.set(KEY, st);

function fmtFull(seconds) {
  const { base, cs } = fmtStopwatch(seconds);
  return `${base}.${cs}`;
}

function renderLaps() {
  lapsList.replaceChildren();
  $('copyLapsBtn').hidden = st.laps.length === 0;
  if (st.laps.length === 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'No laps yet. Press Lap while the stopwatch runs.';
    lapsList.append(li);
    return;
  }
  const splits = st.laps.map((total, i) => total - (i ? st.laps[i - 1] : 0));
  const best = splits.length > 2 ? Math.min(...splits) : null;
  const worst = splits.length > 2 ? Math.max(...splits) : null;
  for (let i = splits.length - 1; i >= 0; i--) {
    const li = document.createElement('li');
    li.className = 'lap-row';
    if (best !== null && splits[i] === best) li.classList.add('is-best');
    if (worst !== null && splits[i] === worst && worst !== best) li.classList.add('is-worst');
    const name = document.createElement('span');
    name.className = 'lap-name';
    name.textContent = `Lap ${i + 1}`;
    if (li.classList.contains('is-best')) name.append(tagEl('Fastest'));
    if (li.classList.contains('is-worst')) name.append(tagEl('Slowest'));
    const split = document.createElement('span');
    split.className = 'lap-split';
    split.textContent = fmtFull(splits[i]);
    const total = document.createElement('span');
    total.className = 'lap-total';
    total.textContent = fmtFull(st.laps[i]);
    li.append(name, split, total);
    lapsList.append(li);
  }
}

function tagEl(text) {
  const tag = document.createElement('span');
  tag.className = 'lap-tag';
  tag.textContent = text;
  return tag;
}

function render() {
  const t = elapsed();
  const { base, cs } = fmtStopwatch(t);
  const running = isRunning();
  setTitle('stopwatch', running ? `${base} Stopwatch` : null);
  if (!stage.isActive('stopwatch')) return;
  stage.setDigits(base, cs);
  stage.setSub(running ? 'Running' : (t > 0 ? 'Paused' : 'Ready'));
  stage.setRing((t % 60) / 60, 'patina');
  stage.setTick((t % 60) / 60);
  stage.setStart(running ? 'Pause' : (t > 0 ? 'Resume' : 'Start'), running);
}

export const stopwatch = {
  onEnter() { stage.pulse(false); renderLaps(); render(); },
  onExit() { /* keeps running in the background */ },
  onStart() {
    if (isRunning()) {
      st.base = elapsed();
      st.startedAt = null;
      ticker.remove(render);
      holdAwake('stopwatch', false);
    } else {
      st.startedAt = Date.now();
      ticker.add(render);
      holdAwake('stopwatch', true);
    }
    save();
    render();
  },
  onReset() {
    ticker.remove(render);
    holdAwake('stopwatch', false);
    st.base = 0;
    st.startedAt = null;
    st.laps = [];
    save();
    renderLaps();
    render();
  },
  onLap() {
    if (!isRunning()) return;
    st.laps.push(elapsed());
    if (st.laps.length > MAX_LAPS) st.laps.shift();
    save();
    renderLaps();
  },
  copyLaps() {
    const splits = st.laps.map((total, i) => total - (i ? st.laps[i - 1] : 0));
    const lines = ['Lap\tSplit\tTotal', ...splits.map((s, i) => `${i + 1}\t${fmtFull(s)}\t${fmtFull(st.laps[i])}`)];
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Laps copied'), () => toast('Could not copy the laps'));
    } else {
      toast('Copying is not supported in this browser');
    }
  },
};

$('copyLapsBtn').addEventListener('click', () => { haptic(); stopwatch.copyLaps(); });

if (isRunning()) { ticker.add(render); holdAwake('stopwatch', true); }
renderLaps();
render();
