# Customizing

Edit any file on github.com with the pencil icon, then **Commit changes**.

| To change | File | What to edit |
| --- | --- | --- |
| Colors | `site/css/style.css` | The variables at the top: `--paper`, `--ink`, `--brass`, `--patina`. Dark mode has its own copies further down (look for `data-theme="dark"`). |
| Fonts | `.github/workflows/deploy.yml` and `site/css/style.css` | Fonts are downloaded during the build into `fonts/`. To change them, edit the font steps in the workflow and the `@font-face` rules at the top of the stylesheet. |
| Text | `site/index.html` | Button labels, hints and the footer line. Page title and description are near the top. |
| Default timer presets | `site/js/countdown.js` | `DEFAULT_PRESETS` near the top, in minutes. |
| Quick-add world clocks | `site/js/clock.js` | `QUICK_ZONES`, pairs of a time zone name (like `Africa/Lagos`) and the label shown on the button. |
| Alarm and timer sounds | `site/js/audio.js` | `TONES`. Each note has a pitch in hertz, a start time and a length. |
| Starting settings (sound, volume, snooze) | `site/js/core.js` | `DEFAULTS`. These only apply to people who have not changed the setting yet. |
| Icons and logo | `site/icons/` | Replace `favicon.svg` and the PNG files with the same names and sizes. |
| Social preview image | `site/icons/og-image.png` | Replace with a 1200 by 630 image. |
| Install-prompt screenshots | `site/screenshots/` | `wide.png` is 1280 by 720 and `narrow.png` is 780 by 1688. |

Keep `--brass-text` dark enough to read on `--paper`; it is used for small text.

If you add a new `.js` or `.css` file, also add it to the `ASSETS` list at the top of `site/service-worker.js`. The deploy checks stop and tell you if you forget, because the file would be missing when offline.
