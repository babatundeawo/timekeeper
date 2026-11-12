# Deployment guide

Everything here uses only the GitHub website. You never need a terminal.

## How deployment works

Whenever a change lands on the `main` branch, GitHub automatically checks the site and publishes the `site` folder to GitHub Pages. The site address is `https://babatundeawo.github.io/timekeeper/`.

## One-time setup (do this before you merge the first redesign)

1. Open your repository on github.com.
2. Click **Settings** (top row of tabs).
3. In the left menu click **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.

You should see the Source box now read "GitHub Actions". The old setting published the repository root, and the redesign moves the site into the `site` folder, so skipping this step would leave the live site blank after merging.

Optional but recommended, in **Settings > Code security**: switch on **Dependabot alerts** and **Secret scanning** (and **Push protection** if offered). Each is a single toggle.

## Put the update online safely (GitHub Desktop)

1. Open **GitHub Desktop** and make sure the **timekeeper** repository is selected.
2. Click **Current Branch**, then **New Branch**, type a short name such as `update/my-change`, and click **Create Branch**.
3. Open the repository folder in File Explorer. In the **View** menu choose **Show > Hidden items**, so the `.github` folder is visible.
4. Extract the delivered ZIP into that folder. If Windows asks about existing files, choose **Replace the files in the destination**.
5. Back in GitHub Desktop you should see a list of changed files. Type a short description such as `Update timer presets` in the **Summary** box and click **Commit to** your branch name.
6. Click **Publish branch**, then **Create Pull Request**. This opens github.com.
7. On github.com click **Create pull request**. Wait for the checks to finish (green tick).

GitHub Pages cannot preview a pull request. To look at the build first, open the pull request's **Checks** tab, open the **Deploy** run and download the **built-site** artifact at the bottom of the run page. Or merge and roll back if you dislike it.

- To publish: click **Merge pull request > Confirm merge**.
- To discard: click **Close pull request**. Nothing on the live site changes.

## Check that a deployment worked

1. Click the **Actions** tab.
2. Open the latest run named **Deploy**.
3. A green tick means the site is live. A red cross means something failed.

The run also has a **Browser smoke test** step. It opens the site in a real browser and tries every mode. If it shows a yellow warning, the site is still published, but open the step and read it, because it names the feature that stopped working.

To read an error, click the red run, click the failed step (it has a red cross), and read the last lines. The message names the file and problem. If **Check links** fails, a link or file path in `index.html` or `manifest.json` points at something that does not exist.

## Update content

Open the file on github.com, click the pencil icon, edit, then **Commit changes**. Committing to `main` deploys automatically in about a minute. Visitors get a "New version is ready" prompt automatically after each deployment. You never need to edit the cache name.

## Roll back

1. Open **Pull requests > Closed**, and open the merged pull request.
2. Click **Revert** near the bottom, then **Create pull request**, then merge it.

The previous version is restored and redeployed. All earlier versions also stay in the repository history.

## Custom domain (optional)

1. In **Settings > Pages > Custom domain**, enter your domain and click **Save**.
2. At your domain provider, add a `CNAME` record pointing `www` to `babatundeawo.github.io`.
3. Tick **Enforce HTTPS** once it becomes available.
4. In **Settings > Secrets and variables > Actions > Variables**, add a variable named `SITE_BASE` with the value `/`. Then update the address in `site/index.html` (the `canonical` and `og:` lines), `site/robots.txt`, `site/sitemap.xml`.
