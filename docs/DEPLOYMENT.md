# Deployment guide

Everything here uses only the GitHub website. You never need a terminal.

## How deployment works

Whenever a change lands on the `main` branch, GitHub automatically checks the site and publishes the `site` folder to GitHub Pages. The site address is `https://babatundeawo.github.io/timekeeper/`.

## One-time setup (do this before you merge the redesign)

1. Open your repository on github.com.
2. Click **Settings** (top row of tabs).
3. In the left menu click **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.

You should see the Source box now read "GitHub Actions". The old setting published the repository root, and the redesign moves the site into the `site` folder, so skipping this step would leave the live site blank after merging.

Optional but recommended, in **Settings > Code security**: switch on **Dependabot alerts** and **Secret scanning** (and **Push protection** if offered). Each is a single toggle.

## Put the redesign online safely

The live site does not change until you merge. To create the pull request from the delivered files:

1. On the repository home page click the branch button (it says **main**), type `rebrand/premium-redesign`, and click **Create branch: rebrand/premium-redesign**.
2. Make sure that branch is selected. Click **Add file > Upload files**.
3. Unzip the delivered `timekeeper-rebrand.zip` on your computer, then drag the folders and files inside it (`site`, `docs`, `.github`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.gitignore`, `.lighthouserc.json`) into the upload area. Dragging whole folders keeps their structure. If your computer hides the `.github` folder, enable "show hidden files" first.
4. Click **Commit changes** at the bottom. Choose **Commit directly to the rebrand/premium-redesign branch**.
5. Delete the old files that the redesign moved: open each of `css`, `js`, `icons`, `index.html`, `manifest.json`, `service-worker.js` and `gen_icons.py` in the **rebrand/premium-redesign** branch, click the three dots (**...**) at the top right of the file, choose **Delete file**, and commit to the same branch. For folders, delete each file inside; the folder disappears when empty.
6. Click **Pull requests > New pull request**, set **compare** to `rebrand/premium-redesign`, and click **Create pull request**.

You should see the checks run at the bottom of the pull request. A green tick means they passed.

## Review, then merge or discard

GitHub Pages cannot host a separate preview of a pull request. To review safely, read the **Files changed** tab, and open the **Checks** tab for the Lighthouse report link.

- To publish: finish the one-time setup above, then click **Merge pull request > Confirm merge**.
- To discard: click **Close pull request**. Nothing on the live site changes.

## Check that a deployment worked

1. Click the **Actions** tab.
2. Open the latest run named **Deploy**.
3. A green tick means the site is live. A red cross means something failed.

To read an error, click the red run, click the failed step (it has a red cross), and read the last lines. The message names the file and problem. If **Check links** fails, a link or file path in `index.html` or `manifest.json` points at something that does not exist.

## Update content

Open the file on github.com, click the pencil icon, edit, then **Commit changes**. Committing to `main` deploys automatically in about a minute. After changing any file under `site`, edit `service-worker.js` and change `timekeeper-v4` to `timekeeper-v5` (and so on) so returning visitors receive the update.

## Roll back

1. Open **Pull requests > Closed**, and open the merged pull request.
2. Click **Revert** near the bottom, then **Create pull request**, then merge it.

The previous version is restored and redeployed. All earlier versions also stay in the repository history.

## Custom domain (optional)

1. In **Settings > Pages > Custom domain**, enter your domain and click **Save**.
2. At your domain provider, add a `CNAME` record pointing `www` to `babatundeawo.github.io`.
3. Tick **Enforce HTTPS** once it becomes available.
4. Then update the address in `site/index.html` (the `canonical` and `og:` lines), `site/robots.txt`, `site/sitemap.xml`, and the `/timekeeper/` paths in `site/404.html`.
