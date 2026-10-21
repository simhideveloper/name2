# Cube Tac-Toe

Tic-tac-toe played on the shape of a 3-D Rubik's cube. There are no colours
to solve: every square is the same green, all 54 start blank, and faces are named by position (Top,
Front, Right…). Two players share one screen. Each turn you **place a mark**
on any empty square of any face, then you **must twist one face** a quarter
turn. Marks ride along with their squares, so a twist can build (or wreck) a
line on a neighbouring face.

**Play it here: https://simhideveloper.github.io/name2/** (two people share one
screen; open it on a laptop or phone and pass the device, or screen-share it).

The whole thing is a static site: `index.html`, `style.css`, `app.js`
(Three.js rendering + UI) and `game.js` (pure game logic, unit-tested).
Three.js is vendored under `vendor/`, so there is no build step and no CDN.

## Layout

One fixed screen, designed for a phone first: a turn bar under the status bar
(clear of the Dynamic Island), the cube in the middle, and a control dock above
the home indicator that shows the map while you place and the layer controls
while you twist. Names, rules and install help live behind the ⋯ button. On
wide screens the bar and dock become a right-hand column.

## Rules

- X goes first. Click a square on the cube, or on the unfolded map in the side panel.
- After placing, twist any layer a quarter turn: one of the six faces (Top, Bottom, Front, Back, Left, Right; ↺ / ↻ as seen looking at that face) or one of the three middle slices, which turn in the same sense as the face they are named after. Centre squares move too, so face names refer to positions and float beside each face.
- Swipe across the cube with one finger or the mouse to twist the layer under it in that direction. Drag the background, or use two fingers, to move only the view.
- Three in a row, column or diagonal on any single face wins. Lines are checked after each placement and after each twist.
- If your twist hands your opponent a line and not you, they win. If it makes lines for both, the player who twisted wins.
- **Lock view** snaps the camera face-on to the nearest face and centres it. While locked, drag the background or swipe with two fingers to turn the whole cube to the next face (arrow keys work too), and use the bar under the cube to twist the face you are looking at.
- Undo (or Ctrl/Cmd+Z) takes back the last action. Scores and names are remembered in the browser.

## Install it as an app

The site is a Progressive Web App: it has a manifest, icons and a service
worker, so it can be installed and played offline.

- **Chrome or Edge (desktop and Android):** open the site, tap the ⋯ button, then
  *Install app*, or use the install icon at the right end of the address bar.
- **Safari on Mac:** File → Add to Dock.
- **Safari on iPhone or iPad:** Share → Add to Home Screen.

It then opens in its own window with the Cube Tac-Toe icon and keeps working
without a connection. Updates are picked up on the next online launch.

## Run locally

```sh
python3 -m http.server 8080      # or any static file server
# open http://localhost:8080
```

Tests (Node 18+):

```sh
npm test
```

## Hosting

**GitHub Pages (live now).** The `gh-pages` branch is served at
https://simhideveloper.github.io/name2/. The workflow in `.github/workflows/pages.yml`
mirrors the working branch onto `gh-pages` after every push, so the site updates itself.

## Share it with Cloudflare instead

**Option A — Cloudflare Pages (permanent URL, free).**
In the Cloudflare dashboard go to *Workers & Pages → Create → Pages → Connect to Git*,
pick this repository, leave the build command empty and set the output directory to `/`.
Every push then redeploys. Or, from a machine with a Cloudflare login:

```sh
npx wrangler pages deploy . --project-name cube-tac-toe
```

**Option B — Cloudflare quick tunnel (temporary URL, no account needed).**
Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and run:

```sh
./tunnel.sh
```

It serves the folder locally and prints a `https://<random>.trycloudflare.com` URL
that stays up while the script runs. Send that URL to your friend.
