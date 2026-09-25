# Timekeeper

A clock, countdown, stopwatch, focus timer, and alarms — one quiet instrument,
no build step, no dependencies beyond two Google Fonts. Paper-and-brass by
day, ink-and-brass by night, with one signature ring that every mode reuses
as its progress indicator.

## Modes

- **Clock** — live time with a date line underneath, optional 24-hour display.
  The ring sweeps once per minute like a slow watch bezel.
- **Countdown** — quick-start chips (5/10/15/25/45 min) plus a manual
  hr/min/sec entry. Save any custom duration as a new chip, or add a minute
  on the fly while it's running. Ring depletes as time runs out; a chime
  and a gentle pulse mark zero.
- **Stopwatch** — start/pause/reset with lap recording, most recent lap on top.
- **Focus (Pomodoro)** — configurable focus/short-break/long-break lengths
  and round count, with session dots showing where you are in the cycle.
  Auto-advances between phases.
- **Alarms** — set a time, an optional label, and optional repeat days.
  When one fires it takes over the screen with a repeating chime until you
  stop it or snooze for 5 minutes, plus a browser notification while the
  app is open.

## Interface niceties

- **Dark mode** — follows your system setting by default; the moon/sun
  button in the header overrides it and remembers your choice.
- **Sound toggle** — mute every chime and alarm from the header without
  touching your device's volume.
- **Keyboard shortcuts** (desktop) — `Space` start/pause, `R` reset, `L`
  lap (stopwatch), `1`–`5` jump between modes, `Esc`/`Enter` dismiss a
  ringing alarm.
- Light haptic feedback on supported touchscreens for the main actions.

All settings, presets, and alarms are saved to the browser's local storage,
so they persist between visits on the same device.

## Running it locally

No build step — it's plain HTML/CSS/JS. From the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. (Opening `index.html`
directly with `file://` also mostly works, but the service worker and
install prompt only activate over `http://` or `https://`.)

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `timekeeper`) and push this
   folder's contents to its `main` branch:

   ```bash
   cd timekeeper
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/timekeeper.git
   git push -u origin main
   ```

2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
4. After a minute, your site will be live at
   `https://<your-username>.github.io/timekeeper/`.

Everything in this project uses relative paths, so it works whether it's
served from a domain root or from a GitHub Pages project subpath.

## Installing on a PC (or phone)

Once it's live on `https://...github.io/...` (installability needs a real
HTTPS origin, not just a local file):

- **Chrome / Edge (Windows, macOS, Linux, ChromeOS):** open the site, then
  click the install icon in the address bar (or the **Install app** button
  in Timekeeper's own header), and confirm. It opens after that as its own
  windowed app with its own icon.
- **Safari (macOS):** File → Add to Dock.
- **Android / iOS:** browser menu → Add to Home Screen.

The service worker caches the app shell on first visit, so once installed
it also opens without a network connection — only the Clock and Alarms
lose meaning if the system clock can't be trusted, everything else keeps
timing correctly offline.

## Honest limitation on alarms

This is a static site with no server and no push notifications, so alarms
only fire while Timekeeper is actually open — a browser tab or the
installed window, in the foreground or backgrounded. There's no
Anthropic/Google-style push service behind it that can wake your PC when
the app is fully closed. If you need OS-level wake-the-machine alarms,
you'd need a native app or a system scheduler instead.

## File structure

```
timekeeper/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   └── app.js
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-512-maskable.png
    └── icon-180.png
```

## Design notes

Palette is ink (`#14161a`) and brass (`#b08d57`) on paper, with a deep navy
accent for anything that isn't focus/countdown-flavored (the stopwatch,
break phases); dark mode inverts to ink-toned paper with the same brass
and a lighter navy so both stay legible. Display type is Space Grotesk
with tabular figures for the big readout; IBM Plex Sans for labels; IBM
Plex Mono for timestamps and inputs, for an instrument-panel feel. The one
animated signature element — a brass-gradient ring that fills or depletes
around the digits, seated on a soft ambient glow — is reused, with
different meanings, across every mode, so the app stays visually
consistent while everything around it stays quiet. The mode switcher is a
segmented control with a sliding pill rather than a bare underline, panels
and lists fade in on entry, and buttons lift and spring on press — all
kept subtle enough not to fight the instrument-panel feel.
