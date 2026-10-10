# Screen Companion (phase 3, design only)

Status: design document. Nothing here is implemented in Orbital v1, and Orbital itself never captures the screen.

## Goal

At the end of a day, Orbital can say something like "You spent about 2 hours in the backup project. Create a task? Log the time?", based on what was on screen. That way work that happened outside Orbital still counts and nothing has to be typed in afterwards.

Everything is a suggestion, it comes in one batch, and it never shows up live.

## Shape

- A separate repository, `orbital-companion`.
- A small native tray app on the host (Python with `pystray`, or Go with `systray`), started by the user.
- Orbital in Docker only receives text. It never sees images and never starts the capture itself.

```
host machine                                         Docker
┌────────────────────────────────────────────┐      ┌──────────────────────┐
│ orbital-companion (tray)                   │      │ Orbital              │
│  window title + app name   every 30 s      │      │                      │
│  screenshot                every 2 min     │ text │  POST /api/activity  │
│   └ perceptual hash unchanged? → drop      │ ───► │  (localhost only)    │
│   └ tesseract OCR → text                   │      │                      │
│   └ raw image deleted within 5 min         │      │  end of day: local   │
│  blocklist, pause hotkey, red indicator    │      │  LLM digest → review │
└────────────────────────────────────────────┘      └──────────────────────┘
```

## Capture pipeline (all local)

1. Every 30 s: active window title and application name.
2. Every 2 min: a screenshot of the active window.
   - Compute a perceptual hash (pHash). If it matches the previous one, drop the image.
   - Run local OCR (tesseract) and keep only the text.
   - Delete the raw image within 5 minutes, also after a crash (sweep on start).
3. Batch the text and titles and send them to `POST /api/activity` on `127.0.0.1`.
   - Authenticated with a per-user companion token created in Orbital settings.
   - The endpoint only accepts connections from the loopback interface.
4. Orbital stores activity text with a retention of 14 days and deletes older rows daily.

No vision model in the first version. Vision language models are only worth evaluating once the text pipeline has proven useful.

## End-of-day digest

- Runs once per day when the user opens Orbital (or presses "Review my day"), never in the background.
- Groups activity by project using titles and OCR text, using the configured local AI endpoint only.
- Output: a review list such as "About 2 h in <app or project>. Create a task? Log time?" with Accept, Edit and Discard per row.
- Tone rules apply: no shame, no exclamation marks, facts first. Idle time is not mentioned.

## Privacy controls (mandatory)

- Everything off by default. First run shows a consent screen that explains exactly what is captured, where it goes and how long it stays.
- A red recording indicator in the tray while capture is active.
- A global pause hotkey, plus "pause for 1 hour" and "pause until tomorrow" in the tray menu.
- Blocklists per app and per window-title pattern. Blocked windows are not captured at all, not even the title.
- A default blocklist that ships enabled:
  - password managers (1Password, Bitwarden, KeePass/KeePassXC, LastPass, Dashlane, Apple Passwords),
  - banking and payment (browser windows matching common bank and payment domains, banking apps),
  - mail clients (Outlook, Thunderbird, Apple Mail, mail web apps),
  - remote desktop and screen sharing (RDP, AnyDesk, TeamViewer, VNC, Parsec).
- Retention: activity text 14 days, raw images at most 5 minutes.
- One-click purge in the tray and in Orbital settings: deletes all activity text on both sides.
- Per-user: activity is stored under the Orbital user who owns the companion token. Admins cannot read other users' activity.

## Risks

- **Customer data on screen (GDPR).** OCR text can contain personal data of customers or patients (names, case numbers, health data). This is the main risk. Mitigations: default blocklist, per-window blocklist, short retention, no images stored, local processing only, purge button. Users who handle special-category data (Art. 9 GDPR) should keep the companion off or block the relevant apps.
- **Third parties on screen.** Video calls and chats show other people. Video conferencing apps should be on the default blocklist as well.
- **Misuse as surveillance.** The companion is a personal tool for one user on one machine. It must not be deployed to monitor employees. The README of `orbital-companion` states this, and the app refuses to run without the local user confirming the consent screen.
- **Leaks through the AI endpoint.** The digest sends activity text to the configured AI endpoint. Orbital already restricts this to the endpoint configured by the admin; the companion settings show that endpoint and warn if it is not on localhost or a private network.

## Open questions

- Windows and macOS first, Linux (X11/Wayland differ a lot) later?
- Should time logging become a proper Orbital feature (time entries per task) before the companion exists?
- How to map activity to projects without a model: keyword rules per project as a first step?
