/* Timekeeper entry point: modes, keyboard shortcuts, full screen and boot. */

import { $, store, haptic, settings } from './core.js';
import { unlockAudio } from './audio.js';
import './theme.js';
import * as stage from './stage.js';
import { clock } from './clock.js';
import { countdown } from './countdown.js';
import { stopwatch } from './stopwatch.js';
import { focus } from './focus.js';
import { alarms } from './alarms.js';
import { setChoice, effectiveTheme } from './theme.js';
import { markEngaged } from './pwa.js';
import { openSettings } from './settings-ui.js';

const controllers = { clock, countdown, stopwatch, pomodoro: focus, alarms };
const modes = Object.keys(controllers);
const tabs = Array.from(document.querySelectorAll('.switcher-item'));
const pill = $('switcherPill');
const { el } = stage;

/* ---------- Audio unlock on the first gesture ---------- */

function firstGesture() {
  unlockAudio();
  focus.refreshAudio();
}
document.addEventListener('pointerdown', firstGesture, { once: true });
document.addEventListener('keydown', firstGesture, { once: true });

/* ---------- Mode switching ---------- */

function positionPill() {
  const active = tabs.find((t) => t.dataset.mode === stage.view.mode);
  if (!active || !active.offsetWidth) return;
  pill.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  pill.style.width = `${active.offsetWidth}px`;
}

let previous = null;
function setMode(mode) {
  if (!controllers[mode]) mode = 'clock';
  if (previous && previous !== mode) controllers[previous].onExit?.();
  previous = mode;
  stage.view.mode = mode;
  store.set('mode', mode);

  // Hide the stage for one frame so the swap fades in instead of cutting.
  el.stage.classList.add('mode-switching');

  tabs.forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== mode; });

  el.transport.hidden = mode === 'clock' || mode === 'alarms';
  el.lap.hidden = mode !== 'stopwatch';
  el.addMinute.hidden = mode !== 'countdown';
  el.dots.hidden = mode !== 'pomodoro';
  el.focusTask.hidden = true;
  el.clockMeta.hidden = mode !== 'clock';
  el.ringWrap.className = `ring-wrap mode-${mode}`;
  el.stage.dataset.mode = mode;

  controllers[mode].onEnter();
  positionPill();
  requestAnimationFrame(() => requestAnimationFrame(() => el.stage.classList.remove('mode-switching')));
}

tabs.forEach((tab) => tab.addEventListener('click', () => { haptic(); setMode(tab.dataset.mode); }));
$('switcher').addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  const edge = { Home: 0, End: modes.length - 1 }[e.key];
  if (!step && edge === undefined) return;
  e.preventDefault();
  const index = edge !== undefined ? edge : (modes.indexOf(stage.view.mode) + step + modes.length) % modes.length;
  setMode(modes[index]);
  tabs[index].focus();
});
window.addEventListener('resize', positionPill);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionPill).catch(() => {});

/* ---------- Transport ---------- */

const usesTransport = () => !['clock', 'alarms'].includes(stage.view.mode);
el.start.addEventListener('click', () => { haptic(); markEngaged(); controllers[stage.view.mode].onStart?.(); });
el.reset.addEventListener('click', () => { haptic(); controllers[stage.view.mode].onReset?.(); });
el.lap.addEventListener('click', () => { haptic(); stopwatch.onLap(); });
el.addMinute.addEventListener('click', () => { haptic(); countdown.onAddMinute(); });

/* ---------- Header buttons ---------- */

$('themeToggle').addEventListener('click', () => {
  setChoice(effectiveTheme() === 'dark' ? 'light' : 'dark');
  haptic();
});

/* ---------- Full screen ---------- */

const fsBtn = $('fsBtn');
if (el.stage.requestFullscreen && document.fullscreenEnabled) {
  fsBtn.hidden = false;
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.stage.requestFullscreen().catch(() => {});
  };
  fsBtn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === el.stage;
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  });
  window.tkToggleFullscreen = toggle;
}

/* ---------- Keyboard shortcuts ---------- */

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const target = e.target;
  const tag = (target && target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
  const key = e.key.toLowerCase();
  const mode = stage.view.mode;

  if (e.code === 'Space' && usesTransport() && tag !== 'BUTTON') {
    e.preventDefault();
    markEngaged();
    controllers[mode].onStart?.();
  } else if (key === 'r' && usesTransport()) {
    controllers[mode].onReset?.();
  } else if (key === 'l' && mode === 'stopwatch') {
    stopwatch.onLap();
  } else if (key === 'f' && window.tkToggleFullscreen) {
    window.tkToggleFullscreen();
  } else if (key === 'm') {
    settings.set('sound', !settings.get('sound'));
  } else if (key === ',' || key === 's') {
    openSettings();
  } else if (key >= '1' && key <= '5') {
    setMode(modes[Number(key) - 1]);
  }
});

/* ---------- Boot ---------- */

const params = new URLSearchParams(location.search);
let initial = store.get('mode', 'clock');
const requested = params.get('mode');
if (requested && controllers[requested]) initial = requested;
if (initial === 'countdown' && params.has('t')) countdown.setFromLink(Number(params.get('t')));
setMode(controllers[initial] ? initial : 'clock');
document.documentElement.classList.add('is-ready');
