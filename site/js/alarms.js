/* Alarms: repeat days, labels, choice of tone, snooze that survives reloads.
   Alarms only ring while Timekeeper is open, because a static site has no server to wake it. */

import { $, store, num, pad, toast, haptic, notify, announce, settings } from './core.js';
import { TONES, playTone, toneLength } from './audio.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_ALARMS = 30;

const timeIn = $('alarmTime');
const labelIn = $('alarmLabel');
const toneIn = $('alarmTone');
const listEl = $('alarmsList');
const dayButtons = Array.from(document.querySelectorAll('.day-chip'));
const overlay = $('alarmRingOverlay');
const overlayTime = $('alarmRingTime');
const overlayLabel = $('alarmRingLabel');

let list = (() => {
  const saved = store.get('alarms', []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((a) => a && typeof a.time === 'string' && /^\d{2}:\d{2}$/.test(a.time))
    .map((a) => ({
      id: num(a.id, Date.now()),
      time: a.time,
      label: typeof a.label === 'string' ? a.label.slice(0, 40) : '',
      days: Array.isArray(a.days) ? a.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      enabled: a.enabled !== false,
      tone: TONES[a.tone] ? a.tone : 'chime',
    }))
    .slice(0, MAX_ALARMS);
})();

const selectedDays = new Set();
let ringing = null;
let ringRepeat = 0;
let snooze = (() => {
  const s = store.get('snooze', null);
  return s && Number.isFinite(s.at) && typeof s.time === 'string' ? s : null;
})();
let lastChecked = Date.now();

function saveList() { store.set('alarms', list); }
function saveSnooze() { if (snooze) store.set('snooze', snooze); else store.remove('snooze'); }

export function fmtAlarmTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  if (settings.get('clock24h')) return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/* ---------- Tone picker ---------- */

for (const [id, tone] of Object.entries(TONES)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = tone.label;
  toneIn.append(option);
}
toneIn.value = settings.get('tone');

/* ---------- Ringing ---------- */

function ringOnce() {
  const length = playTone(ringing ? ringing.tone : 'chime');
  haptic([300, 150, 300]);
  return length;
}

function openRing(alarm) {
  ringing = { time: alarm.time, label: alarm.label, tone: alarm.tone || settings.get('tone') };
  overlayTime.textContent = fmtAlarmTime(alarm.time);
  overlayLabel.textContent = alarm.label || 'Alarm';
  if (!overlay.open) overlay.showModal();
  notify('Timekeeper alarm', `${fmtAlarmTime(alarm.time)}${alarm.label ? ' · ' + alarm.label : ''}`, 'alarm');
  announce(`Alarm. ${alarm.label || fmtAlarmTime(alarm.time)}`);
  ringOnce();
  clearInterval(ringRepeat);
  const gap = Math.round((toneLength(ringing.tone) + 1.2) * 1000);
  ringRepeat = setInterval(ringOnce, gap);
}

function closeRing() {
  clearInterval(ringRepeat);
  ringRepeat = 0;
  ringing = null;
  if (overlay.open) overlay.close();
}

$('alarmStopBtn').addEventListener('click', () => { haptic(); closeRing(); });
$('alarmSnoozeBtn').addEventListener('click', () => {
  haptic();
  const current = ringing;
  closeRing();
  if (!current) return;
  const minutes = settings.get('snooze');
  snooze = { at: Date.now() + minutes * 60000, ...current };
  saveSnooze();
  toast(`Snoozed for ${minutes} minutes`);
});
overlay.addEventListener('cancel', (e) => { e.preventDefault(); closeRing(); });

/* ---------- List ---------- */

function describe(alarm) {
  if (alarm.label) return alarm.label;
  return alarm.days.length ? alarm.days.map((d) => DAY_NAMES[d]).join(', ') : 'One time';
}

function render() {
  listEl.replaceChildren();
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = 'No alarms yet. Set a time above and press Add.';
    listEl.append(li);
    return;
  }
  list.slice().sort((a, b) => a.time.localeCompare(b.time)).forEach((alarm) => {
    const li = document.createElement('li');
    li.className = 'alarm-row' + (alarm.enabled ? '' : ' disabled');

    const info = document.createElement('div');
    info.className = 'alarm-info';
    const time = document.createElement('span');
    time.className = 'alarm-time';
    time.textContent = fmtAlarmTime(alarm.time);
    const label = document.createElement('span');
    label.className = 'alarm-label';
    const days = alarm.label && alarm.days.length ? ` · ${alarm.days.map((d) => DAY_NAMES[d]).join(', ')}` : '';
    label.textContent = `${describe(alarm)}${days} · ${TONES[alarm.tone].label}`;
    info.append(time, label);

    const controls = document.createElement('div');
    controls.className = 'alarm-controls';

    const toggle = document.createElement('button');
    toggle.className = 'switch' + (alarm.enabled ? ' on' : '');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(alarm.enabled));
    toggle.setAttribute('aria-label', `Alarm ${fmtAlarmTime(alarm.time)}${alarm.label ? ', ' + alarm.label : ''}`);
    toggle.addEventListener('click', () => {
      alarm.enabled = !alarm.enabled;
      saveList();
      render();
    });

    const remove = document.createElement('button');
    remove.className = 'icon-remove';
    remove.type = 'button';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Delete alarm ${fmtAlarmTime(alarm.time)}`);
    remove.addEventListener('click', () => {
      list = list.filter((a) => a.id !== alarm.id);
      saveList();
      render();
    });

    controls.append(toggle, remove);
    li.append(info, controls);
    listEl.append(li);
  });
}

dayButtons.forEach((btn) => btn.addEventListener('click', () => {
  const day = Number(btn.dataset.day);
  if (selectedDays.has(day)) selectedDays.delete(day); else selectedDays.add(day);
  btn.classList.toggle('active', selectedDays.has(day));
  btn.setAttribute('aria-pressed', String(selectedDays.has(day)));
  haptic();
}));

$('addAlarmBtn').addEventListener('click', () => {
  if (!timeIn.value) { toast('Pick a time first'); timeIn.focus(); return; }
  if (list.length >= MAX_ALARMS) { toast(`You can keep up to ${MAX_ALARMS} alarms`); return; }
  list.push({
    id: Date.now(),
    time: timeIn.value,
    label: labelIn.value.trim().slice(0, 40),
    days: Array.from(selectedDays).sort(),
    enabled: true,
    tone: toneIn.value,
  });
  saveList();
  labelIn.value = '';
  selectedDays.clear();
  dayButtons.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
  render();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  haptic();
  toast('Alarm added');
});

/* ---------- Checking ----------
   Looks at every minute boundary since the last check (up to 10), so an alarm
   still rings when the browser throttles a background tab. */

function check() {
  if (ringing) return;
  const nowMs = Date.now();
  if (snooze && nowMs >= snooze.at) {
    const due = snooze;
    snooze = null;
    saveSnooze();
    lastChecked = nowMs;
    openRing(due);
    return;
  }
  const start = Math.max(lastChecked, nowMs - 10 * 60 * 1000);
  lastChecked = nowMs;
  const cursor = new Date(start);
  cursor.setSeconds(0, 0);
  for (let t = cursor.getTime() + 60000; t <= nowMs; t += 60000) {
    const when = new Date(t);
    const hhmm = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
    const day = when.getDay();
    const due = list.find((a) => a.enabled && a.time === hhmm && (a.days.length === 0 || a.days.includes(day)));
    if (!due) continue;
    if (due.days.length === 0) { due.enabled = false; saveList(); render(); }
    openRing(due);
    return;
  }
}

setInterval(check, 1000);
settings.on((key) => { if (key === 'clock24h') render(); });

export const alarms = {
  onEnter() { toneIn.value = TONES[toneIn.value] ? toneIn.value : settings.get('tone'); render(); },
  onExit() { /* keep checking in the background */ },
  stopRinging() { if (ringing) closeRing(); },
  isRinging: () => ringing !== null,
};

render();
