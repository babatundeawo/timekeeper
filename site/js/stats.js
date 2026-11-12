/* Focus history: completed focus sessions saved on this device only. */

import { $, store, num, toast } from './core.js';

const KEY = 'focusLog';
const MAX_ENTRIES = 1000;

let log = (() => {
  const saved = store.get(KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((e) => e && Number.isFinite(e.t) && Number.isFinite(e.m))
    .map((e) => ({ t: e.t, m: num(e.m, 0, 0, 1440), k: typeof e.k === 'string' ? e.k.slice(0, 60) : '' }));
})();

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function byDay() {
  const map = new Map();
  for (const e of log) {
    const key = dayKey(e.t);
    const day = map.get(key) || { minutes: 0, sessions: 0 };
    day.minutes += e.m;
    day.sessions += 1;
    map.set(key, day);
  }
  return map;
}

function streakDays(map) {
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  // A streak is still alive if today has no session yet but yesterday did.
  if (!map.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (map.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function record(minutes, task) {
  log.push({ t: Date.now(), m: Math.round(minutes * 10) / 10, k: (task || '').slice(0, 60) });
  if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);
  store.set(KEY, log);
  render();
}

function fmtMinutes(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

export function render() {
  const map = byDay();
  const today = map.get(dayKey(Date.now())) || { minutes: 0, sessions: 0 };
  $('statToday').textContent = fmtMinutes(today.minutes);
  $('statSessions').textContent = String(today.sessions);
  const streak = streakDays(map);
  $('statStreak').textContent = streak === 1 ? '1 day' : `${streak} days`;

  const bars = $('statsBars');
  bars.replaceChildren();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ date: d, ...(map.get(dayKey(d)) || { minutes: 0, sessions: 0 }) });
  }
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const summary = [];
  for (const day of days) {
    const col = document.createElement('div');
    col.className = 'bar-col';
    const track = document.createElement('div');
    track.className = 'bar-track';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(day.minutes ? 6 : 0, (day.minutes / max) * 100)}%`;
    track.append(bar);
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = day.date.toLocaleDateString(undefined, { weekday: 'narrow' });
    col.append(track, label);
    bars.append(col);
    summary.push(`${day.date.toLocaleDateString(undefined, { weekday: 'long' })} ${fmtMinutes(day.minutes)}`);
  }
  bars.setAttribute('aria-label', `Focus minutes over the last 7 days. ${summary.join(', ')}.`);

  const hasData = log.length > 0;
  $('exportStatsBtn').disabled = !hasData;
  $('clearStatsBtn').disabled = !hasData;
}

function csvCell(value) {
  const text = String(value);
  // Prefix cells that a spreadsheet could read as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = ['Date,Time,Minutes,Task'];
  for (const e of log) {
    const d = new Date(e.t);
    rows.push([dayKey(d), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, e.m, csvCell(e.k)].join(','));
  }
  const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timekeeper-focus-${dayKey(Date.now())}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Focus history exported');
}

let clearTimer = 0;
$('clearStatsBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (btn.dataset.armed !== 'true') {
    btn.dataset.armed = 'true';
    btn.textContent = 'Tap again to clear';
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Clear history'; }, 4000);
    return;
  }
  clearTimeout(clearTimer);
  btn.dataset.armed = '';
  btn.textContent = 'Clear history';
  log = [];
  store.remove(KEY);
  render();
  toast('Focus history cleared');
});
$('exportStatsBtn').addEventListener('click', exportCsv);

export function clearLogForReset() { log = []; }

render();
