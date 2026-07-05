# N-Back

A clean, ad-free **quad N-back** working-memory trainer. Installable PWA — runs
in the browser, installs to your phone's home screen, works offline. No accounts,
no tracking; all history stays in your browser's local storage.

## The game

Each turn one square in a 3×3 grid lights up showing a **colored digit**, and a
**letter is spoken**. That's four independent channels you can track at once:

- **Position** — which cell the square is in
- **Number** — the digit shown
- **Color** — the digit's color
- **Sound** — the spoken letter

Press a channel's button (or keys **A / S / D / F** on desktop) whenever the current
value matches the value from **N** turns ago. Score is *matches caught ÷ (matches +
false presses)*. Turn channels on/off, pick N, and set the pace from the home screen.
Adaptive N nudges the level up after a near-perfect block.

## Tech

Plain HTML/CSS/JS — no framework, no build step. Just static files plus a service
worker (`sw.js`) for offline caching and a web app manifest for install.

## Run locally

Serve the folder over HTTP (a service worker needs http/https, not `file://`):

```bash
python -m http.server 8080
# then open http://127.0.0.1:8080
```

## Deploy

Any static host works. It's deployed on Vercel; pushing to the linked GitHub repo
auto-deploys. When shipping changes, bump `CACHE` in `sw.js` so clients pick up the
new version.
