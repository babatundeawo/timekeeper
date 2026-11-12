// Browser smoke test: serves the built site under /timekeeper/ (the way GitHub Pages does),
// opens it in real Chrome and exercises the features that matter.
//   node scripts/smoke-test.mjs [folder]
// Needs playwright-core and Chrome. Set CHROME_PATH to use a specific Chrome binary.
import { serve } from './serve.mjs';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const folder = process.argv[2] || 'site';
const { server, port } = await serve(folder);
const BASE = `http://127.0.0.1:${port}/timekeeper/`;
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--no-sandbox'],
});

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ok    ${name}`); } catch (e) { failed += 1; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').slice(0, 3).join('\n        ')}`); }
}
const assert = (cond, message) => { if (!cond) throw new Error(message); };

/** Opens a fresh page. Errors are collected; missing font files are ignored (they are fetched at build time). */
async function open({ viewport = { width: 390, height: 844 }, init, clock, url = BASE, scheme = 'light', sw = 'block', context = {} } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: sw, acceptDownloads: true, ...context });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/\/fonts\//.test(r.url())) page.errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  if (init) await page.addInitScript(init);
  if (clock) await page.clock.install({ time: clock });
  await page.goto(url);
  await page.waitForSelector('html.is-ready', { timeout: 5000 }).catch(() => {});
  return page;
}
const text = (page, sel) => page.locator(sel).first().innerText();
const done = (page) => page.context().close();

console.log(`Smoke test against ${BASE}`);

await test('loads under the /timekeeper/ subpath with no errors', async () => {
  const page = await open();
  await page.waitForTimeout(600);
  assert(page.errors.length === 0, page.errors.join('; '));
  assert((await page.title()).startsWith('Timekeeper'), 'title missing');
  await done(page);
});

await test('offline.html renders without CSP violations', async () => {
  for (const file of ['offline.html']) {
    const page = await open({ url: BASE + file });
    await page.waitForTimeout(300);
    assert(page.errors.length === 0, `${file}: ${page.errors.join('; ')}`);
    await done(page);
  }
});

await test('service worker caches the app and it opens while offline', async () => {
  const page = await open({ sw: 'allow' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0);
  const cached = await page.evaluate(async () => {
    const [name] = await caches.keys();
    return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
  });
  for (const file of ['js/main.js', 'js/core.js', 'css/style.css', 'offline.html']) {
    assert(cached.some((p) => p.endsWith(file)), `${file} was not precached`);
  }
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForSelector('html.is-ready');
  assert((await page.title()).startsWith('Timekeeper'), 'app did not open offline');
  assert(await page.locator('#offlineBar').isVisible(), 'offline notice not shown');
  await done(page);
});

await test('analog second hand never sweeps backwards across :59 to :00', async () => {
  const page = await open({ clock: new Date('2026-11-10T10:00:57') });
  const angles = [];
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(1000);
    angles.push(await page.evaluate(() => parseFloat(document.getElementById('handSecond').style.transform.replace(/[^-\d.]/g, ''))));
  }
  for (let i = 1; i < angles.length; i++) assert(angles[i] >= angles[i - 1], `hand moved backwards: ${angles.join(', ')}`);
  await done(page);
});

await test('world clocks: add, persist across reload, remove', async () => {
  const page = await open();
  await page.fill('#tzInput', 'Asia/Tokyo');
  await page.click('#tzAddBtn');
  assert((await page.locator('.world-row').count()) === 2, 'Tokyo row not added');
  assert((await text(page, '.world-row:nth-child(2) .world-name')) === 'Tokyo', 'wrong name');
  await page.fill('#tzInput', 'Not/AZone');
  await page.click('#tzAddBtn');
  assert((await text(page, '#tzError')).length > 0, 'no error for a bad zone');
  await page.reload();
  assert((await page.locator('.world-row').count()) === 2, 'zone not saved');
  await page.click('.world-row:nth-child(2) .icon-remove');
  assert((await page.locator('.world-row').count()) === 1, 'zone not removed');
  await done(page);
});

await test('timer: counts down, survives a reload, finishes with the pulse', async () => {
  const page = await open();
  await page.click('#tab-countdown');
  await page.fill('#cdMinutes', '0');
  await page.fill('#cdSeconds', '4');
  await page.dispatchEvent('#cdSeconds', 'change');
  assert((await text(page, '#digitsMain')) === '00:04', 'duration not applied');
  await page.click('#startBtn');
  await page.waitForTimeout(1300);
  assert((await text(page, '#digitsMain')) !== '00:04', 'did not count down');
  await page.reload();
  assert((await text(page, '#startBtn')) === 'Pause', 'running timer was lost on reload');
  await page.waitForFunction(() => document.getElementById('digitsMain').textContent === '00:00', null, { timeout: 6000 });
  assert(/up/i.test(await text(page, '#subLabel')), 'no "time is up" label');
  assert(await page.locator('#digits.pulse').count() === 1, 'finished pulse missing');
  await done(page);
});

await test('timer: "until a time" and shared links', async () => {
  const page = await open();
  await page.click('#tab-countdown');
  await page.click('#cdModeUntil');
  const target = await page.evaluate(() => { const d = new Date(Date.now() + 125000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
  await page.fill('#cdUntil', target);
  await page.dispatchEvent('#cdUntil', 'change');
  const shown = await text(page, '#digitsMain');
  assert(/^0[0-3]:\d\d$/.test(shown), `until time showed ${shown}`);
  await done(page);
  const linked = await open({ url: BASE + '?mode=countdown&t=90' });
  assert((await text(linked, '#digitsMain')) === '01:30', 'shared link duration not applied');
  await done(linked);
});

await test('stopwatch: ring is visible, laps work, state survives a reload', async () => {
  const page = await open();
  await page.click('#tab-stopwatch');
  const stroke = await page.evaluate(() => document.getElementById('ringProgress').style.stroke);
  assert(stroke.includes('ringGradPatina'), `stopwatch ring stroke is ${stroke}`);
  assert(await page.evaluate(() => !!document.getElementById('ringGradPatina')), 'gradient definition missing');
  await page.click('#startBtn');
  await page.waitForTimeout(700);
  await page.click('#lapBtn');
  await page.waitForTimeout(400);
  await page.click('#lapBtn');
  assert((await page.locator('.lap-row').count()) === 2, 'laps not recorded');
  await page.reload();
  assert((await text(page, '#startBtn')) === 'Pause', 'running stopwatch lost on reload');
  assert((await page.locator('.lap-row').count()) === 2, 'laps lost on reload');
  await done(page);
});

await test('focus: a phase that ended while closed is logged; CSV export works', async () => {
  const page = await open({
    init: () => {
      if (!localStorage.getItem('tk:focus')) {
        localStorage.setItem('tk:focus', JSON.stringify({ phase: 'focus', round: 1, total: 1500, remaining: 1500, endAt: Date.now() - 5000, task: 'Write report' }));
      }
    },
  });
  await page.click('#tab-pomodoro');
  assert((await text(page, '#statSessions')) === '1', `sessions ${await text(page, '#statSessions')}`);
  assert((await text(page, '#statToday')) === '25 min', `today ${await text(page, '#statToday')}`);
  assert(/short break/i.test(await text(page, '#subLabel')), 'did not advance to the short break');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportStatsBtn')]);
  const body = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  assert(body.includes('Write report') && body.startsWith('Date,Time,Minutes,Task'), 'CSV content wrong');
  await done(page);
});

await test('alarm rings at the right minute, snooze survives, dialog traps focus', async () => {
  const page = await open({ clock: new Date('2026-11-10T10:00:00') });
  await page.click('#tab-alarms');
  await page.fill('#alarmTime', '10:01');
  await page.fill('#alarmLabel', 'Stand up');
  await page.click('#addAlarmBtn');
  assert((await page.locator('.alarm-row').count()) === 1, 'alarm not added');
  await page.clock.runFor(62000);
  assert(await page.locator('#alarmRingOverlay[open]').count() === 1, 'alarm dialog did not open');
  assert((await text(page, '#alarmRingLabel')) === 'Stand up', 'wrong alarm label');
  await page.click('#alarmSnoozeBtn');
  assert(await page.locator('#alarmRingOverlay[open]').count() === 0, 'dialog did not close');
  assert(await page.evaluate(() => !!localStorage.getItem('tk:snooze')), 'snooze not saved');
  await page.clock.runFor(5 * 60000 + 3000);
  assert(await page.locator('#alarmRingOverlay[open]').count() === 1, 'snoozed alarm did not ring again');
  await page.click('#alarmStopBtn');
  await done(page);
});

await test('settings: theme, 24-hour clock and sound persist across reloads', async () => {
  const page = await open();
  await page.click('#settingsBtn');
  await page.click('[data-theme-choice="dark"]');
  assert((await page.getAttribute('html', 'data-theme')) === 'dark', 'dark theme not applied');
  await page.check('#set24h');
  await page.uncheck('#setSound');
  await page.click('#settingsClose');
  assert(!/AM|PM/.test(await text(page, '#clockDigital')), 'clock still shows AM/PM');
  await page.reload();
  assert((await page.getAttribute('html', 'data-theme')) === 'dark', 'theme lost on reload');
  assert((await page.getAttribute('#soundToggle', 'aria-pressed')) === 'true', 'mute lost on reload');
  await done(page);
});

await test('keyboard: number keys switch modes, Space starts and pauses', async () => {
  const page = await open({ viewport: { width: 1280, height: 800 } });
  await page.keyboard.press('3');
  assert((await page.getAttribute('#tab-stopwatch', 'aria-selected')) === 'true', 'key 3 did not open the stopwatch');
  await page.keyboard.press('Space');
  assert((await text(page, '#startBtn')) === 'Pause', 'Space did not start');
  await page.keyboard.press('Space');
  assert((await text(page, '#startBtn')) === 'Resume', 'Space did not pause');
  await done(page);
});

await test('damaged saved data never breaks the app', async () => {
  const page = await open({
    init: () => {
      for (const k of ['countdown', 'stopwatch', 'focus', 'alarms', 'settings', 'worldZones', 'focusLog', 'snooze', 'countdownPresets', 'pomoSettings']) {
        localStorage.setItem('tk:' + k, k.length % 2 ? '{broken' : '"nonsense"');
      }
    },
  });
  for (const mode of ['countdown', 'stopwatch', 'pomodoro', 'alarms', 'clock']) await page.click(`#tab-${mode}`);
  assert(page.errors.length === 0, page.errors.join('; '));
  await done(page);
});

await test('no horizontal scroll and no layout overflow at 320, 375, 768, 1280 and 1920 px', async () => {
  for (const width of [320, 375, 768, 1280, 1920]) {
    const page = await open({ viewport: { width, height: width < 700 ? 700 : 900 } });
    for (const mode of ['clock', 'countdown', 'stopwatch', 'pomodoro', 'alarms']) {
      await page.click(`#tab-${mode}`);
      await page.waitForTimeout(120);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(over <= 0, `${mode} at ${width}px overflows by ${over}px`);
    }
    await done(page);
  }
});

await test('every button, input and select has an accessible name', async () => {
  const page = await open();
  const unnamed = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, input, select, textarea')) {
      if (el.type === 'hidden') continue;
      const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
        || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label')
        || el.textContent.trim() || el.getAttribute('title');
      if (!label) out.push(el.id || el.className || el.tagName);
    }
    return out;
  });
  assert(unnamed.length === 0, `unnamed controls: ${unnamed.join(', ')}`);
  await done(page);
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} check${failed === 1 ? '' : 's'} failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
