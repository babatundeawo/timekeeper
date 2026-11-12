/* Theme: follows the system until the person chooses light or dark. */

import { store } from './core.js';

const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
const originals = metas.map((m) => m.getAttribute('content'));
const COLORS = { light: '#f5f4f0', dark: '#0c0e11' };
const listeners = new Set();

export function getChoice() {
  const stored = store.get('theme', null);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function effectiveTheme() {
  const choice = getChoice();
  if (choice !== 'system') return choice;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paint(choice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
    metas.forEach((m, i) => m.setAttribute('content', originals[i]));
  } else {
    root.setAttribute('data-theme', choice);
    metas.forEach((m) => m.setAttribute('content', COLORS[choice]));
  }
}

export function setChoice(choice) {
  if (choice === 'system') store.remove('theme'); else store.set('theme', choice);
  paint(choice);
  listeners.forEach((fn) => fn(choice));
}

export function onThemeChange(fn) { listeners.add(fn); }

if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const follow = () => { if (getChoice() === 'system') listeners.forEach((fn) => fn('system')); };
  if (mq.addEventListener) mq.addEventListener('change', follow);
}

paint(getChoice());
