/* The shared stage: one brass ring and readout reused by every mode. */

import { $ } from './core.js';

const RADIUS = 138;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const el = {
  stage: $('stage'),
  ringWrap: $('ringWrap'),
  ring: $('ringProgress'),
  tick: $('ringTick'),
  digits: $('digits'),
  main: $('digitsMain'),
  cs: $('digitsCs'),
  sub: $('subLabel'),
  start: $('startBtn'),
  reset: $('resetBtn'),
  lap: $('lapBtn'),
  addMinute: $('addMinuteBtn'),
  dots: $('sessionDots'),
  focusTask: $('focusTask'),
  clockMeta: $('clockMeta'),
  transport: $('transport'),
};

el.ring.style.strokeDasharray = String(CIRCUMFERENCE);

export const view = { mode: 'clock' };
export const isActive = (mode) => view.mode === mode;

/** fraction: 0 = empty ring, 1 = full ring. gradient: 'brass' or 'patina'. */
export function setRing(fraction, gradient = 'brass') {
  const f = Math.min(1, Math.max(0, fraction));
  el.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - f));
  el.ring.style.stroke = `url(#ringGrad${gradient === 'patina' ? 'Patina' : 'Brass'})`;
}

export function setTick(fraction) {
  const f = Math.min(1, Math.max(0, fraction));
  el.tick.style.transform = `rotate(${f * 360}deg)`;
}

/** Shows the main digits and, optionally, a smaller hundredths tail. */
export function setDigits(main, tail = null) {
  if (el.main.textContent !== main) el.main.textContent = main;
  if (tail === null) {
    if (!el.cs.hidden) el.cs.hidden = true;
  } else {
    if (el.cs.hidden) el.cs.hidden = false;
    const text = '.' + tail;
    if (el.cs.textContent !== text) el.cs.textContent = text;
  }
}

export function setSub(text) {
  if (el.sub.textContent !== text) el.sub.textContent = text;
}

export function setStart(label, running) {
  if (el.start.textContent !== label) el.start.textContent = label;
  el.start.classList.toggle('is-running', running);
  el.start.setAttribute('aria-pressed', String(running));
}

export function pulse(on) {
  el.digits.classList.toggle('pulse', on);
}
