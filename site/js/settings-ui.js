/* The settings dialog: binds every control to the shared settings store. */

import { $, store, settings, toast } from './core.js';
import { TONES, NOISES, playTone, unlockAudio } from './audio.js';
import { getChoice, setChoice, onThemeChange } from './theme.js';

const dialog = $('settingsDialog');
const themeButtons = Array.from(document.querySelectorAll('[data-theme-choice]'));

function fillSelect(select, options) {
  for (const [value, label] of Object.entries(options)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}
fillSelect($('setTone'), Object.fromEntries(Object.entries(TONES).map(([id, t]) => [id, t.label])));
fillSelect($('optNoise'), NOISES);

function syncTheme() {
  const choice = getChoice();
  themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
}
themeButtons.forEach((b) => b.addEventListener('click', () => setChoice(b.dataset.themeChoice)));
onThemeChange(syncTheme);
syncTheme();

/* Controls that map one-to-one onto a setting. */
const bindings = [
  ['setSound', 'sound', 'checked'],
  ['setVolume', 'volume', 'value', Number],
  ['setTone', 'tone', 'value'],
  ['setVibrate', 'vibrate', 'checked'],
  ['setWake', 'wakeLock', 'checked'],
  ['set24h', 'clock24h', 'checked'],
  ['setSnooze', 'snooze', 'value', Number],
  ['optAuto', 'autoStart', 'checked'],
  ['optNoise', 'noise', 'value'],
];

function pull() {
  for (const [id, key, prop] of bindings) $(id)[prop] = settings.get(key);
  $('soundToggle').setAttribute('aria-pressed', String(!settings.get('sound')));
  $('soundToggle').setAttribute('aria-label', settings.get('sound') ? 'Mute sound' : 'Unmute sound');
}

for (const [id, key, prop, cast] of bindings) {
  $(id).addEventListener('change', (e) => settings.set(key, cast ? cast(e.target[prop]) : e.target[prop]));
}
$('setVolume').addEventListener('input', (e) => settings.set('volume', Number(e.target.value)));
settings.on(pull);
pull();

$('soundToggle').addEventListener('click', () => {
  settings.set('sound', !settings.get('sound'));
  toast(settings.get('sound') ? 'Sound on' : 'Sound muted');
});

$('setTest').addEventListener('click', () => {
  unlockAudio();
  playTone(settings.get('tone'), { force: true });
});

if (!('vibrate' in navigator)) $('setVibrateRow').hidden = true;
if (!('wakeLock' in navigator)) $('setWakeRow').hidden = true;

/* ---------- Notifications ---------- */

const notifBtn = $('setNotifBtn');
const notifStatus = $('setNotifStatus');
function syncNotifications() {
  if (!('Notification' in window)) {
    $('setNotifRow').hidden = true;
    return;
  }
  const p = Notification.permission;
  notifStatus.textContent = p === 'granted' ? 'On' : p === 'denied' ? 'Blocked in browser settings' : 'Off';
  notifBtn.hidden = p !== 'default';
}
notifBtn.addEventListener('click', async () => {
  try { await Notification.requestPermission(); } catch { /* ignored */ }
  syncNotifications();
});
syncNotifications();

/* ---------- Reset ---------- */

let resetTimer = 0;
$('setReset').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (btn.dataset.armed !== 'true') {
    btn.dataset.armed = 'true';
    btn.textContent = 'Tap again to erase everything';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Erase all saved data'; }, 4000);
    return;
  }
  store.clearAll();
  location.reload();
});

/* ---------- Open and close ---------- */

export function openSettings() {
  syncNotifications();
  pull();
  if (!dialog.open) dialog.showModal();
}
$('settingsBtn').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
