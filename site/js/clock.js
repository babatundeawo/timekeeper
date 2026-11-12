/* Clock mode: an analog face, a digital readout and world clocks. */

import { $, pad, store, settings, toast, haptic } from './core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZONES = 12;
const QUICK_ZONES = [
  ['Africa/Lagos', 'Lagos'],
  ['Europe/London', 'London'],
  ['America/New_York', 'New York'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Kolkata', 'Kolkata'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
];

const handHour = $('handHour');
const handMinute = $('handMinute');
const handSecond = $('handSecond');
const clockDigital = $('clockDigital');
const clockDate = $('clockDate');
const worldList = $('worldList');
const tzInput = $('tzInput');
const tzError = $('tzError');
const tzQuick = $('tzQuick');
const tzList = $('tzList');

/* ---------- Time zone helpers ---------- */

const formatterCache = new Map();
function formatter(key, options) {
  let f = formatterCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(undefined, options); formatterCache.set(key, f); }
  return f;
}

export function isValidZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export function cityName(tz) {
  if (tz === 'UTC') return 'UTC';
  return tz.split('/').pop().replace(/_/g, ' ');
}

function zoneParts(tz, date) {
  const f = formatter('parts:' + tz, {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}

/** Offset of a zone from UTC, in minutes, at a given moment. */
export function offsetMinutes(tz, date) {
  const p = zoneParts(tz, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function dayLabel(tz, date) {
  const there = zoneParts(tz, date);
  const here = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  const a = Date.UTC(there.year, there.month - 1, there.day);
  const b = Date.UTC(here.year, here.month - 1, here.day);
  const diff = Math.round((a - b) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : (diff > 0 ? `+${diff} days` : `${diff} days`);
}

function diffLabel(tz, date) {
  const minutes = offsetMinutes(tz, date) - -date.getTimezoneOffset();
  if (minutes === 0) return 'Same time';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h} h${m ? ` ${m} m` : ''}`;
}

function timeText(tz, date) {
  const hour12 = !settings.get('clock24h');
  return formatter(`time:${tz}:${hour12}`, { timeZone: tz, hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 }).format(date);
}

/* ---------- World clocks ---------- */

const localZone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
})();

let zones = (() => {
  const saved = store.get('worldZones', []);
  return Array.isArray(saved) ? saved.filter((z) => typeof z === 'string' && isValidZone(z)).slice(0, MAX_ZONES) : [];
})();
let rows = [];

function saveZones() { store.set('worldZones', zones); }

function buildRow(tz, isLocal) {
  const li = document.createElement('li');
  li.className = 'world-row';
  const dot = document.createElement('span');
  dot.className = 'world-dot';
  dot.setAttribute('aria-hidden', 'true');
  const info = document.createElement('div');
  info.className = 'world-info';
  const name = document.createElement('span');
  name.className = 'world-name';
  name.textContent = isLocal ? `${cityName(tz)} (you)` : cityName(tz);
  const sub = document.createElement('span');
  sub.className = 'world-sub';
  info.append(name, sub);
  const time = document.createElement('span');
  time.className = 'world-time';
  li.append(dot, info, time);
  if (!isLocal) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove ${cityName(tz)}`);
    remove.addEventListener('click', () => {
      zones = zones.filter((z) => z !== tz);
      saveZones();
      renderWorld();
      haptic();
    });
    li.append(remove);
  }
  worldList.append(li);
  return { tz, isLocal, dot, sub, time };
}

function renderWorld() {
  worldList.replaceChildren();
  rows = [buildRow(localZone, true), ...zones.map((tz) => buildRow(tz, false))];
  renderQuick();
  updateWorld(new Date());
}

function updateWorld(now) {
  for (const row of rows) {
    row.time.textContent = timeText(row.tz, now);
    const day = dayLabel(row.tz, now);
    const sub = row.isLocal ? day : `${day} · ${diffLabel(row.tz, now)}`;
    if (row.sub.textContent !== sub) row.sub.textContent = sub;
    const h = zoneParts(row.tz, now).hour;
    row.dot.classList.toggle('is-day', h >= 6 && h < 18);
  }
}

function renderQuick() {
  tzQuick.replaceChildren();
  for (const [tz, label] of QUICK_ZONES) {
    if (zones.includes(tz) || tz === localZone) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip-small';
    chip.textContent = label;
    chip.setAttribute('aria-label', `Add ${label}`);
    chip.addEventListener('click', () => addZone(tz));
    tzQuick.append(chip);
  }
}

function showError(message) {
  tzError.textContent = message;
}

function addZone(raw) {
  const tz = String(raw).trim();
  showError('');
  if (!tz) { showError('Type a city or time zone first.'); return; }
  const match = knownZones().find((z) => z.toLowerCase() === tz.toLowerCase())
    || knownZones().find((z) => cityName(z).toLowerCase() === tz.toLowerCase());
  const zone = match || (isValidZone(tz) ? tz : null);
  if (!zone) { showError('That time zone was not found. Pick one from the suggestions, for example Africa/Lagos.'); return; }
  if (zone === localZone || zones.includes(zone)) { showError('That clock is already on the list.'); return; }
  if (zones.length >= MAX_ZONES) { showError(`You can keep up to ${MAX_ZONES} world clocks.`); return; }
  zones.push(zone);
  saveZones();
  tzInput.value = '';
  renderWorld();
  haptic();
  toast(`${cityName(zone)} added`);
}

let zoneNames = null;
function knownZones() {
  if (zoneNames) return zoneNames;
  try {
    zoneNames = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch { zoneNames = []; }
  if (!zoneNames.includes('UTC')) zoneNames = [...zoneNames, 'UTC'];
  return zoneNames;
}

tzInput.addEventListener('focus', () => {
  if (tzList.childElementCount) return;
  for (const z of knownZones()) {
    const option = document.createElement('option');
    option.value = z;
    tzList.append(option);
  }
}, { once: true });
$('tzAddBtn').addEventListener('click', () => addZone(tzInput.value));
tzInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addZone(tzInput.value); }
});
tzInput.addEventListener('input', () => showError(''));

/* ---------- Analog face ---------- */

(function drawTicks() {
  const group = $('hourTicks');
  const cx = 150, cy = 150, outer = 138;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const major = i % 3 === 0;
    const inner = major ? 114 : 122;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', (cx + outer * Math.cos(angle)).toFixed(2));
    line.setAttribute('y1', (cy + outer * Math.sin(angle)).toFixed(2));
    line.setAttribute('x2', (cx + inner * Math.cos(angle)).toFixed(2));
    line.setAttribute('y2', (cy + inner * Math.sin(angle)).toFixed(2));
    line.setAttribute('class', 'hour-tick' + (major ? ' major' : ''));
    group.append(line);
  }
})();

/* Hands only ever turn forwards: without this, 59 s to 0 s would sweep backwards. */
const angles = { hour: null, minute: null, second: null };
function unwrap(key, target) {
  const prev = angles[key];
  const next = prev === null ? target : prev + ((((target - prev) % 360) + 540) % 360 - 180);
  angles[key] = next;
  return next;
}

let timer = 0;
let active = false;

function render() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  let suffix = '';
  if (!settings.get('clock24h')) {
    suffix = h >= 12 ? ' PM' : ' AM';
    h = h % 12 || 12;
  }
  clockDigital.textContent = `${pad(h)}:${pad(m)}:${pad(s)}${suffix}`;
  clockDate.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  handHour.style.transform = `rotate(${unwrap('hour', ((now.getHours() % 12) + m / 60) * 30)}deg)`;
  handMinute.style.transform = `rotate(${unwrap('minute', (m + s / 60) * 6)}deg)`;
  handSecond.style.transform = `rotate(${unwrap('second', s * 6)}deg)`;
  updateWorld(now);

  timer = setTimeout(render, 1000 - now.getMilliseconds() + 5);
}

settings.on((key) => {
  if (key !== 'clock24h') return;
  $('clock24h').checked = settings.get('clock24h');
  if (active) { clearTimeout(timer); render(); } else updateWorld(new Date());
});

$('clock24h').checked = settings.get('clock24h');
$('clock24h').addEventListener('change', (e) => settings.set('clock24h', e.target.checked));

renderWorld();

export const clock = {
  onEnter() { active = true; clearTimeout(timer); render(); },
  onExit() { active = false; clearTimeout(timer); },
};
