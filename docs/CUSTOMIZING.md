# Customizing

Edit any file on github.com with the pencil icon, then **Commit changes**.

| To change | File | What to edit |
| --- | --- | --- |
| Colors | `site/css/style.css` | The variables at the top: `--paper`, `--ink`, `--brass`, `--patina`. Dark mode has its own copies further down. |
| Fonts | `site/index.html` and `site/css/style.css` | Replace the Google Fonts link in `index.html`, then update `--font-display`, `--font-body` and `--font-mono` in the stylesheet. |
| Text | `site/index.html` | Button labels, hints and the footer line. Page title and description are near the top. |
| Default timer presets | `site/js/app.js` | `DEFAULT_PRESETS` in the Countdown section, in minutes. |
| Icons and logo | `site/icons/` | Replace `favicon.svg` and the PNG files with the same names and sizes. |
| Social preview image | `site/icons/og-image.png` | Replace with a 1200 by 630 image. |

Keep `--brass-text` dark enough to read on `--paper`; it is used for small text.
