# lolData Desktop

The lolData companion for League of Legends. It sits beside the client, reads
what the client already knows, and puts it where you can see it without
alt-tabbing.

- **Overview** — who you are, what the client is doing, the live scoreboard once
  a game starts.
- **Build** — saved builds per champion, imported from the site or from champion
  select, with runes applied in one press.
- **Matches** — your ranked and Clash games, each opening into a full scoreboard
  with every player's rank, damage and inventory.
- **Stats** — what your recent run actually says, honestly enough to say when the
  sample is too small to mean anything.
- **Capture** — records your games to disk, marks the kills, and cuts a moment
  out of one small enough to send to somebody.
- **Overlay** — ranks on the loading screen, objective warnings, the gold lead
  in the game's own HUD strip.

## Running it

```bash
bun install
bun run build      # compiles the renderer and the shell
bun start          # or: bun run dev, for the renderer with hot reload
```

Two processes in development: Vite on `:5199` and the Electron shell. `bun run
dev` starts both.

## How it is put together

```
shell/      the Electron main process — the only place that touches the client
src/lcu/    reading the League client: credentials, gameflow, match history
src/live/   the in-game Live Client Data API
src/data/   shared logic: champions, items, builds, objectives
src/renderer/  the interface
capture/    the recorder and the clipper, each in their own hidden window
```

⚠️ **The renderer never touches the client and never holds a credential.** It
receives one snapshot of state from the shell and asks the shell to act on its
behalf. That is what keeps the shell replaceable — and a surface that cannot
hold a credential cannot leak one.

## What it does not do

- **No injection.** The overlay is a transparent always-on-top window, not a
  hook into the game. That is the only approach Riot tolerates and the only one
  that survives Vanguard. The cost is that exclusive-fullscreen hides it;
  borderless is required.
- **No live coaching.** Riot's policy forbids reacting to live game state with
  advice. What the overlay shows is what you already knew before the game began.
- **No silent recording.** Capture is off until you turn it on, it records the
  League window only — never your whole screen — and the overlay says so at the
  start of every game. That notice cannot be switched off.

## Privacy

Nothing about your games is uploaded. Recordings and clips are files on your own
disk, in your AppData folder, and Settings → Capture says what they cost and
empties them. Signing in happens in your browser; this window has no field that
could take a password.

## Licence

All rights reserved. This source is published so the app can ship its updates
from GitHub Releases and so anyone can read what it does with their machine —
not as an invitation to redistribute it.
