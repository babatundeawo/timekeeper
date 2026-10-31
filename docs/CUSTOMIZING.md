# Customizing

Edit any file on github.com with the pencil icon, then **Commit changes**.

| To change | File | What to edit |
| --- | --- | --- |
| Colors | `site/css/style.css` | The variables at the top: `--paper`, `--ink`, `--brass`, `--patina`. Dark mode has its own copies further down. |
| Fonts | `.github/workflows/deploy.yml` and `site/css/style.css` | Fonts are downloaded during the build into `fonts/`. To change them, edit the font steps in the workflow and the `@font-face` rules at the top of the stylesheet. |
| Text | `site/index.html` | Button labels, hints and the footer line. Page title and description are near the top. |
| Default timer presets | `site/js/app.js` | `DEFAULT_PRESETS` in the Countdown section, in minutes. |
| Icons and logo | `site/icons/` | Replace `favicon.svg` and the PNG files with the same names and sizes. |
| Social preview image | `site/icons/og-image.png` | Replace with a 1200 by 630 image. |

Keep `--brass-text` dark enough to read on `--paper`; it is used for small text.
