/* Timekeeper core: DOM helpers, storage, settings, one shared tick loop,
   tab title, toasts, haptics, notifications and the screen wake lock. */

export const $ = (id) => document.getElementById(id);
export const pad = (n) => String(Math.floor(n)).padStart(2, '0');

export function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Stopwatch time as a whole-second part plus a hundredths tail. */
export function fmtStopwatch(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const whole = Math.floor(s);
  return { base: fmtHMS(whole), cs: pad(Math.min(99, Math.floor((s - whole) * 100))) };
}

export function num(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/* ---------- Storage (never throws) ---------- */

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('tk:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('tk:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  remove(key) {
    try { localStorage.removeItem('tk:' + key); } catch { /* storage unavailable */ }
  },
  clearAll() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('tk:')).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
  },
};

/* ---------- Settings ---------- */

const DEFAULTS = {
  sound: true,
  volume: 0.7,
  tone: 'chime',
  vibrate: true,
  wakeLock: true,
  clock24h: false,
  snooze: 5,
  autoStart: false,
  noise: 'off',
};

const settingState = { ...DEFAULTS };
(function loadSettings() {
  const saved = store.get('settings', {});
  const legacy = { sound: store.get('soundOn', undefined), clock24h: store.get('clock24h', undefined) };
  const source = { ...legacy, ...(saved && typeof saved === 'object' ? saved : {}) };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof source[key] === typeof DEFAULTS[key]) settingState[key] = source[key];
  }
  settingState.volume = num(settingState.volume, DEFAULTS.volume, 0, 1);
})();

const settingListeners = new Set();
export const settings = {
  get: (key) => settingState[key],
  set(key, value) {
    settingState[key] = value;
    store.set('settings', settingState);
    settingListeners.forEach((fn) => fn(key, value));
  },
  on: (fn) => settingListeners.add(fn),
};

/* ---------- One shared tick loop ----------
   requestAnimationFrame while the page is visible, a 250 ms interval while
   hidden (rAF pauses in background tabs, which would silence finished timers). */

const tickSubs = new Set();
let rafId = 0;
let intervalId = 0;

function runTicks() {
  Array.from(tickSubs).forEach((fn) => fn());
}
function frame() {
  rafId = 0;
  runTicks();
  kick();
}
function kick() {
  if (tickSubs.size === 0) {
    if (intervalId) { clearInterval(intervalId); intervalId = 0; }
    return;
  }
  if (document.hidden) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (!intervalId) intervalId = setInterval(() => { runTicks(); kick(); }, 250);
  } else {
    if (intervalId) { clearInterval(intervalId); intervalId = 0; }
    if (!rafId) rafId = requestAnimationFrame(frame);
  }
}
document.addEventListener('visibilitychange', kick);

export const ticker = {
  add(fn) { tickSubs.add(fn); kick(); },
  remove(fn) { tickSubs.delete(fn); kick(); },
};

/* ---------- Tab title ---------- */

const BASE_TITLE = document.title;
const titles = new Map();
export function setTitle(key, text) {
  if (text) titles.set(key, text); else titles.delete(key);
  const first = titles.values().next().value;
  const next = first ? `${first} · Timekeeper` : BASE_TITLE;
  if (document.title !== next) document.title = next;
}

/* ---------- Feedback ---------- */

let toastTimer = 0;
export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Screen-reader announcement for events that have no visible change. */
export function announce(message) {
  const el = $('announcer');
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 40);
}

export function haptic(ms = 10) {
  if (!settings.get('vibrate')) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unavailable */ }
}

export async function notify(title, body, tag = 'timekeeper') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = new URL('icons/icon-192.png', document.baseURI).href;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) { await reg.showNotification(title, { body, icon, badge: icon, tag, renotify: true }); return; }
  } catch { /* fall back below */ }
  try { new Notification(title, { body, icon, tag }); } catch { /* unsupported */ }
}

/* ---------- Screen wake lock ---------- */

const holders = new Map();
let wakeLock = null;
let wakeBusy = false;

async function syncWakeLock() {
  if (wakeBusy || !('wakeLock' in navigator)) return;
  wakeBusy = true;
  try {
    const want = settings.get('wakeLock') && !document.hidden && Array.from(holders.values()).some(Boolean);
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; } finally { wakeBusy = false; }
}
document.addEventListener('visibilitychange', syncWakeLock);
settings.on((key) => { if (key === 'wakeLock') syncWakeLock(); });

/** Tell the wake lock whether a named timer is currently running. */
export function holdAwake(name, running) {
  holders.set(name, Boolean(running));
  syncWakeLock();
}
