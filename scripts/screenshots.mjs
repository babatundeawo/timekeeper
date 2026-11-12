// Regenerates the install-prompt screenshots and the README preview from the real site.
//   node scripts/screenshots.mjs [folder]
import { serve } from './serve.mjs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const { server, port } = await serve(process.argv[2] || 'site');
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--no-sandbox'],
});
const url = `http://127.0.0.1:${port}/timekeeper/`;

async function shot(file, { viewport, scheme, scale, prepare }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale, serviceWorkers: 'block', timezoneId: 'Africa/Lagos', locale: 'en-GB' });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('tk:settings', JSON.stringify({ clock24h: true })));
  await page.goto(url);
  await page.waitForSelector('html.is-ready');
  await prepare(page);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(3000); // lets the confirmation toast fade out
  await page.screenshot({ path: file });
  await ctx.close();
}

const addZones = async (page) => {
  for (const tz of ['Europe/London', 'America/New_York', 'Asia/Tokyo']) {
    await page.fill('#tzInput', tz);
    await page.click('#tzAddBtn');
  }
};
const runFocus = async (page) => {
  await page.click('#tab-pomodoro');
  await page.fill('#focusTaskIn', 'Write the project brief');
  await page.dispatchEvent('#focusTaskIn', 'input');
  await page.click('#startBtn');
};

await shot('site/screenshots/wide.png', { viewport: { width: 1280, height: 720 }, scheme: 'dark', scale: 1, prepare: addZones });
await shot('site/screenshots/narrow.png', { viewport: { width: 390, height: 844 }, scheme: 'light', scale: 2, prepare: runFocus });
await shot('docs/assets/preview.png', { viewport: { width: 390, height: 844 }, scheme: 'dark', scale: 1, prepare: async (page) => { await addZones(page); } });

await browser.close();
server.close();
console.log('Screenshots written.');
