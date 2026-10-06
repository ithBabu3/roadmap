# .NET Full Stack Roadmap

```
dotnet-roadmap/
├── index.html              App shell (redirects to login.html if not signed in)
├── login.html              Username + password sign in / create account
├── community.html          Public leaderboard + shareable progress pages
├── manifest.webmanifest    PWA manifest (installable app)
├── sw.js                   Service worker (offline app shell)
├── icons/                  App icons
├── css/
│   ├── app.css             App styles
│   └── login.css           Login page + loading overlay styles
├── js/
│   ├── firebase-config.js  ← paste your Firebase web config here
│   ├── firebase-init.js    Firebase app, Auth and Firestore instances
│   ├── auth.js             Username/password auth (no email verification)
│   ├── cloud-store.js      Firestore storage + auto-save
│   ├── features.js         Streaks, goals, analytics, reminders, avatar, sharing, security
│   ├── community.js        Public profile read/write (opt-in)
│   ├── community-page.js   Leaderboard page logic
│   ├── pwa.js              Service worker registration + install prompt
│   ├── boot.js             Login guard → load data → start app
│   ├── login.js            Login page logic
│   └── app.js              The roadmap app itself
├── firestore.rules         Per-user security rules
├── firestore.indexes.json
└── firebase.json
```

## Quick start
```bash
npm install            # installs the Firebase CLI locally (once)
# 1. put your project ID in .firebaserc  (or run: npx firebase use --add)
# 2. paste your web config into js/firebase-config.js
npx firebase login     # use the Google account that owns the project
npm start              # http://localhost:8000
npm run deploy         # publish rules + hosting
```

## Setup
1. Firebase console → create a project → add a **Web app** → copy the config into `js/firebase-config.js`.
2. **Authentication → Sign-in method → enable Email/Password** (needed internally; users only see a username).
3. **Firestore Database → Create database**, then publish `firestore.rules`.
4. Serve over http (ES modules don't work from `file://`): `python3 -m http.server 8000` → http://localhost:8000, or `firebase deploy`.
5. Authentication → Settings → Authorized domains: add your hosting domain.

## How it works
- A username becomes `username@users.dotnet-roadmap.app` for Firebase Auth. No real email, no verification email is ever sent.
- All data is stored in Firestore under `users/{uid}`: every `dotnet_*` setting/note/progress key, plus uploaded images and PDFs (chunked). localStorage/IndexedDB are only a cache, cleared on sign out.
- Changes auto-save ~1.5s after they happen; unsaved changes survive a reload and are retried.
- First login on a browser that has data from the old local-only version uploads it to the new account (only if the account is empty).
- No email means no password reset link — reset or delete users in the Firebase console.

## UI refresh (latest)
- New design system (`css/app.css`): light + dark theme, gradient hero with progress ring, stat tiles, mobile bottom tab bar, slide-over notes drawer.
- One search box per tab (Roadmap, Docs Hub — covers Community + Resources, Interview Q&A). The old navbar search was removed.
- `js/ui.js` adds: dark mode, **Up next** card, collapsible weeks, Ctrl/⌘+K command palette, `/` to focus search, focus (Pomodoro) timer, milestone confetti, remembered tab.
- Password rule "must not contain your username" removed (`js/auth.js`).
- Fixed: Docs Hub section pills not updating when opening Curated Resources.

## New features
- **Streak & daily goal** – strip on the Roadmap tab; goal 1–5 days/day; toast when reached. Completion dates are tracked from now on (older days show as "before tracking").
- **Insights** (Profile tab) – weekly bar chart, 12-week heatmap, pace and projected finish date.
- **Reminders** – browser notifications at your chosen time if the goal isn't met. They fire while the app is open or installed and running; real background push would need Firebase Cloud Messaging + a Cloud Function.
- **Offline / PWA** – installable; app shell and Firestore data are cached, edits made offline sync on reconnect.
- **Avatar & accent colour**, **change password**, **delete account** (wipes Firestore data, public profile and login).
- **Leaderboard & share link** – opt-in; publishes only name, avatar, days done and streak to `publicProfiles/{username}`.

## Security hardening
- `firestore.rules`: owner-only private data, strict key/field/size validation, public profiles can only be written by their owner (username must match the login), list queries capped at 50, everything else denied.
- Login: password ≥ 8 chars with a number, strength meter, client-side lockout after 5 failures (exponential up to 15 min) on top of Firebase's own throttling.
- `firebase.json` hosting headers: CSP, X-Frame-Options, nosniff, referrer and permissions policies. Test the CSP once after deploying; loosen it if you add new third-party scripts.
- Firestore rules cannot rate-limit requests. For real abuse protection, turn on **Firebase App Check** (reCAPTCHA v3) in the console and enforce it for Firestore and Authentication.
- Deploy rules after updating: `firebase deploy --only firestore:rules,hosting`.
