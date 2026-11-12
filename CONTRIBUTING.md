# Contributing

- **Report a bug or suggest an idea:** open an issue at https://github.com/babatundeawo/timekeeper/issues and say what you expected and what happened, including your browser and device.
- **Propose a change:** on GitHub, fork the repository, edit files with the pencil icon, and choose **Propose changes** to open a pull request. Automatic checks run on every pull request.

## Working on it locally

The site is plain static files with no build step, so any static file server works. Service workers and installation need `http://localhost` or HTTPS, and the checks expect the site under `/timekeeper/`, so use the bundled server:

```
node scripts/serve.mjs site /timekeeper/ 4173
```

Then open http://127.0.0.1:4173/timekeeper/.

Run the same checks as the deploy workflow:

```
node scripts/check-site.mjs site          # file, manifest and cache-list checks (no dependencies)
npm install --no-save playwright-core     # one-time, for the browser test
node scripts/smoke-test.mjs site          # drives every mode in real Chrome
node scripts/screenshots.mjs site         # refreshes site/screenshots and docs/assets/preview.png
```

## Code layout

Each mode is one ES module in `site/js/` (`clock.js`, `countdown.js`, `stopwatch.js`, `focus.js`, `alarms.js`). Shared code lives in `core.js` (storage, settings, the single tick loop, wake lock), `audio.js` (synthesized tones and background noise), `stage.js` (the shared ring and readout) and `pwa.js` (install, update and offline notices). `main.js` wires them together.

Timers store an end timestamp rather than counting ticks, so they stay correct across reloads, sleep and background tabs. Keep that property when changing them.

Keep changes small and focused, match the existing code style, and avoid adding runtime dependencies. The site's Content Security Policy blocks inline styles and scripts, so put them in the files under `css/` and `js/`.
