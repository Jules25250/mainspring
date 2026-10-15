# Mainspring

Julian's personal watch-news reader. It collects the day's stories from 13 watch publications, groups the ones covering the same watch, shows each story's cover photo, and learns what you like.

It runs for free on GitHub:

- **GitHub Pages** hosts the app at `https://YOUR-USERNAME.github.io/mainspring/`.
- **A GitHub job** (`refresh.yml`) reads the feeds every two hours and saves new stories into `feed.json`.

Your likes, passes and saves are stored on your phone only. The link is public, but nobody finds it unless you share it.

## Setup (about 10 minutes, on a computer)

1. **Create a free GitHub account** at github.com/signup.
2. **Create the repository.** Click **+** (top right) → **New repository**. Name it `mainspring`, choose **Public**, then **Create repository**.
3. **Upload the app.** On the new, empty repository page, click **uploading an existing file**. Open the unzipped `mainspring` folder, select every file in it, and drag them onto the page. Click **Commit changes**.
4. **Add the refresh job.** Click **Add file** → **Create new file**.
   - In the name box, type `.github/workflows/refresh.yml`. Typing each `/` creates a folder.
   - Open `refresh.yml` from the folder, copy all of it, and paste it into the large text box.
   - Click **Commit changes**.
5. **Turn on the website.** Go to **Settings** → **Pages**. Under *Build and deployment*, set **Source** to **Deploy from a branch** and **Branch** to **main**, folder **/ (root)**. Click **Save**. After a minute or two the address appears at the top of that page.
6. **Run the first refresh.** Open the **Actions** tab → **Refresh feeds** → **Run workflow**. It takes about two minutes. This first run also finds the cover photos for the stories already in the app.
7. **Put it on your iPhone.** Open the address in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.

From then on it refreshes itself every two hours.

## Day to day

- **Add or remove a publication:** edit `feeds.json` on GitHub. Each entry needs a key, a name and a feed address. You can also hide a publication on your phone under **Taste → Publications**.
- **Refresh now:** **Actions** → **Refresh feeds** → **Run workflow**.
- **Something stopped updating:** open **Actions** and look for a red run; click it to see the error. GitHub pauses scheduled jobs in repositories with no activity for 60 days. This one saves new stories every run, so that shouldn't happen. If it does, click **Enable workflow**.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The app |
| `feed.json` | The stories, rewritten by the refresh job |
| `feeds.json` | The list of publications and what to skip from each |
| `fetch.mjs` | The refresh job's code |
| `.github/workflows/refresh.yml` | The two-hourly schedule |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Make it work as a home-screen app, including offline |
| `package.json`, `package-lock.json` | The one library the refresh job uses |

The stories already in the app when you set it up carry short summaries written by Claude. New stories show the publication's own teaser instead.
