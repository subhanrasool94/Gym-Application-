# FitTrack Pro — offline app (PWA)

A completely offline fitness tracker. After a one-time setup, it installs to your
Home Screen and runs with no internet. All data stays on your device (saved
automatically), with no account and no cloud.

## What's in this folder
- `index.html` — the app
- `app.js`, `style.css` — app code and styling
- `manifest.json`, `service-worker.js` — what makes it installable + offline
- `icons/` — app icons

Keep all files together. The app needs to be opened from a web address **once**
(http or https) so your phone can install it. After installing, it works offline.

---

## Option A — iPhone, easiest (GitHub Pages, free)
1. Go to github.com and sign up (free).
2. Create a new **public** repository (any name, e.g. `fittrack`).
3. Click **Add file → Upload files** and upload ALL the files in this folder,
   keeping the `icons` folder. Commit.
4. Go to **Settings → Pages**. Source: **Deploy from a branch**, branch **main**,
   folder **/(root)**. Save.
5. Wait ~1 minute, refresh. You'll get a link like
   `https://yourname.github.io/fittrack/`.
6. Open that link **in Safari** on your iPhone.
7. Tap the **Share** icon → **Add to Home Screen**.
8. Open it from the new icon. Done — it now runs offline.

## Option B — No internet at all (your PC over Wi-Fi)
Your phone and PC must be on the same Wi-Fi.
1. On your PC, open this folder in a terminal/command prompt.
2. Run:  `python -m http.server 8000`
   (Windows: install Python from python.org first, then run the same command.)
3. Find your PC's local IP (Windows: run `ipconfig`, look for IPv4, e.g.
   192.168.1.20).
4. On your iPhone Safari, go to:  `http://192.168.1.20:8000`
5. Tap **Share → Add to Home Screen**. Open from the icon.
   After this first load it's cached on the phone and works with the PC off.

## Option C — Windows desktop app
1. Run `python -m http.server 8000` in this folder.
2. Open `http://localhost:8000` in Chrome or Edge.
3. Click the **Install** icon in the address bar. It becomes a desktop app.

---

## Your data & backups
- Data saves automatically on the device, the moment you change anything.
- It is NOT lost by restarting, closing the app, or going offline.
- It CAN be lost if you delete the app or fully clear Safari's website data.
- So: every week or two, open **Reports → JSON backup** and save the file to
  iCloud or Files. To restore (new phone, reinstall), use **Reports → Restore backup**.
The app will gently remind you to back up.
