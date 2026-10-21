# Cube Tac-Toe

Tic-tac-toe played on a 3-D Rubik's cube. Two players share one screen.
Each turn you **place a mark** on any empty square of any face, then you
**must twist one face** a quarter turn. Marks ride along with their stickers,
so a twist can build (or wreck) a line on a neighbouring face.

The whole thing is a static site: `index.html`, `style.css`, `app.js`
(Three.js rendering + UI) and `game.js` (pure game logic, unit-tested).
Three.js is vendored under `vendor/`, so there is no build step and no CDN.

## Rules

- X goes first. Click a square on the cube, or on the unfolded map in the side panel.
- After placing, pick a face (named by its centre colour) and a direction (↺ / ↻ as seen looking at that face).
- Three in a row, column or diagonal on any single face wins. Lines are checked after each placement and after each twist.
- If your twist hands your opponent a line and not you, they win. If it makes lines for both, the player who twisted wins.
- Undo (or Ctrl/Cmd+Z) takes back the last action. Scores and names are remembered in the browser.

## Run locally

```sh
python3 -m http.server 8080      # or any static file server
# open http://localhost:8080
```

Tests (Node 18+):

```sh
npm test
```

## Share it with Cloudflare

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
